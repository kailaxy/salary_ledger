#include "engine.h"
#include "query-grammar.h"
#include <chrono>
#include <memory>
#include <mutex>
#include <sstream>
#include <stdexcept>
#include <vector>
#include <unistd.h>
#include <sys/resource.h>
namespace bench {
using Clock=std::chrono::steady_clock;
static std::mutex model_mutex;static Engine *model_owner=nullptr;
static double elapsed(Clock::time_point start){return std::chrono::duration<double,std::milli>(Clock::now()-start).count();}
static bool abort_decode(void *p){return static_cast<Engine*>(p)->cancelled.load();}
static bool progress(float,void *p){return !static_cast<Engine*>(p)->cancelled.load();}
std::string quote(const std::string &s){std::string r="\"";for(unsigned char c:s){if(c=='"'||c=='\\'){r+='\\';r+=c;}else if(c<32){const char *h="0123456789abcdef";r+="\\u00";r+=h[c>>4];r+=h[c&15];}else r+=c;}return r+'"';}
Engine::~Engine(){unload();}
void Engine::clear_cache(){if(cached_context)llama_free(cached_context);cached_context=nullptr;cached_tokens.clear();cached_system.clear();}
void Engine::unload(){clear_cache();if(model){llama_model_free(model);model=nullptr;}std::lock_guard<std::mutex> lock(model_mutex);if(model_owner==this)model_owner=nullptr;}
double Engine::load(const std::string &path){
 unload();if(cancelled.load())throw std::runtime_error("CANCELLED");
 {std::lock_guard<std::mutex> lock(model_mutex);if(model_owner&&model_owner!=this)throw std::runtime_error("ENGINE_BUSY: previous benchmark session is still unloading; retry Load");model_owner=this;}
 std::unique_ptr<Engine,void(*)(Engine*)> lease(this,[](Engine *e){e->unload();});
 static std::once_flag backend;std::call_once(backend,[]{llama_log_set([](ggml_log_level,const char*,void*){},nullptr);llama_backend_init();});
 auto start=Clock::now();auto p=llama_model_default_params();p.n_gpu_layers=0;p.use_mmap=true;p.use_mlock=false;p.progress_callback=progress;p.progress_callback_user_data=this;
 model=llama_model_load_from_file(path.c_str(),p);
 if(cancelled.load()){unload();throw std::runtime_error("CANCELLED");}
 if(!model)throw std::runtime_error("MODEL_LOAD_FAILED: allocation or runtime failure; check available memory");
 lease.release();return elapsed(start);
}
std::string Engine::run(const Request &r){
 if(!model)throw std::runtime_error("MODEL_NOT_LOADED");
 if((r.context!=1024&&r.context!=2048)||r.threads<2||r.threads>4||r.max_output<1||r.max_output>128||r.temperature<0||r.temperature>1||r.system.size()>24000||r.user.empty()||r.user.size()>8000||r.seed<0)throw std::runtime_error("INVALID_REQUEST");
 if(cancelled.load())throw std::runtime_error("CANCELLED");
 auto start=Clock::now();const char *tmpl=llama_model_chat_template(model,nullptr);if(!tmpl)throw std::runtime_error("CHAT_TEMPLATE_MISSING");
 llama_chat_message messages[]={{"system",r.system.c_str()},{"user",r.user.c_str()}};
 std::vector<char> prompt((r.system.size()+r.user.size())*2+512);
 int n=llama_chat_apply_template(tmpl,messages,2,true,prompt.data(),prompt.size());
 if(n<0)throw std::runtime_error("CHAT_TEMPLATE_UNSUPPORTED");if(n>int(prompt.size())){prompt.resize(n);n=llama_chat_apply_template(tmpl,messages,2,true,prompt.data(),prompt.size());}
 if(n<0||n>int(prompt.size()))throw std::runtime_error("CHAT_TEMPLATE_FAILED");
 const llama_vocab *vocab=llama_model_get_vocab(model);int needed=llama_tokenize(vocab,prompt.data(),n,nullptr,0,true,true);
 if(needed>=0||needed==INT32_MIN)throw std::runtime_error("TOKENIZATION_FAILED");
 std::vector<llama_token> tokens(-needed);n=llama_tokenize(vocab,prompt.data(),n,tokens.data(),tokens.size(),true,true);
 if(n<=0)throw std::runtime_error("TOKENIZATION_FAILED");tokens.resize(n);
 if(n+r.max_output>r.context)throw std::runtime_error("CONTEXT_LIMIT: input="+std::to_string(n)+", reservedOutput="+std::to_string(r.max_output)+", context="+std::to_string(r.context)+"; no prompt was truncated");
 auto cp=llama_context_default_params();cp.n_ctx=r.context;cp.n_batch=128;cp.n_ubatch=64;cp.n_threads=r.threads;cp.n_threads_batch=r.threads;cp.offload_kqv=false;cp.no_perf=false;cp.abort_callback=abort_decode;cp.abort_callback_data=this;
 auto cs=Clock::now();
 if(!r.cache||cached_size!=r.context||cached_threads!=r.threads||cached_system!=r.system)clear_cache();
 bool reused=cached_context!=nullptr;
 if(!cached_context){cached_context=llama_init_from_model(model,cp);cached_size=r.context;cached_threads=r.threads;cached_system=r.system;}
 if(!cached_context)throw std::runtime_error("CONTEXT_ALLOCATION_FAILED");
 // Any failure or cancellation discards the context; only a completed run may retain it.
 bool retain=false;auto cleanup=[&](Engine*){if(!retain||!r.cache)clear_cache();};std::unique_ptr<Engine,decltype(cleanup)> cache_guard(this,cleanup);
 llama_context *ctx=cached_context;double init_ms=elapsed(cs);size_t prefix=0;
 if(reused){prefix=shared_prefix(cached_tokens,tokens);if(!llama_kv_cache_seq_rm(ctx,0,prefix,-1)){clear_cache();throw std::runtime_error("CACHE_RESET_FAILED");}}
 llama_perf_context_reset(ctx);
 auto sp=llama_sampler_chain_default_params();std::unique_ptr<llama_sampler,decltype(&llama_sampler_free)> sampler(llama_sampler_chain_init(sp),llama_sampler_free);
 if(!sampler)throw std::runtime_error("SAMPLER_ALLOCATION_FAILED");
 auto add_sampler=[&](llama_sampler *p){if(!p)throw std::runtime_error("SAMPLER_ALLOCATION_FAILED");std::unique_ptr<llama_sampler,decltype(&llama_sampler_free)> owned(p,llama_sampler_free);llama_sampler_chain_add(sampler.get(),p);owned.release();};
 if(r.grammar)add_sampler(llama_sampler_init_grammar(vocab,query_grammar,"root"));
 if(r.temperature==0)add_sampler(llama_sampler_init_greedy());
 else{add_sampler(llama_sampler_init_top_k(40));add_sampler(llama_sampler_init_top_p(0.9f,1));add_sampler(llama_sampler_init_temp(r.temperature));add_sampler(llama_sampler_init_dist(r.seed));}
 bool decoded=true;auto ps=Clock::now();
 for(size_t offset=prefix;offset<tokens.size();offset+=128){if(cancelled.load()){decoded=false;break;}int count=std::min(size_t(128),tokens.size()-offset);if(llama_decode(ctx,llama_batch_get_one(tokens.data()+offset,count))!=0){if(!cancelled.load())throw std::runtime_error("PROMPT_DECODE_FAILED");decoded=false;break;}}
 double prompt_ms=elapsed(ps),ttft=-1;int output=0;std::string text,reason=cancelled.load()?"cancelled":"max_tokens";auto generation_start=Clock::now();
 if(decoded)for(int i=0;i<r.max_output;i++){
  if(cancelled.load()){reason="cancelled";break;}
  llama_token token=llama_sampler_sample(sampler.get(),ctx,-1);
  if(llama_vocab_is_eog(vocab,token)){reason="eos";break;}
  std::vector<char> piece(256);int length=llama_token_to_piece(vocab,token,piece.data(),piece.size(),0,false);
  if(length<0){piece.resize(-length);length=llama_token_to_piece(vocab,token,piece.data(),piece.size(),0,false);}
  if(length<0)throw std::runtime_error("DETOKENIZATION_FAILED");text.append(piece.data(),length);output++;if(ttft<0)ttft=elapsed(start);
  if(i+1==r.max_output)break;
  if(llama_decode(ctx,llama_batch_get_one(&token,1))!=0){if(!cancelled.load())throw std::runtime_error("GENERATION_DECODE_FAILED");reason="cancelled";break;}
 }
 double gen_ms=elapsed(generation_start);auto perf=llama_perf_context(ctx);rusage usage{};bool rss_ok=getrusage(RUSAGE_SELF,&usage)==0&&usage.ru_maxrss>0;
 std::ostringstream o;o.precision(10);o<<"{\"cacheEnabled\":"<<(r.cache?"true":"false")<<",\"cachedPrefixTokens\":"<<prefix<<",\"promptDecodedTokens\":"<<(n-prefix)<<",\"grammarEnabled\":"<<(r.grammar?"true":"false")<<",\"chatTemplateSource\":\"model metadata via llama_chat_apply_template\",\"runtimeCpuInfo\":"<<quote(llama_print_system_info())<<",\"chatTemplate\":"<<quote(tmpl)<<",\"output\":"<<quote(text)<<",\"stopReason\":"<<quote(reason)<<",\"inputTokens\":"<<n<<",\"outputTokens\":"<<output<<",\"nativeTotalMs\":"<<elapsed(start)<<",\"contextInitMs\":"<<init_ms<<",\"ttftMs\":"<<(ttft<0?"null":std::to_string(ttft))<<",\"promptWallMs\":"<<prompt_ms<<",\"promptTokensPerSecond\":"<<(prompt_ms>0&&decoded?std::to_string((n-prefix)*1000/prompt_ms):"null")<<",\"generationWallMs\":"<<gen_ms<<",\"generatedTokensPerSecond\":"<<(gen_ms>0?output*1000/gen_ms:0)<<",\"decodeTokensPerSecond\":"<<(perf.t_eval_ms>0?std::to_string(perf.n_eval*1000/perf.t_eval_ms):"null")<<",\"decodeTokenCount\":"<<perf.n_eval<<",\"lifetimePeakRssKb\":"<<(rss_ok?std::to_string(usage.ru_maxrss):"null")<<",\"pageSizeBytes\":"<<sysconf(_SC_PAGESIZE)<<"}";
 retain=reason!="cancelled";if(retain&&r.cache)cached_tokens=tokens;
 return o.str();
}
}

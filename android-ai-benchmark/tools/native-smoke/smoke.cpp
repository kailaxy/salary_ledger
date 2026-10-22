#ifdef NDEBUG
#undef NDEBUG
#endif
#include "engine.h"
#include "query-grammar.h"
#include "llama-grammar.h"
#include <cassert>
#include <iostream>
static bool accepts(const std::string &text){auto *g=llama_grammar_init_impl(nullptr,bench::query_grammar,"root",false,nullptr,0,nullptr,0);assert(g);bool ok=true;for(unsigned char c:text){llama_grammar_accept(g,c);if(llama_grammar_get_stacks(g).empty()){ok=false;break;}}bool complete=false;for(const auto &stack:llama_grammar_get_stacks(g))if(stack.empty())complete=true;llama_grammar_free_impl(g);return ok&&complete;}
int main(){
assert(bench::shared_prefix({1,2,3},{1,2,4})==2);assert(bench::shared_prefix({1,2,3},{1,2,3})==2);assert(bench::shared_prefix({1,2,3},{1})==0);assert(bench::shared_prefix({},{1,2})==0);
assert(accepts(R"({"action":"query","operation":"sum","kind":"expense","range":"this_month"})"));
assert(accepts(R"({"status":"clarify"})"));assert(accepts(R"({"status":"unsupported"})"));
assert(!accepts(R"({"action":"delete","operation":"sum","kind":"expense","range":"all"})"));
assert(!accepts(R"({"status":"clarify","message":"extra"})"));assert(!accepts("```json\n{}\n```"));assert(!accepts(R"({"status":)"));
bench::Engine engine;engine.unload();engine.unload();try{engine.run(bench::Request());return 1;}catch(const std::runtime_error &e){assert(std::string(e.what())=="MODEL_NOT_LOADED");}engine.cancelled.store(true);try{engine.load("missing.gguf");return 2;}catch(const std::runtime_error &e){assert(std::string(e.what())=="CANCELLED");}engine.cancelled.store(false);try{engine.load("/definitely-missing-synthetic-model.gguf");return 3;}catch(const std::runtime_error &e){assert(std::string(e.what()).find("MODEL_LOAD_FAILED")==0);}bench::Engine second;try{second.load("/another-missing-synthetic-model.gguf");return 4;}catch(const std::runtime_error &e){assert(std::string(e.what()).find("MODEL_LOAD_FAILED")==0);}assert(bench::quote("\"\n") == "\"\\\"\\u000a\"");std::cout<<"PASS: real native core links and executes on host; absent model, cancelled load, failure recovery, idempotent unload, shared-token-prefix bounds, JSON grammar and escaping. No inference or device performance measured.\n";}

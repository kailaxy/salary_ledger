#pragma once
#include "llama.h"
#include <atomic>
#include <string>
#include <vector>
namespace bench {
inline size_t shared_prefix(const std::vector<llama_token> &old,const std::vector<llama_token> &next){size_t n=0;while(n<old.size()&&n+1<next.size()&&old[n]==next[n])++n;return n;}
struct Request {std::string system,user;int context=1024,threads=2,max_output=128,seed=42;double temperature=0;bool grammar=false,cache=false;};
struct Engine {
 std::atomic<bool> cancelled{false};llama_model *model=nullptr;
 llama_context *cached_context=nullptr;std::vector<llama_token> cached_tokens;std::string cached_system;int cached_size=0,cached_threads=0;
 void clear_cache();~Engine();double load(const std::string &path);void unload();std::string run(const Request &request);
};
std::string quote(const std::string &s);
}

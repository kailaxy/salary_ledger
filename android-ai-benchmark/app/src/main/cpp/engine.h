#pragma once
#include "llama.h"
#include <atomic>
#include <string>
namespace bench {
struct Request {std::string system,user;int context=1024,threads=2,max_output=128,seed=42;double temperature=0;};
struct Engine {
 std::atomic<bool> cancelled{false};llama_model *model=nullptr;
 ~Engine();double load(const std::string &path);void unload();std::string run(const Request &request);
};
std::string quote(const std::string &s);
}

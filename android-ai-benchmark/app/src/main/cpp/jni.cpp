#include "engine.h"
#include <jni.h>
#include <new>
#include <stdexcept>
static bench::Engine *engine(jlong h){if(!h)throw std::runtime_error("ENGINE_CLOSED");return reinterpret_cast<bench::Engine*>(h);}
static std::string bytes(JNIEnv *e,jbyteArray a){if(!a)throw std::runtime_error("INVALID_REQUEST");jsize n=e->GetArrayLength(a);if(n>32768)throw std::runtime_error("INPUT_TOO_LARGE");std::string s(n,0);e->GetByteArrayRegion(a,0,n,reinterpret_cast<jbyte*>(s.data()));return s;}
static void error(JNIEnv *e,const char *text){e->ThrowNew(e->FindClass("java/lang/IllegalStateException"),text);}
extern "C" JNIEXPORT jlong JNICALL Java_com_kailaxy_salaryledger_aibench_NativeEngine_create(JNIEnv *e,jclass){try{return reinterpret_cast<jlong>(new bench::Engine());}catch(const std::bad_alloc&){error(e,"MEMORY_ALLOCATION_FAILED");return 0;}}
extern "C" JNIEXPORT void JNICALL Java_com_kailaxy_salaryledger_aibench_NativeEngine_destroy(JNIEnv*,jclass,jlong h){delete reinterpret_cast<bench::Engine*>(h);}
extern "C" JNIEXPORT void JNICALL Java_com_kailaxy_salaryledger_aibench_NativeEngine_cancelNative(JNIEnv*,jclass,jlong h){if(h)reinterpret_cast<bench::Engine*>(h)->cancelled.store(true);}
extern "C" JNIEXPORT void JNICALL Java_com_kailaxy_salaryledger_aibench_NativeEngine_resetNative(JNIEnv*,jclass,jlong h){if(h)reinterpret_cast<bench::Engine*>(h)->cancelled.store(false);}
extern "C" JNIEXPORT void JNICALL Java_com_kailaxy_salaryledger_aibench_NativeEngine_unloadNative(JNIEnv*,jclass,jlong h){if(h)reinterpret_cast<bench::Engine*>(h)->unload();}
extern "C" JNIEXPORT jdouble JNICALL Java_com_kailaxy_salaryledger_aibench_NativeEngine_loadNative(JNIEnv *e,jclass,jlong h,jbyteArray path){try{return engine(h)->load(bytes(e,path));}catch(const std::bad_alloc&){error(e,"MEMORY_ALLOCATION_FAILED");}catch(const std::exception &x){error(e,x.what());}return 0;}
extern "C" JNIEXPORT jbyteArray JNICALL Java_com_kailaxy_salaryledger_aibench_NativeEngine_generateNative(JNIEnv *e,jclass,jlong h,jbyteArray system,jbyteArray user,jint context,jint threads,jint output,jdouble temperature,jint seed){
 try{bench::Request r;r.system=bytes(e,system);r.user=bytes(e,user);r.context=context;r.threads=threads;r.max_output=output;r.temperature=temperature;r.seed=seed;auto s=engine(h)->run(r);jbyteArray b=e->NewByteArray(s.size());if(b)e->SetByteArrayRegion(b,0,s.size(),reinterpret_cast<const jbyte*>(s.data()));return b;}catch(const std::bad_alloc&){error(e,"MEMORY_ALLOCATION_FAILED");}catch(const std::exception &x){error(e,x.what());}return nullptr;
}

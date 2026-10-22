package com.kailaxy.salaryledger.aibench;
import java.nio.charset.StandardCharsets;
final class NativeEngine implements AutoCloseable {
    static {System.loadLibrary("ledgerbench");}
    private volatile long handle=create(); volatile boolean loaded;
    synchronized void cancel(){if(handle!=0)cancelNative(handle);}
    synchronized void resetCancel(){if(handle!=0)resetNative(handle);}
    double load(String path){loaded=false;double ms=loadNative(handle,path.getBytes(StandardCharsets.UTF_8));loaded=true;return ms;}
    void clearCache(){clearCacheNative(handle);}
    void unload(){if(handle!=0)unloadNative(handle);loaded=false;}
    String generate(String system,String user,RunConfig c,boolean grammar,boolean cache){c.validate();RunConfig.prompt(system,user);return new String(generateNative(handle,system.getBytes(StandardCharsets.UTF_8),user.getBytes(StandardCharsets.UTF_8),c.context,c.threads,c.maxOutput,c.temperature,c.seed,grammar,cache),StandardCharsets.UTF_8);}
    @Override public synchronized void close(){if(handle!=0){destroy(handle);handle=0;loaded=false;}}
    private static native void clearCacheNative(long h);
    private static native long create();private static native void destroy(long h);
    private static native void cancelNative(long h);private static native void resetNative(long h);private static native void unloadNative(long h);
    private static native double loadNative(long h,byte[] path);
    private static native byte[] generateNative(long h,byte[] system,byte[] user,int context,int threads,int output,double temperature,int seed,boolean grammar,boolean cache);
}

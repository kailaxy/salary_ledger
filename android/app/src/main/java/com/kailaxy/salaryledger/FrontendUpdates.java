package com.kailaxy.salaryledger;

import android.content.Context;
import java.io.*;
import java.net.URI;
import java.security.PublicKey;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.net.ssl.HttpsURLConnection;

/** Separate bounded background transport; never sends ledger data or device credentials. */
final class FrontendUpdates {
    static final int NATIVE_API=1;
    final FrontendStore store;
    private final PublicKey key;
    private final String base,channel;
    private final android.content.SharedPreferences preferences;
    private final ExecutorService executor=Executors.newSingleThreadExecutor();
    private final AtomicBoolean checking=new AtomicBoolean();
    FrontendUpdates(Context context)throws Exception{
        key=FrontendManifest.key(BuildConfig.OTA_PUBLIC_KEY);base=BuildConfig.OTA_BASE;channel=BuildConfig.OTA_CHANNEL;
        FrontendManifest.manifestUrl(base,channel);
        store=new FrontendStore(new File(context.getFilesDir(),"frontend-updates"),key,base,channel,BuildConfig.FRONTEND_REVISION,NATIVE_API);
        preferences=context.getSharedPreferences("frontend-update-check",Context.MODE_PRIVATE);
    }
    void check(boolean force,java.util.function.Consumer<String> result){
        long now=System.currentTimeMillis(),last=preferences.getLong("checked",0);
        if(!force&&now>=last&&now-last<6*60*60*1000L){result.accept("Interface update check not due yet.");return;}
        if(!checking.compareAndSet(false,true)){result.accept("Interface update check already running.");return;}
        try{executor.execute(()->{
            try{
                if(force)store.resume();else if(store.paused())return;
                long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(60);
                byte[] metadata=download(FrontendManifest.manifestUrl(base,channel),8192,deadline);
                FrontendManifest manifest=FrontendManifest.verify(metadata,key,base,channel);
                boolean staged=store.wants(manifest)&&store.stage(metadata,download(manifest.url,FrontendManifest.MAX_HTML,deadline));
                result.accept(staged?"Interface update downloaded. Close and reopen the app to apply it.":manifest.minimumApi>NATIVE_API?"A newer APK is needed for this interface update.":"Using the current compatible interface.");
                preferences.edit().putLong("checked",System.currentTimeMillis()).apply();
            }catch(Exception ignored){result.accept("Could not check for interface updates. Your installed interface is unchanged.");}
            finally{checking.set(false);}
        });}catch(RejectedExecutionException ignored){checking.set(false);}
    }
    static byte[] download(String location,int max,long deadline)throws Exception{
        URI uri=new URI(location);
        for(int redirects=0;redirects<=4;redirects++){
            if(!FrontendManifest.downloadHost(uri))throw new SecurityException("Update host rejected");
            if(Thread.currentThread().isInterrupted())throw new InterruptedIOException();
            HttpsURLConnection connection=(HttpsURLConnection)uri.toURL().openConnection();
            try{
                int remaining=remaining(deadline);connection.setConnectTimeout(Math.min(10000,remaining));connection.setReadTimeout(Math.min(15000,remaining));
                connection.setInstanceFollowRedirects(false);connection.setUseCaches(false);
                connection.setRequestProperty("Accept","application/octet-stream");
                int status=connection.getResponseCode();
                if(status==301||status==302||status==303||status==307||status==308){
                    String next=connection.getHeaderField("Location");if(next==null)throw new IOException("Missing redirect");uri=uri.resolve(next);continue;
                }
                if(status!=200||connection.getContentLengthLong()>max)throw new IOException("Update unavailable");
                try(InputStream in=connection.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){
                    byte[] buffer=new byte[8192];int n;
                    while(true){
                        if(Thread.currentThread().isInterrupted())throw new InterruptedIOException();
                        connection.setReadTimeout(Math.min(15000,remaining(deadline)));
                        n=in.read(buffer);if(n==-1)break;
                        if(out.size()+n>max)throw new IOException("Large update");out.write(buffer,0,n);
                    }
                    return out.toByteArray();
                }
            }finally{connection.disconnect();}
        }
        throw new IOException("Too many redirects");
    }
    private static int remaining(long deadline)throws IOException{
        long ms=TimeUnit.NANOSECONDS.toMillis(deadline-System.nanoTime());if(ms<=0)throw new IOException("Update deadline exceeded");return(int)Math.min(ms,Integer.MAX_VALUE);
    }
    void close(){executor.shutdownNow();}
}

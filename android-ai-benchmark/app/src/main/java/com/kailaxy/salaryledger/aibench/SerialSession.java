package com.kailaxy.salaryledger.aibench;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;
/** No task may overlap another; teardown is always ordered after the active native call. */
final class SerialSession implements AutoCloseable {
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final AtomicBoolean busy=new AtomicBoolean();private volatile boolean closed;
    private final Runnable reset,cancel,unload,destroy;
    SerialSession(Runnable reset,Runnable cancel,Runnable unload,Runnable destroy){this.reset=reset;this.cancel=cancel;this.unload=unload;this.destroy=destroy;}
    synchronized boolean submit(Runnable task,Consumer<Throwable> done){
        if(closed||!busy.compareAndSet(false,true))return false;reset.run();
        worker.execute(()->{Throwable error=null;try{task.run();}catch(Throwable t){error=t;}finally{busy.set(false);done.accept(error);}});return true;
    }
    void cancel(){cancel.run();}
    boolean busy(){return busy.get();}
    synchronized void suspend(){if(!closed){cancel.run();worker.execute(unload);}}
    @Override public synchronized void close(){if(!closed){closed=true;cancel.run();worker.execute(destroy);worker.shutdown();}}
    boolean await(long ms)throws InterruptedException{return worker.awaitTermination(ms,TimeUnit.MILLISECONDS);}
}

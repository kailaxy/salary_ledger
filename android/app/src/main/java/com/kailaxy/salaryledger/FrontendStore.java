package com.kailaxy.salaryledger;

import java.io.*;
import java.nio.file.*;
import java.security.PublicKey;
import java.util.Properties;

/** Private update cache only. Never reads, clears or migrates ledger/credential storage. */
final class FrontendStore {
    private static final Object LOCK=new Object();
    private final File directory;
    private final PublicKey key;
    private final String base,channel;
    private final long bundled;
    private final int api;
    static final class Selection {
        final byte[] html; final long revision; final boolean trial;
        Selection(byte[] html,long revision,boolean trial){this.html=html;this.revision=revision;this.trial=trial;}
    }
    FrontendStore(File directory,PublicKey key,String base,String channel,long bundled,int api) throws IOException {
        this.directory=directory;this.key=key;this.base=base;this.channel=channel;this.bundled=bundled;this.api=api;
        if(!directory.isDirectory()&&!directory.mkdirs())throw new IOException("Update cache unavailable");
    }
    private File file(long revision,String suffix){return new File(directory,"frontend-"+revision+suffix);}
    private Properties state() throws IOException {
        Properties p=new Properties();File f=new File(directory,"state");
        if(f.isFile()){try(InputStream in=new ByteArrayInputStream(read(f,8192))){p.load(in);}}
        return p;
    }
    private static long number(Properties p,String name){try{return Math.max(0,Long.parseLong(p.getProperty(name,"0")));}catch(NumberFormatException e){return 0;}}
    private static void set(Properties p,String name,long value){p.setProperty(name,Long.toString(value));}
    private void save(Properties p)throws IOException{ByteArrayOutputStream out=new ByteArrayOutputStream();p.store(out,null);atomic(new File(directory,"state"),out.toByteArray());}
    private static void atomic(File target,byte[] data)throws IOException{
        File temp=new File(target.getPath()+".tmp");
        try{
            try(FileOutputStream out=new FileOutputStream(temp)){out.write(data);out.getFD().sync();}
            try{Files.move(temp.toPath(),target.toPath(),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);}
            catch(AtomicMoveNotSupportedException e){Files.move(temp.toPath(),target.toPath(),StandardCopyOption.REPLACE_EXISTING);}
        }finally{if(temp.exists())temp.delete();}
    }
    static byte[] read(File file,int max)throws IOException{
        if(file.length()>max)throw new IOException("Large cached update");
        try(InputStream in=new FileInputStream(file);ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))!=-1){if(out.size()+n>max)throw new IOException("Large cached update");out.write(buffer,0,n);}return out.toByteArray();
        }
    }
    private Selection cached(long revision,boolean trial)throws Exception{
        if(revision<=bundled)return null;
        FrontendManifest m=FrontendManifest.verify(read(file(revision,".manifest"),8192),key,base,channel);
        if(m.revision!=revision||m.minimumApi>api)return null;
        byte[] html=read(file(revision,".html"),FrontendManifest.MAX_HTML);m.verifyHtml(html);
        return new Selection(html,revision,trial);
    }
    boolean wants(FrontendManifest manifest)throws IOException{
        synchronized(LOCK){return number(state(),"paused")==0&&manifest.minimumApi<=api&&manifest.revision>Math.max(bundled,number(state(),"highest"));}
    }
    boolean stage(byte[] metadata,byte[] html)throws Exception{
        synchronized(LOCK){
            FrontendManifest m=FrontendManifest.verify(metadata,key,base,channel);m.verifyHtml(html);
            Properties p=state();if(number(p,"paused")!=0||m.minimumApi>api||m.revision<=Math.max(bundled,number(p,"highest")))return false;
            atomic(file(m.revision,".html"),html);atomic(file(m.revision,".manifest"),metadata);
            set(p,"pending",m.revision);set(p,"highest",m.revision);save(p);clean(p);return true;
        }
    }
    Selection launch()throws IOException{
        synchronized(LOCK){
            Properties p=state();
            // An unacknowledged attempt is never retried on the next launch.
            if(number(p,"trial")!=0){set(p,"trial",0);save(p);clean(p);return knownGood(p);}
            long pending=number(p,"pending");set(p,"pending",0);
            if(pending>bundled){
                try{Selection selected=cached(pending,true);if(selected!=null){set(p,"trial",pending);save(p);return selected;}}
                catch(Exception ignored){/* corrupt/incompatible candidate: retain last good UI */}
            }
            save(p);return knownGood(p);
        }
    }
    private Selection knownGood(Properties p)throws IOException{
        for(String name:new String[]{"active","previous"}){
            try{Selection selected=cached(number(p,name),false);if(selected!=null){set(p,"active",selected.revision);save(p);return selected;}}
            catch(Exception ignored){/* verify every cached selection, including offline */}
        }
        set(p,"active",0);save(p);return new Selection(null,bundled,false);
    }
    void ready(long revision)throws IOException{
        synchronized(LOCK){Properties p=state();if(number(p,"trial")==revision&&revision>bundled){set(p,"previous",number(p,"active"));set(p,"active",revision);set(p,"trial",0);save(p);clean(p);}}
    }
    Selection rollback()throws IOException{
        synchronized(LOCK){Properties p=state();set(p,"trial",0);save(p);clean(p);return knownGood(p);}
    }
    void restoreBundled()throws IOException{
        synchronized(LOCK){Properties p=state();for(String name:new String[]{"active","previous","pending","trial"})set(p,name,0);set(p,"paused",1);save(p);clean(p);}
    }
    boolean paused()throws IOException{synchronized(LOCK){return number(state(),"paused")!=0;}}
    void resume()throws IOException{synchronized(LOCK){Properties p=state();set(p,"paused",0);save(p);}}
    private void clean(Properties p){
        File[] files=directory.listFiles();if(files==null)return;
        for(File f:files){if(!f.getName().matches("frontend-[0-9]+\\.(?:html|manifest)"))continue;
            long revision=Long.parseLong(f.getName().split("[.-]")[1]);
            if(revision!=number(p,"active")&&revision!=number(p,"previous")&&revision!=number(p,"pending")&&revision!=number(p,"trial"))f.delete();
        }
    }
}

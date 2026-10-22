package com.kailaxy.salaryledger.aibench;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.UUID;
final class ResultsStore {
    private static final Object LOCK=new Object();private static final String INSTANCE=UUID.randomUUID().toString();
    private final File dir,log,pending;
    ResultsStore(File dir){this.dir=dir;log=new File(dir,"runs.jsonl");pending=new File(dir,"pending.json");}
    String begin(String operation) throws Exception {synchronized(LOCK){String id=UUID.randomUUID().toString();write(pending,new JSONObject().put("id",id).put("operation",operation).put("timestamp",System.currentTimeMillis()).put("processInstance",INSTANCE).toString());return id;}}
    void finish(String id) throws Exception{synchronized(LOCK){if(pending.exists()&&id.equals(new JSONObject(read(pending)).optString("id")))Files.deleteIfExists(pending.toPath());}}
    void recover() throws Exception{synchronized(LOCK){
        if(log.exists()&&log.length()>0){byte[] bytes=Files.readAllBytes(log.toPath());if(bytes[bytes.length-1]!='\n'){int end=bytes.length-1;while(end>=0&&bytes[end]!='\n')end--;try(RandomAccessFile f=new RandomAccessFile(log,"rw")){f.setLength(end+1);}append(new JSONObject().put("type","incomplete_result_tail").put("timestamp",System.currentTimeMillis()).put("note","An incomplete final log row was removed; its measurements are unavailable"));}}
        if(pending.exists()){JSONObject old=new JSONObject(read(pending));if(!INSTANCE.equals(old.optString("processInstance"))){append(new JSONObject().put("type","interrupted").put("previousOperation",old).put("timestamp",System.currentTimeMillis()).put("note","Previous process ended before completion; not proof of out-of-memory"));Files.deleteIfExists(pending.toPath());}}}}
    void append(JSONObject row) throws Exception{synchronized(LOCK){if(log.length()>16*1024*1024)throw new IOException("RESULT_ARCHIVE_FULL: export and remove benchmark data before more runs");try(FileOutputStream out=new FileOutputStream(log,true)){out.write((row.toString()+"\n").getBytes(StandardCharsets.UTF_8));out.getFD().sync();}}}
    void clear() throws IOException{synchronized(LOCK){Files.deleteIfExists(log.toPath());Files.deleteIfExists(pending.toPath());}}
    JSONArray rows() throws Exception{synchronized(LOCK){JSONArray a=new JSONArray();if(log.exists())try(BufferedReader in=new BufferedReader(new FileReader(log))){String s;while((s=in.readLine())!=null)a.put(new JSONObject(s));}return a;}}
    private static String read(File f)throws IOException{return new String(Files.readAllBytes(f.toPath()),StandardCharsets.UTF_8);}
    private static void write(File f,String value)throws IOException{File temp=new File(f.getParentFile(),f.getName()+".part");try(FileOutputStream out=new FileOutputStream(temp)){out.write(value.getBytes(StandardCharsets.UTF_8));out.getFD().sync();}Files.move(temp.toPath(),f.toPath(),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);}
}

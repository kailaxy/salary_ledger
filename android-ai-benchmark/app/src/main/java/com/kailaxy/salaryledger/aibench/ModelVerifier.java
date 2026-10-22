package com.kailaxy.salaryledger.aibench;

import java.io.*;
import java.nio.file.*;
import java.security.*;
import java.util.*;
import java.util.function.BooleanSupplier;

/** Pure Java verification; never trusts a document name, MIME type or provider size. */
final class ModelVerifier {
    static final class Pin {
        final String sha256, revision; final long size;
        Pin(String sha256, String revision, long size) { this.sha256=sha256; this.revision=revision; this.size=size; }
        boolean pinned() { return sha256!=null&&sha256.matches("[0-9a-f]{64}")&&revision!=null&&revision.matches("[0-9a-f]{40}")&&size>0; }
    }
    static Map<String,Object> verify(File file, Pin pin, BooleanSupplier cancelled) throws Exception {
        if(!pin.pinned())throw new IOException("MODEL_PIN_UNRESOLVED: build with an official pinned model manifest first");
        if(!file.isFile())throw new IOException("MODEL_NOT_INSTALLED: import the pinned GGUF first");
        if(file.length()!=pin.size)throw new IOException("MODEL_SIZE_MISMATCH: incomplete or different artifact");
        MessageDigest hash=MessageDigest.getInstance("SHA-256");byte[] buffer=new byte[1024*1024];
        try(InputStream in=new FileInputStream(file)){int n;while((n=in.read(buffer))!=-1){check(cancelled);hash.update(buffer,0,n);}}
        StringBuilder digest=new StringBuilder();for(byte b:hash.digest())digest.append(String.format(Locale.ROOT,"%02x",b&255));
        if(!MessageDigest.isEqual(digest.toString().getBytes(java.nio.charset.StandardCharsets.US_ASCII),pin.sha256.getBytes(java.nio.charset.StandardCharsets.US_ASCII)))throw new IOException("MODEL_SHA256_MISMATCH: corrupted or unapproved artifact");
        return metadata(file,cancelled);
    }
    static File importModel(InputStream in, File target, Pin pin, BooleanSupplier cancelled) throws Exception {
        if(!pin.pinned())throw new IOException("MODEL_PIN_UNRESOLVED");
        File temp=File.createTempFile("model-import-", ".part", target.getParentFile());
        try {
            long count=0;byte[] bytes=new byte[1024*1024];
            try(FileOutputStream out=new FileOutputStream(temp)){int n;while((n=in.read(bytes))!=-1){check(cancelled);count+=n;if(count>pin.size)throw new IOException("MODEL_SIZE_MISMATCH");out.write(bytes,0,n);}out.getFD().sync();}
            verify(temp,pin,cancelled);check(cancelled);
            Files.move(temp.toPath(),target.toPath(),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);return target;
        } finally { Files.deleteIfExists(temp.toPath()); }
    }
    private static void check(BooleanSupplier cancelled) throws IOException { if(cancelled.getAsBoolean())throw new IOException("CANCELLED"); }
    static Map<String,Object> metadata(File file, BooleanSupplier cancelled) throws Exception {
        Map<String,Object> selected=new LinkedHashMap<>();
        try(RandomAccessFile f=new RandomAccessFile(file,"r")){
            if(f.readInt()!=0x47475546||u32(f)!=3)throw new IOException("GGUF_VERSION_OR_MAGIC_INVALID");
            long tensors=u64(f),entries=u64(f);if(tensors<1||tensors>10000||entries<1||entries>4096)throw new IOException("GGUF_COUNTS_INVALID");
            Set<String> keys=new HashSet<>();
            for(int i=0;i<entries;i++){check(cancelled);String key=string(f,256);if(!keys.add(key))throw new IOException("GGUF_DUPLICATE_KEY");int type=(int)u32(f);Object value;
                if(key.equals("general.architecture")||key.equals("general.name")){if(type!=8)throw new IOException("GGUF_METADATA_TYPE");value=string(f,4096);}
                else if(key.equals("general.file_type")||key.equals("qwen2.embedding_length")||key.equals("qwen2.block_count")){if(type!=4)throw new IOException("GGUF_METADATA_TYPE");value=u32(f);}
                else {skip(f,type,0);value=null;}
                if(value!=null)selected.put(key,value);if(f.getFilePointer()>64L*1024*1024)throw new IOException("GGUF_HEADER_TOO_LARGE");
            }
            if(!"qwen2".equals(selected.get("general.architecture"))||!Long.valueOf(15).equals(selected.get("general.file_type"))||!Long.valueOf(896).equals(selected.get("qwen2.embedding_length"))||!Long.valueOf(24).equals(selected.get("qwen2.block_count")))throw new IOException("GGUF_INCOMPATIBLE_MODEL: expected Qwen2.5 0.5B Q4_K_M");
            for(int i=0;i<tensors;i++){check(cancelled);string(f,256);long dims=u32(f);if(dims<1||dims>4)throw new IOException("GGUF_TENSOR_DIMS");for(int j=0;j<dims;j++)if(u64(f)<1)throw new IOException("GGUF_TENSOR_SIZE");if(u32(f)>64||u64(f)>file.length())throw new IOException("GGUF_TENSOR_INVALID");}
            if(f.getFilePointer()>=file.length())throw new IOException("GGUF_MISSING_TENSOR_DATA");
            selected.put("ggufVersion",3);selected.put("tensorCount",tensors);selected.put("actualSizeBytes",file.length());return selected;
        }
    }
    private static long u32(RandomAccessFile f)throws IOException{return Integer.toUnsignedLong(Integer.reverseBytes(f.readInt()));}
    private static long u64(RandomAccessFile f)throws IOException{long n=Long.reverseBytes(f.readLong());if(n<0)throw new IOException("GGUF_INTEGER_OVERFLOW");return n;}
    private static String string(RandomAccessFile f,int max)throws IOException{long n=u64(f);if(n>max||n>f.length()-f.getFilePointer())throw new IOException("GGUF_STRING_TOO_LARGE");byte[] b=new byte[(int)n];f.readFully(b);return new String(b,java.nio.charset.StandardCharsets.UTF_8);}
    private static void advance(RandomAccessFile f,long n)throws IOException{if(n<0||n>f.length()-f.getFilePointer())throw new EOFException("GGUF_TRUNCATED");f.seek(f.getFilePointer()+n);}
    private static void skip(RandomAccessFile f,int type,int depth)throws IOException{
        switch(type){case 0:case 1:case 7:advance(f,1);break;case 2:case 3:advance(f,2);break;case 4:case 5:case 6:advance(f,4);break;case 10:case 11:case 12:advance(f,8);break;
        case 8:long n=u64(f);if(n>2*1024*1024)throw new IOException("GGUF_STRING_TOO_LARGE");advance(f,n);break;
        case 9:if(depth>0)throw new IOException("GGUF_NESTED_ARRAY");int sub=(int)u32(f);long count=u64(f);if(count>2_000_000||sub==9)throw new IOException("GGUF_ARRAY_TOO_LARGE");for(long i=0;i<count;i++)skip(f,sub,depth+1);break;
        default:throw new IOException("GGUF_UNKNOWN_TYPE");}
    }
}

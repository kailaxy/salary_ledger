package com.kailaxy.salaryledger.aibench;

import android.app.Activity;
import android.content.*;
import android.graphics.Color;
import android.net.Uri;
import android.os.*;
import android.view.*;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

/** Isolated synthetic-data benchmark. No WebView, ledger bridge, network or credential access. */
public final class BenchmarkActivity extends Activity {
    private static final int IMPORT=10,EXPORT_JSON=11,EXPORT_CSV=12;
    private volatile NativeEngine engine;private SerialSession session;private MemoryProbe memory;private ResultsStore records;
    private JSONObject manifest,dataset;private int successfulRuns,failedRuns,cancelledRuns;private ModelVerifier.Pin pin;private File modelFile;
    private TextView status,modelInfo,deviceInfo,metrics,output;private EditText prompt,seed;
    private Spinner mode,cases,threads,context,tokens,temperature,repeats;
    private final List<Button> actions=new ArrayList<>();private final List<JSONObject> visibleCases=new ArrayList<>();
    private final AtomicBoolean cancelled=new AtomicBoolean();private final AtomicLong cancelRequestedNs=new AtomicLong();private boolean destroyed,ready;private String nativeError;
    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);memory=new MemoryProbe(this);records=new ResultsStore(getFilesDir());modelFile=new File(getFilesDir(),"model.gguf");
        session=new SerialSession(()->{cancelled.set(false);cancelRequestedNs.set(0);if(engine!=null)engine.resetCancel();},()->{cancelled.set(true);cancelRequestedNs.compareAndSet(0,SystemClock.elapsedRealtimeNanos());if(engine!=null)engine.cancel();},()->{if(engine!=null)engine.unload();},()->{if(engine!=null)engine.close();});
        buildUi();job("Reading diagnostics",()->{
try{engine=new NativeEngine();}catch(LinkageError|RuntimeException e){nativeError="Native runtime unavailable: "+e.getClass().getSimpleName();}
            manifest=asset("model-manifest.json");dataset=asset("cases.json");pin=new ModelVerifier.Pin(manifest.optString("sha256",null),manifest.optString("revision",null),manifest.optLong("sizeBytes",0));
            records.recover();JSONArray previous=records.rows();for(int i=0;i<previous.length();i++)count(previous.getJSONObject(i));JSONObject info=memory.device();ui(()->{deviceInfo.setText(info.toString());modelInfo.setText(modelDescription());ready=true;refreshCases();});
        });
    }
    private interface Work {void run()throws Exception;}
    private void ui(Runnable r){runOnUiThread(()->{if(!destroyed)r.run();});}
    private void job(String message,Work work){
        if(session.busy()){status.setText("An operation is already running. Cancel it first.");return;}
        status.setText(message);enable(false);
        if(!session.submit(()->{try{work.run();}catch(Exception e){throw new RuntimeException(e);}},error->ui(()->{enable(true);status.setText(error==null?"Ready. "+(engine!=null&&engine.loaded?"Model loaded.":"Model unloaded."):safeError(error));modelInfo.setText(modelDescription());})))enable(true);
    }
    private String safeError(Throwable t){while(t.getCause()!=null)t=t.getCause();String m=t.getMessage();if(m!=null&&m.matches("[A-Z_]+(?::.*)?"))return m;return t instanceof OutOfMemoryError?"MEMORY_ALLOCATION_FAILED":t.getClass().getSimpleName()+": operation failed; see benchmark diagnostics";}
    private void enable(boolean enabled){for(Button b:actions)b.setEnabled(enabled);for(View v:new View[]{mode,cases,threads,context,tokens,temperature,repeats,prompt,seed})v.setEnabled(enabled);}
    private TextView text(LinearLayout box,String value,int size){TextView t=new TextView(this);t.setText(value);t.setTextSize(size);t.setTextColor(Color.rgb(28,59,46));t.setPadding(0,10,0,8);box.addView(t);return t;}
    private Button button(LinearLayout box,String label,Runnable action){Button b=new Button(this);b.setText(label);b.setMinHeight(dp(48));box.addView(b);b.setOnClickListener(v->action.run());actions.add(b);return b;}
    private Spinner spinner(LinearLayout box,String label,String... values){text(box,label,14);Spinner s=new Spinner(this);s.setContentDescription(label);s.setMinimumHeight(dp(48));s.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,values));box.addView(s);return s;}
    private int dp(int x){return (int)(getResources().getDisplayMetrics().density*x);}
    private void buildUi(){
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Color.rgb(242,245,235));
        if(Build.VERSION.SDK_INT>=30)getWindow().setDecorFitsSystemWindows(false);else getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE|View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN|View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(i.getSystemWindowInsetLeft(),i.getSystemWindowInsetTop(),i.getSystemWindowInsetRight(),i.getSystemWindowInsetBottom());return i.consumeSystemWindowInsets();});
        ScrollView scroll=new ScrollView(this);root.addView(scroll);LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setPadding(dp(18),dp(12),dp(18),dp(24));scroll.addView(box);setContentView(root);
        text(box,"Ledger AI Bench",26);text(box,"Separate offline prototype · CPU only · synthetic data",14);
        status=text(box,nativeError==null?"Initializing diagnostics…":nativeError,16);status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        modelInfo=text(box,"No model installed. Import the exact pinned Qwen GGUF file.",13);
        button(box,"Import model (document picker)",()->{if(!ready||!pin.pinned()){status.setText("MODEL_PIN_UNRESOLVED: build using the official pinning step; see benchmark README.");return;}Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE);startActivityForResult(i,IMPORT);});
        button(box,"Load model",this::loadModel);button(box,"Unload model",()->job("Unloading",()->{if(engine!=null)engine.unload();records.append(new JSONObject().put("type","model_unload").put("timestamp",System.currentTimeMillis()).put("memory",memory.sample()));}));
        button(box,"Remove imported model",()->job("Removing model",()->{if(engine!=null)engine.unload();Files.deleteIfExists(modelFile.toPath());File[] parts=getFilesDir().listFiles((d,n)->n.startsWith("model-import-")&&n.endsWith(".part"));if(parts!=null)for(File f:parts)Files.deleteIfExists(f.toPath());}));
        text(box,"Benchmark configuration",21);
        mode=spinner(box,"Task","Structured queries","Personality","Free synthetic prompt");
        cases=spinner(box,"Evaluation case","Loading cases…");threads=spinner(box,"CPU threads","2","3","4");context=spinner(box,"Context tokens","1024","2048");tokens=spinner(box,"Maximum output tokens","128","96","64");temperature=spinner(box,"Temperature (structured requires 0)","0","0.6");repeats=spinner(box,"Suite repetitions","1","3","5");
        text(box,"Sampling seed",14);seed=new EditText(this);seed.setSingleLine(true);seed.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);seed.setText("42");seed.setContentDescription("Sampling seed");box.addView(seed);
        text(box,"Synthetic prompt (edits are scored as manual, not labeled cases)",14);prompt=new EditText(this);prompt.setMinLines(3);prompt.setMaxLines(8);prompt.setInputType(android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE);prompt.setContentDescription("Synthetic prompt");box.addView(prompt);
        text(box,"Do not enter real salary records or credentials. Exports contain these prompts and outputs.",13);
        mode.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener(){public void onNothingSelected(AdapterView<?> a){}public void onItemSelected(AdapterView<?> a,View v,int p,long id){temperature.setSelection(p==1?1:0);tokens.setSelection(p==1?1:0);refreshCases();}});
        cases.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener(){public void onNothingSelected(AdapterView<?> a){}public void onItemSelected(AdapterView<?> a,View v,int p,long id){if(p<visibleCases.size())prompt.setText(visibleCases.get(p).optString("user"));}});
        button(box,"Run selected prompt",()->run(false,false));button(box,"Run warm-up (excluded from scores)",()->run(false,true));button(box,"Run evaluation suite",()->run(true,false));
        Button cancel=new Button(this);cancel.setText("Cancel active operation");cancel.setMinHeight(dp(48));box.addView(cancel);cancel.setOnClickListener(v->{session.cancel();status.setText("Cancellation requested; waiting for the native worker to stop.");});
        text(box,"Generated output",21);output=text(box,"No output yet.",16);output.setTextIsSelectable(true);
        text(box,"Metrics and stability",21);text(box,"Export JSON and run tools/score.cjs for query-contract accuracy, latency statistics and personality review. Runtime success is not proof of financial correctness.",13);metrics=text(box,"No measured inference yet. A model is required; device results are unverified.",13);metrics.setTextIsSelectable(true);
        button(box,"Export JSON (full metrics and scoring inputs)",()->exportPicker(EXPORT_JSON));button(box,"Export CSV (flat timing summary)",()->exportPicker(EXPORT_CSV));
        button(box,"Clear benchmark results (keeps model)",()->job("Clearing benchmark results",()->{records.clear();successfulRuns=failedRuns=cancelledRuns=0;ui(()->metrics.setText("Results cleared; model and production app are untouched."));}));
        text(box,"Device diagnostics",21);deviceInfo=text(box,"Reading available platform information…",12);deviceInfo.setTextIsSelectable(true);
        text(box,"Runtime: llama.cpp b5046 / 74d4f5b0 · MIT. Model: official Qwen2.5 0.5B Q4_K_M · Apache-2.0. See bundled manifest and repository notices. This app has no Internet permission or access to Salary Ledger.",12);
    }
    private String modelDescription(){if(manifest==null)return "Model diagnostics are loading.";return "Imported: "+(modelFile.exists()?modelFile.length()+" bytes":"none")+"\nExpected: "+manifest.optString("filename")+" · "+manifest.optString("quantization")+"\nGGUF version: "+manifest.optInt("ggufVersion")+" · License: "+manifest.optString("license")+"\nRevision: "+manifest.optString("revision","UNRESOLVED")+"\nSHA-256: "+manifest.optString("sha256","UNRESOLVED")+"\n"+(pin!=null&&pin.pinned()?"Exact artifact pinned; GGUF metadata and checksum checked on import and load.":"Pin unresolved; importing/loading is disabled until metadata is pinned at build time.")+(nativeError!=null?"\n"+nativeError:"");}
    private JSONObject asset(String path)throws Exception{try(InputStream in=getAssets().open(path)){ByteArrayOutputStream b=new ByteArrayOutputStream();byte[] buf=new byte[8192];int n;while((n=in.read(buf))!=-1)b.write(buf,0,n);return new JSONObject(b.toString("UTF-8"));}}
    private void loadModel(){if(!modelFile.isFile()){status.setText("No model installed. Import the pinned GGUF file first.");return;}if(engine==null){status.setText(nativeError);return;}job("Verifying and loading model; this can take time",()->{
        String operation=records.begin("model_load");JSONObject event=new JSONObject().put("type","model_load").put("replacedLoadedModel",engine.loaded).put("timestamp",System.currentTimeMillis()).put("memoryBefore",memory.sample());long start=SystemClock.elapsedRealtimeNanos();
        try{engine.unload();Map<String,Object> metadata=ModelVerifier.verify(modelFile,pin,cancelled::get);event.put("verificationMs",(SystemClock.elapsedRealtimeNanos()-start)/1e6);long loading=SystemClock.elapsedRealtimeNanos();double nativeMs=engine.load(modelFile.getAbsolutePath());event.put("loadMs",(SystemClock.elapsedRealtimeNanos()-loading)/1e6).put("nativeLoadMs",nativeMs).put("metadata",new JSONObject(metadata)).put("status","ok");}
        catch(Exception | OutOfMemoryError t){event.put("status",cancelled.get()?"cancelled":"failed").put("error",safeError(t));throw t;}
        finally{event.put("cancelRequestToReturnMs",cancelled.get()&&cancelRequestedNs.get()>0?(SystemClock.elapsedRealtimeNanos()-cancelRequestedNs.get())/1e6:JSONObject.NULL).put("verifyAndLoadMs",(SystemClock.elapsedRealtimeNanos()-start)/1e6).put("memoryAfter",memory.sample());records.append(event);records.finish(operation);ui(()->metrics.setText(event.toString()));}
    });}
    private void refreshCases(){if(dataset==null)return;visibleCases.clear();JSONArray all=dataset.optJSONArray("cases");String kind=mode.getSelectedItemPosition()==1?"personality":"intent";for(int i=0;i<all.length();i++){JSONObject c=all.optJSONObject(i);if(kind.equals(c.optString("kind")))visibleCases.add(c);}List<String> names=new ArrayList<>();for(JSONObject c:visibleCases)names.add(c.optString("id")+" · "+c.optString("language"));cases.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,names));if(!visibleCases.isEmpty())prompt.setText(visibleCases.get(0).optString("user"));}
    private RunConfig configuration(){return new RunConfig(Integer.parseInt(context.getSelectedItem().toString()),Integer.parseInt(threads.getSelectedItem().toString()),Integer.parseInt(tokens.getSelectedItem().toString()),Double.parseDouble(temperature.getSelectedItem().toString()),Integer.parseInt(seed.getText().toString()));}
    private void run(boolean suite,boolean warmup){
        if(engine==null||!engine.loaded){status.setText("Import and load the pinned model first.");return;}
        try{RunConfig cfg=configuration();int modeIndex=mode.getSelectedItemPosition();if(modeIndex==0&&cfg.temperature!=0)throw new IllegalArgumentException("Structured evaluation requires temperature 0");
            List<JSONObject> chosen=new ArrayList<>();int repeat=Integer.parseInt(repeats.getSelectedItem().toString());
            if(suite){if(modeIndex==2)throw new IllegalArgumentException("Choose structured or personality evaluation for a labeled suite");chosen.addAll(visibleCases);}else{
                JSONObject c=new JSONObject(visibleCases.get(cases.getSelectedItemPosition()).toString());String edited=prompt.getText().toString();if(modeIndex==2||!edited.equals(c.optString("user"))){c.put("id","manual").put("kind","manual").put("user",edited);if(modeIndex==2)c.put("system","Respond to the synthetic prompt only; no tools, real records, arithmetic or financial actions.");}chosen.add(c);
            }
            for(JSONObject c:chosen)RunConfig.prompt(c.getString("system"),c.getString("user"));
            job("Generating offline on CPU",()->{
                if(suite&&!chosen.isEmpty())one(chosen.get(0),cfg,true,0);
                for(int r=0;r<(suite?repeat:1);r++)for(JSONObject c:chosen){if(cancelled.get()||!engine.loaded)return;one(c,cfg,warmup,r);}
            });
        }catch(Exception e){status.setText(e.getMessage());}
    }
    private void one(JSONObject c,RunConfig cfg,boolean warmup,int repetition)throws Exception{
        String marker=records.begin("inference");JSONObject row=new JSONObject().put("type","run").put("runId",marker).put("caseId",c.getString("id")).put("kind",c.getString("kind")).put("warmup",warmup).put("repetition",repetition).put("timestamp",System.currentTimeMillis()).put("system",c.getString("system")).put("user",c.getString("user")).put("config",new JSONObject().put("context",cfg.context).put("threads",cfg.threads).put("maxOutput",cfg.maxOutput).put("temperature",cfg.temperature).put("seed",cfg.seed)).put("memoryBefore",memory.sample());
        long start=SystemClock.elapsedRealtimeNanos();try(MemoryProbe.Sampling sampling=memory.new Sampling()){
            try{JSONObject result=new JSONObject(engine.generate(c.getString("system"),c.getString("user"),cfg));row.put("metrics",result).put("status","cancelled".equals(result.optString("stopReason"))?"cancelled":"ok");}
            catch(Throwable t){row.put("status",cancelled.get()?"cancelled":"failed").put("error",safeError(t));if(t instanceof OutOfMemoryError||safeError(t).contains("ALLOCATION_FAILED"))engine.unload();}
            row.put("cancelRequestToReturnMs","cancelled".equals(row.optString("status"))&&cancelRequestedNs.get()>0?(SystemClock.elapsedRealtimeNanos()-cancelRequestedNs.get())/1e6:JSONObject.NULL).put("totalResponseMs",(SystemClock.elapsedRealtimeNanos()-start)/1e6).put("sampledPeakPssKb",sampling.peak.get()>0?sampling.peak.get():JSONObject.NULL).put("memoryAfter",memory.sample());
        }finally{records.append(row);records.finish(marker);}
        count(row);
        String summary="Runtime success "+successfulRuns+" · failure "+failedRuns+" · cancelled "+cancelledRuns+"\n"+c.getString("id")+" · "+row.toString();ui(()->{output.setText(row.optJSONObject("metrics")!=null?row.optJSONObject("metrics").optString("output"):row.optString("error"));metrics.setText(summary);});
    }
    private void count(JSONObject row){if(!"run".equals(row.optString("type")))return;switch(row.optString("status")){case "ok":successfulRuns++;break;case "failed":failedRuns++;break;case "cancelled":cancelledRuns++;break;default:break;}}

    private JSONObject appInfo()throws Exception{android.content.pm.PackageInfo p=getPackageManager().getPackageInfo(getPackageName(),0);return new JSONObject().put("package",getPackageName()).put("versionName",p.versionName).put("versionCode",Build.VERSION.SDK_INT>=28?p.getLongVersionCode():p.versionCode).put("sourceRevision",dataset.opt("harnessRevision")).put("dirtyBuild",dataset.opt("harnessDirty"));}
    private void exportPicker(int request){Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(request==EXPORT_JSON?"application/json":"text/csv").putExtra(Intent.EXTRA_TITLE,"ledger-ai-benchmark-"+System.currentTimeMillis()+(request==EXPORT_JSON?".json":".csv"));startActivityForResult(i,request);}
    private static String csv(Object x){String v=String.valueOf(x);if(v.startsWith("=")||v.startsWith("+")||v.startsWith("-")||v.startsWith("@"))v="'"+v;return '"'+v.replace("\"","\"\"")+'"';}
    @Override protected void onActivityResult(int request,int result,Intent intent){super.onActivityResult(request,result,intent);if(result!=RESULT_OK||intent==null||intent.getData()==null)return;Uri uri=intent.getData();
        if(request==IMPORT)job("Copying and verifying model into private storage",()->{if(engine!=null)engine.unload();if(!pin.pinned())throw new IOException("MODEL_PIN_UNRESOLVED");if(new StatFs(getFilesDir().getAbsolutePath()).getAvailableBytes()<pin.size+64L*1024*1024)throw new IOException("INSUFFICIENT_PRIVATE_STORAGE");try(InputStream in=getContentResolver().openInputStream(uri)){if(in==null)throw new IOException("MODEL_OPEN_FAILED");ModelVerifier.importModel(in,modelFile,pin,cancelled::get);}});
        else if(request==EXPORT_JSON||request==EXPORT_CSV)job("Exporting synthetic benchmark data",()->{JSONArray rows=records.rows();String value;
            if(request==EXPORT_JSON)value=new JSONObject().put("benchmarkApp",appInfo()).put("formatVersion",1).put("syntheticOnly",true).put("model",manifest).put("contractSha256",dataset.getString("contractSha256")).put("device",memory.device()).put("rows",rows).toString(2);
            else{StringBuilder b=new StringBuilder("type,caseId,status,warmup,threads,context,totalResponseMs,ttftMs,inputTokens,outputTokens,sampledPeakPssKb\n");for(int i=0;i<rows.length();i++){JSONObject r=rows.getJSONObject(i),c=r.optJSONObject("config"),m=r.optJSONObject("metrics");Object[] fields={r.optString("type"),r.optString("caseId"),r.optString("status"),r.optBoolean("warmup"),c==null?"":c.optInt("threads"),c==null?"":c.optInt("context"),r.opt("totalResponseMs"),m==null?"":m.opt("ttftMs"),m==null?"":m.opt("inputTokens"),m==null?"":m.opt("outputTokens"),r.opt("sampledPeakPssKb")};for(int j=0;j<fields.length;j++){if(j>0)b.append(',');b.append(csv(fields[j]));}b.append('\n');}value=b.toString();}
            try(OutputStream out=getContentResolver().openOutputStream(uri,"wt")){if(out==null)throw new IOException("EXPORT_OPEN_FAILED");out.write(value.getBytes(StandardCharsets.UTF_8));}
        });
    }
    @Override protected void onStop(){if(session!=null)session.suspend();super.onStop();}
    @Override protected void onDestroy(){destroyed=true;if(session!=null)session.close();super.onDestroy();}
}

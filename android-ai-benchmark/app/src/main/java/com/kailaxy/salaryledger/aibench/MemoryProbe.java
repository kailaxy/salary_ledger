package com.kailaxy.salaryledger.aibench;
import android.app.*;
import android.content.*;
import android.os.*;
import org.json.*;
import java.io.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;
final class MemoryProbe {
    private final Context context;
    MemoryProbe(Context c){context=c.getApplicationContext();}
    long pssKb(){Debug.MemoryInfo m=new Debug.MemoryInfo();Debug.getMemoryInfo(m);return m.getTotalPss()>0?m.getTotalPss():-1;}
    JSONObject sample() throws JSONException {
        ActivityManager.MemoryInfo memory=new ActivityManager.MemoryInfo();((ActivityManager)context.getSystemService(Context.ACTIVITY_SERVICE)).getMemoryInfo(memory);
        long pss=pssKb();JSONObject j=new JSONObject().put("processPssKb",pss>0?pss:JSONObject.NULL).put("availableDeviceBytes",memory.availMem).put("physicalRamBytes",memory.totalMem).put("systemLowMemory",memory.lowMemory).put("lowMemoryThresholdBytes",memory.threshold);
        try{j.put("airplaneModeEnabled",android.provider.Settings.Global.getInt(context.getContentResolver(),android.provider.Settings.Global.AIRPLANE_MODE_ON,0)!=0);}catch(SecurityException e){j.put("airplaneModeEnabled",JSONObject.NULL);}
        PowerManager power=(PowerManager)context.getSystemService(Context.POWER_SERVICE);j.put("powerSaveMode",power.isPowerSaveMode());j.put("thermalStatus",Build.VERSION.SDK_INT>=29?power.getCurrentThermalStatus():JSONObject.NULL);
        Intent b=context.registerReceiver(null,new IntentFilter(Intent.ACTION_BATTERY_CHANGED));if(b!=null)j.put("batteryTemperatureCelsius",b.hasExtra(BatteryManager.EXTRA_TEMPERATURE)?b.getIntExtra(BatteryManager.EXTRA_TEMPERATURE,0)/10.0:JSONObject.NULL).put("batteryLevel",b.hasExtra(BatteryManager.EXTRA_LEVEL)?b.getIntExtra(BatteryManager.EXTRA_LEVEL,-1):JSONObject.NULL).put("batteryScale",b.hasExtra(BatteryManager.EXTRA_SCALE)?b.getIntExtra(BatteryManager.EXTRA_SCALE,-1):JSONObject.NULL);
        BatteryManager battery=(BatteryManager)context.getSystemService(Context.BATTERY_SERVICE);long charge=battery.getLongProperty(BatteryManager.BATTERY_PROPERTY_CHARGE_COUNTER);j.put("batteryChargeCounterMicroAh",charge>0?charge:JSONObject.NULL);
        JSONArray frequencies=new JSONArray();for(int i=0;i<Runtime.getRuntime().availableProcessors();i++)frequencies.put(numberFile("/sys/devices/system/cpu/cpu"+i+"/cpufreq/scaling_cur_freq"));j.put("cpuFrequencyKhz",frequencies);return j;
    }
    private Object numberFile(String path){try(BufferedReader r=new BufferedReader(new FileReader(path))){return Long.parseLong(r.readLine().trim());}catch(Exception e){return JSONObject.NULL;}}
    JSONObject device() throws JSONException {
        JSONObject j=new JSONObject().put("manufacturer",Build.MANUFACTURER).put("model",Build.MODEL).put("hardware",Build.HARDWARE).put("androidRelease",Build.VERSION.RELEASE).put("api",Build.VERSION.SDK_INT).put("supportedAbis",new JSONArray(Build.SUPPORTED_ABIS)).put("logicalCpuCount",Runtime.getRuntime().availableProcessors());
        j.put("socManufacturer",Build.VERSION.SDK_INT>=31?Build.SOC_MANUFACTURER:JSONObject.NULL).put("socModel",Build.VERSION.SDK_INT>=31?Build.SOC_MODEL:JSONObject.NULL).put("memory",sample());
        JSONArray exits=new JSONArray();try{if(Build.VERSION.SDK_INT>=30){for(ApplicationExitInfo e:((ActivityManager)context.getSystemService(Context.ACTIVITY_SERVICE)).getHistoricalProcessExitReasons(null,0,5))exits.put(new JSONObject().put("timestamp",e.getTimestamp()).put("reason",e.getReason()).put("lowMemoryReason",e.getReason()==ApplicationExitInfo.REASON_LOW_MEMORY).put("pssKb",e.getPss()).put("rssKb",e.getRss()));}}catch(SecurityException e){j.put("processExitHistoryUnavailable",true);}j.put("recentOwnProcessExits",exits);return j;
    }
    final class Sampling implements AutoCloseable {
        final AtomicLong peak=new AtomicLong();final ScheduledExecutorService worker=Executors.newSingleThreadScheduledExecutor();
        Sampling(){peak.set(pssKb());worker.scheduleAtFixedRate(()->{try{peak.accumulateAndGet(pssKb(),Math::max);}catch(RuntimeException ignored){}},0,250,TimeUnit.MILLISECONDS);}
        @Override public void close(){worker.shutdownNow();}
    }
}

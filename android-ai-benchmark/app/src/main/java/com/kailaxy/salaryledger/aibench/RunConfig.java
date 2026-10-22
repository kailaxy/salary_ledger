package com.kailaxy.salaryledger.aibench;
final class RunConfig {
    final int context,threads,maxOutput,seed; final double temperature;
    RunConfig(int context,int threads,int maxOutput,double temperature,int seed){this.context=context;this.threads=threads;this.maxOutput=maxOutput;this.temperature=temperature;this.seed=seed;validate();}
    void validate(){if((context!=1024&&context!=2048)||threads<2||threads>4||maxOutput<1||maxOutput>128||!Double.isFinite(temperature)||temperature<0||temperature>1||seed<0)throw new IllegalArgumentException("Invalid benchmark configuration");}
    static void prompt(String system,String user){if(system==null||user==null||user.trim().isEmpty()||system.length()>12000||user.length()>4000||system.indexOf('\0')>=0||user.indexOf('\0')>=0)throw new IllegalArgumentException("Use a bounded nonempty synthetic prompt");}
}

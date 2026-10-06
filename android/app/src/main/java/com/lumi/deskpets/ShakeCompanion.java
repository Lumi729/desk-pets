package com.lumi.deskpets;
import android.content.Context;
import android.hardware.*;
import android.os.SystemClock;
import android.view.Surface;
import android.view.WindowManager;

/** Low-frequency, opt-in motion input; registration follows overlay visibility. */
final class ShakeCompanion implements SensorEventListener {
    private final SensorManager manager;
    private final WindowManager window;
    private final Runnable onShake;
    private boolean registered,initialized;
    private final float[] gravity=new float[3];
    private long lastHit,lastShake;
    private int hits;
    float tilt;
    ShakeCompanion(Context c,Runnable callback){manager=c.getSystemService(SensorManager.class);window=c.getSystemService(WindowManager.class);onShake=callback;}
    void enabled(boolean on){
        if(on==registered)return;
        if(on){Sensor sensor=manager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);registered=sensor!=null&&manager.registerListener(this,sensor,SensorManager.SENSOR_DELAY_GAME);}
        else{manager.unregisterListener(this);registered=false;initialized=false;tilt=0;hits=0;}
    }
    @Override @SuppressWarnings("deprecation") public void onSensorChanged(SensorEvent e){
        if(!initialized){System.arraycopy(e.values,0,gravity,0,3);initialized=true;return;}
        float strength=0;
        for(int i=0;i<3;i++){gravity[i]=gravity[i]*.85f+e.values[i]*.15f;float d=e.values[i]-gravity[i];strength+=d*d;}
        int rotation=window.getDefaultDisplay().getRotation();
        float x=rotation==Surface.ROTATION_90?-gravity[1]:rotation==Surface.ROTATION_180?-gravity[0]:rotation==Surface.ROTATION_270?gravity[1]:gravity[0];
        tilt=Math.max(-1,Math.min(1,-x/9.81f));
        long now=SystemClock.elapsedRealtime();
        if(strength>100 && now-lastHit>180){if(now-lastHit>1000)hits=0;lastHit=now;if(++hits>=3&&now-lastShake>9000){hits=0;lastShake=now;onShake.run();}}
    }
    @Override public void onAccuracyChanged(Sensor sensor,int accuracy){}
}

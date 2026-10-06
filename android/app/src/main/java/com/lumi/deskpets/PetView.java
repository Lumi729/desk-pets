package com.lumi.deskpets;

import android.content.Context;
import android.graphics.*;
import android.os.SystemClock;
import android.view.View;
import java.io.*;

/** Small, transparent native GIF canvas. No browser or full-screen touch layer. */
@SuppressWarnings("deprecation")
final class PetView extends View {
    private Movie movie;
    private String path="";
    private long started;
    private boolean playing=true;
    private long rainbowUntil;
    private final Paint rainbowPaint=new Paint(Paint.ANTI_ALIAS_FLAG);
    void rainbow(){rainbowUntil=SystemClock.uptimeMillis()+2300;invalidate();}
    PetView(Context context) { super(context); setLayerType(View.LAYER_TYPE_SOFTWARE,null); }
    void show(String asset) {
        if(asset.equals(path) && movie!=null) return;
        try(InputStream input=getContext().getAssets().open(asset)) {
            Movie next=Movie.decodeStream(input);
            if(next!=null) { movie=next; path=asset; started=SystemClock.uptimeMillis(); invalidate(); }
        } catch(IOException ignored) { /* Keep previous frame if an optional clip is unavailable. */ }
    }
    void animate(boolean enabled) { playing=enabled; if(enabled) { started=SystemClock.uptimeMillis(); invalidate(); } }
    @Override public boolean performClick() { super.performClick(); return true; }
    @Override protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if(movie==null) return;
        int duration=movie.duration();
        movie.setTime((int)((SystemClock.uptimeMillis()-started)%Math.max(100,duration)));
        float scale=Math.min((float)getWidth()/movie.width(),(float)getHeight()/movie.height());
        canvas.save();
        canvas.translate((getWidth()-movie.width()*scale)/2f,(getHeight()-movie.height()*scale));
        canvas.scale(scale,scale); movie.draw(canvas,0,0); canvas.restore();
        if(SystemClock.uptimeMillis()<rainbowUntil){
            int[] colors={0xFFF19BAA,0xFFFFC48F,0xFFFFE598,0xFFAEDCB9,0xFFAAD5EF,0xFFC2B0EA};
            rainbowPaint.setStyle(Paint.Style.STROKE);rainbowPaint.setStrokeWidth(Math.max(2,getWidth()*.025f));
            for(int i=0;i<colors.length;i++){rainbowPaint.setColor(colors[i]);float offset=i*getWidth()*.025f;canvas.drawArc(getWidth()*.42f,getHeight()*.65f+offset,getWidth()*.92f,getHeight()*.96f+offset,185,130,false,rainbowPaint);}
        }
        if(playing && isShown() && getWindowVisibility()==VISIBLE && duration>0) postInvalidateDelayed(50);
    }
}

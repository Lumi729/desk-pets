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
        if(playing && isShown() && getWindowVisibility()==VISIBLE && duration>0) postInvalidateDelayed(50);
    }
}

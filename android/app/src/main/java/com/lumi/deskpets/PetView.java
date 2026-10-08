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
    /** One loop of the current clip in ms (the rainbow clip already draws its own rainbow). */
    /** GIF 原图大小（叠叠乐要按它算窗口大小）。 */
    /** 正在播的 GIF（分享表情用）。 */
    String asset(){return path;}
    int gifWidth(){return movie==null?0:movie.width();}
    int gifHeight(){return movie==null?0:movie.height();}
    int duration(){return movie==null?0:Math.max(100,movie.duration());}
    /** Distance from the view top to the GIF's top edge (GIFs are drawn bottom-aligned). */
    float contentTop(){if(movie==null)return 0;float scale=Math.min((float)getWidth()/movie.width(),(float)getHeight()/movie.height());return getHeight()-movie.height()*scale;}
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

package com.lumi.deskpets;

import android.content.Context;
import android.graphics.*;
import android.graphics.drawable.Drawable;
import android.view.View;

/** 设置页的像素小零件（Claude）：像素开关、向下的三角。颜色都来自美化主题。 */
final class PixelUi {
    private PixelUi(){}
    /** 像素开关：打开是主色底、关上是 track 底，白色方块滑块；描边用 rim。 */
    static final class PixelSwitch extends View {
        interface Listener{void changed(boolean on);}
        private final Paint on=new Paint(),off=new Paint(),knob=new Paint(),rim=new Paint();
        private final int block;private boolean checked;private Listener listener;
        PixelSwitch(Context c,int accent,int track,int knobColor,int rimColor,int block){
            super(c);this.block=block;on.setColor(accent);off.setColor(track);knob.setColor(knobColor);rim.setColor(rimColor);
            setClickable(true);setFocusable(true);setOnClickListener(v->set(!checked,true));
        }
        boolean checked(){return checked;}
        void set(boolean value,boolean fromUser){if(value==checked)return;checked=value;invalidate();setContentDescription(value?"已打开":"已关闭");if(fromUser&&listener!=null)listener.changed(value);}
        void listen(Listener l){listener=l;}
        @Override protected void onDraw(Canvas c){
            Rect r=new Rect(0,0,getWidth(),getHeight());
            c.drawPath(IslandPanel.PixelBox.stepped(r,block,2),checked?on:off);
            int size=getHeight()-block*4,top=block*2;
            int left=checked?getWidth()-block*3-size:block*3;
            Rect k=new Rect(left,top,left+size,top+size);
            c.drawPath(IslandPanel.PixelBox.stepped(new Rect(k.left-block/2,k.top-block/2,k.right+block/2,k.bottom+block/2),block,1),rim);
            c.drawPath(IslandPanel.PixelBox.stepped(k,block,1),knob);
        }
    }
    /** 展开时的像素向下三角。 */
    static final class PixelDown extends Drawable {
        private final Paint p=new Paint();private final int block;
        PixelDown(int color,int block){p.setColor(color);this.block=block;}
        @Override public void draw(Canvas c){Rect r=getBounds();for(int i=0;i<3;i++)c.drawRect(r.left+i*block,r.top+i*block,r.left+(6-i)*block,r.top+(i+1)*block,p);}
        @Override public void setAlpha(int a){p.setAlpha(a);}
        @Override public void setColorFilter(ColorFilter f){p.setColorFilter(f);}
        @Override public int getOpacity(){return PixelFormat.TRANSLUCENT;}
    }
    /** 颜色够不够亮（决定状态栏图标用深色还是浅色）。 */
    static boolean light(int color){
        int r=(color>>16)&255,g=(color>>8)&255,b=color&255;
        return (r*299+g*587+b*114)/1000>150;
    }
}

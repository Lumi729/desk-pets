package com.lumi.deskpets;

import android.content.Context;
import android.graphics.*;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * 灵动面板（Claude，照千千的设计稿）：像素台阶边角、11×11 像素图标最近邻放大、正在播放卡片、计时 / 隐藏 / 位置三行，
 * 一只伙伴坐在面板顶边右侧。功能和原来的列表一样，只换外观；点面板外面或关闭按钮收起。
 */
final class IslandPanel {
    /** 面板要用到的东西，都由 PetService 提供。 */
    interface Host {
        boolean mediaEnabled();          // 开了「音乐状态与播放控制」
        IslandMedia media();
        long timerEnd();                 // 计时器结束时间（System.currentTimeMillis），0 = 没有
        void control(int action);        // 0 上一首，1 播放 / 暂停，2 下一首
        void cancelTimer();
        void hideTips();
        void openSettings();
        String petClip();                // 坐在顶边的伙伴的待机 GIF
        void closed();
    }
    static final int BG=0xFF302932,STROKE=0xFF4E4352,CARD=0xFF3D3440,PINK=0xFFEFA7C0,TEXT=0xFFFFF7FA,SUB=0xFFC9B8C2,TRACK=0xFF241E26;
    private final Context context;
    private final WindowManager windows;
    private final Host host;
    private final Handler tick=new Handler(Looper.getMainLooper());
    private final float density;
    private final int block;
    private FrameLayout root;
    private TextView song,timerSub;
    private PixelProgress progress;
    private ImageView playIcon;
    private View prev,play,next,timerRow;
    private boolean playingShown,first=true;

    IslandPanel(Context context,WindowManager windows,Host host){
        this.context=context;this.windows=windows;this.host=host;
        density=context.getResources().getDisplayMetrics().density;
        block=Math.max(2,Math.round(density*2.5f));
    }
    private int dp(float v){return Math.round(v*density);}

    boolean show(int screenWidth,int screenHeight){
        root=new FrameLayout(context);
        root.setOnClickListener(v->dismiss()); // 点面板外面收起
        int width=Math.min(screenWidth-dp(32),dp(340));
        LinearLayout panel=new LinearLayout(context);panel.setOrientation(LinearLayout.VERTICAL);
        panel.setBackground(new PixelBox(BG,STROKE,block,2));panel.setPadding(dp(18),dp(16),dp(18),dp(18));
        panel.setClickable(true); // 面板里面点空白处不收起
        // 标题行：爱心 + 灵动面板 + 关闭
        LinearLayout title=new LinearLayout(context);title.setGravity(Gravity.CENTER_VERTICAL);
        title.addView(icon(R.drawable.ic_panel_heart,15,0));
        TextView name=text("灵动面板",19,TEXT,true);name.setPadding(dp(8),0,0,0);
        title.addView(name,new LinearLayout.LayoutParams(0,-2,1));
        FrameLayout close=square(CARD,dp(30));inCenter(close,icon(R.drawable.ic_panel_close,13,0));
        close.setOnClickListener(v->dismiss());close.setContentDescription("关闭");
        title.addView(close,new LinearLayout.LayoutParams(dp(30),dp(30)));
        panel.addView(title);
        // 正在播放卡片
        LinearLayout card=new LinearLayout(context);card.setOrientation(LinearLayout.VERTICAL);card.setBackground(new PixelBox(CARD,0,block,2));card.setPadding(dp(14),dp(12),dp(14),dp(12));
        card.addView(text("正在播放",12,SUB,false));
        song=text("",17,TEXT,true);song.setSingleLine(true);song.setEllipsize(TextUtils.TruncateAt.END);song.setPadding(0,dp(2),0,dp(8));card.addView(song);
        progress=new PixelProgress(block);View bar=new View(context);bar.setBackground(progress);card.addView(bar,new LinearLayout.LayoutParams(-1,block*3));
        LinearLayout buttons=new LinearLayout(context);buttons.setGravity(Gravity.CENTER);buttons.setPadding(0,dp(12),0,0);
        prev=mediaButton(R.drawable.ic_panel_prev,CARD_DARK,0,"上一首",0);
        play=mediaButton(R.drawable.ic_panel_pause,PINK,BG,"播放 / 暂停",1);playIcon=(ImageView)((FrameLayout)play).getChildAt(0);
        next=mediaButton(R.drawable.ic_panel_next,CARD_DARK,0,"下一首",2);
        for(View b:new View[]{prev,play,next}){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(dp(54),dp(38));p.leftMargin=p.rightMargin=dp(10);buttons.addView(b,p);}
        card.addView(buttons);
        panel.addView(card,margin(dp(14)));
        // 三行：取消计时器（有计时才显示）、隐藏提示 30 秒、位置大小与拖动
        timerRow=row(R.drawable.ic_panel_timer,"取消计时器",true,()->{host.cancelTimer();dismiss();});
        timerSub=(TextView)timerRow.getTag();
        panel.addView(timerRow,margin(dp(12)));
        panel.addView(row(R.drawable.ic_panel_hide,"隐藏提示 30 秒",false,()->{dismiss();host.hideTips();}),margin(dp(10)));
        panel.addView(row(R.drawable.ic_panel_move,"位置、大小与拖动",false,()->{dismiss();host.openSettings();}),margin(dp(10)));
        // 面板 + 坐在顶边右侧的伙伴
        int petSize=dp(64);
        FrameLayout holder=new FrameLayout(context);
        FrameLayout.LayoutParams pp=new FrameLayout.LayoutParams(width,-2);pp.topMargin=petSize-dp(10);holder.addView(panel,pp);
        PetView pet=new PetView(context);String clip=host.petClip();if(clip!=null&&!clip.isEmpty())pet.show(clip);
        FrameLayout.LayoutParams petAt=new FrameLayout.LayoutParams(petSize,petSize);petAt.gravity=Gravity.TOP|Gravity.END;petAt.rightMargin=dp(24);holder.addView(pet,petAt);
        FrameLayout.LayoutParams hp=new FrameLayout.LayoutParams(width,-2);hp.gravity=Gravity.CENTER;root.addView(holder,hp);
        WindowManager.LayoutParams lp=new WindowManager.LayoutParams(WindowManager.LayoutParams.MATCH_PARENT,WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,PixelFormat.TRANSLUCENT);
        try{windows.addView(root,lp);}catch(RuntimeException e){root=null;return false;}
        refresh();
        return true;
    }
    private static final int CARD_DARK=0xFF2E2731;
    void dismiss(){
        tick.removeCallbacksAndMessages(null);
        if(root!=null){if(root.isAttachedToWindow())try{windows.removeView(root);}catch(RuntimeException ignored){}root=null;host.closed();}
    }
    boolean showing(){return root!=null;}
    /** 每半秒更新：歌名、进度条、播放 / 暂停图标、计时器剩余时间。 */
    private void refresh(){
        if(root==null)return;
        IslandMedia m=host.media();
        boolean music=host.mediaEnabled()&&!m.title.isEmpty();
        song.setText(music?m.title+(m.artist.isEmpty()?"":" - "+m.artist):"没有在放歌");
        song.setTextColor(music?TEXT:SUB);
        progress.set(music&&m.duration>0?Math.min(1f,m.now()/(float)m.duration):0f);
        for(View b:new View[]{prev,play,next}){b.setEnabled(music);b.setAlpha(music?1f:.35f);}
        if(first||m.playing!=playingShown){playingShown=m.playing;first=false;playIcon.setImageDrawable(pixels(m.playing?R.drawable.ic_panel_pause:R.drawable.ic_panel_play,BG));}
        long left=host.timerEnd()-System.currentTimeMillis();
        timerRow.setVisibility(left>0?View.VISIBLE:View.GONE);
        if(left>0)timerSub.setText(String.format(java.util.Locale.ROOT,"%02d:%02d 后提醒",left/60000,(left/1000)%60));
        tick.postDelayed(this::refresh,500);
    }
    // ---- 小零件 ----
    private TextView text(String s,float sp,int color,boolean bold){TextView t=new TextView(context);t.setText(s);t.setTextSize(sp);t.setTextColor(color);if(bold)t.setTypeface(Typeface.DEFAULT_BOLD);return t;}
    private LinearLayout.LayoutParams margin(int top){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.topMargin=top;return p;}
    /** 图标放在方块正中间，保持整数倍大小。 */
    private void inCenter(FrameLayout box,ImageView i){int k=i.getLayoutParams().width;FrameLayout.LayoutParams at=new FrameLayout.LayoutParams(k,k);at.gravity=Gravity.CENTER;box.addView(i,at);}
    private FrameLayout square(int color,int size){FrameLayout f=new FrameLayout(context);f.setBackground(new PixelBox(color,0,block,1));f.setMinimumWidth(size);f.setMinimumHeight(size);f.setClickable(true);return f;}
    /** 11×11 的像素图标，按整数倍最近邻放大到大约 targetDp。 */
    private ImageView icon(int res,float targetDp,int tint){
        ImageView v=new ImageView(context);v.setImageDrawable(pixels(res,tint));
        int k=Math.max(1,Math.round(targetDp*density/11f));v.setLayoutParams(new LinearLayout.LayoutParams(11*k,11*k));
        v.setScaleType(ImageView.ScaleType.FIT_XY);
        return v;
    }
    private Drawable pixels(int res,int tint){
        BitmapDrawable d=new BitmapDrawable(context.getResources(),BitmapFactory.decodeResource(context.getResources(),res));
        d.setFilterBitmap(false);d.setAntiAlias(false);
        if(tint!=0)d.setColorFilter(new PorterDuffColorFilter(tint,PorterDuff.Mode.SRC_IN));
        return d;
    }
    private View mediaButton(int res,int color,int tint,String label,int action){
        FrameLayout b=square(color,dp(38));b.setContentDescription(label);
        inCenter(b,icon(res,18,tint));
        b.setOnClickListener(v->{host.control(action);tick.removeCallbacksAndMessages(null);tick.postDelayed(this::refresh,400);}); // 放歌按钮不收起面板
        return b;
    }
    /** 一行：左边图标方块、文字（可带一行小字）、右边像素箭头。小字 TextView 放在 tag 里。 */
    private View row(int res,String label,boolean withSub,Runnable action){
        LinearLayout r=new LinearLayout(context);r.setGravity(Gravity.CENTER_VERTICAL);r.setBackground(new PixelBox(CARD,0,block,2));r.setPadding(dp(10),dp(10),dp(14),dp(10));r.setClickable(true);
        FrameLayout box=square(BG,dp(36));inCenter(box,icon(res,22,0));box.setClickable(false);
        r.addView(box,new LinearLayout.LayoutParams(dp(36),dp(36)));
        LinearLayout words=new LinearLayout(context);words.setOrientation(LinearLayout.VERTICAL);words.setPadding(dp(12),0,0,0);
        words.addView(text(label,15,TEXT,true));
        if(withSub){TextView sub=text("",12,SUB,false);words.addView(sub);r.setTag(sub);}
        r.addView(words,new LinearLayout.LayoutParams(0,-2,1));
        View arrow=new View(context);arrow.setBackground(new PixelChevron(SUB,block));r.addView(arrow,new LinearLayout.LayoutParams(block*3,block*5));
        r.setOnClickListener(v->action.run());r.setContentDescription(label);
        return r;
    }

    /** 像素台阶边角的方块（和灵动岛一样不圆角）：steps 级台阶，每级一个 block；stroke 为 0 就不描边。 */
    static final class PixelBox extends Drawable {
        private final Paint fill=new Paint(),line=new Paint();private final int block,steps;private final boolean stroked;
        PixelBox(int fillColor,int strokeColor,int block,int steps){fill.setColor(fillColor);line.setColor(strokeColor);this.block=block;this.steps=steps;stroked=strokeColor!=0;fill.setAntiAlias(false);line.setAntiAlias(false);}
        static Path stepped(Rect r,int b,int steps){
            Path p=new Path();int s=steps*b;
            p.moveTo(r.left+s,r.top);p.lineTo(r.right-s,r.top);
            for(int i=1;i<=steps;i++){p.lineTo(r.right-s+(i-1)*b,r.top+i*b);p.lineTo(r.right-s+i*b,r.top+i*b);} // 右上台阶
            p.lineTo(r.right,r.bottom-s);
            for(int i=1;i<=steps;i++){p.lineTo(r.right-(i-1)*b,r.bottom-s+i*b);p.lineTo(r.right-i*b,r.bottom-s+i*b);} // 右下
            p.lineTo(r.left+s,r.bottom);
            for(int i=1;i<=steps;i++){p.lineTo(r.left+s-(i-1)*b,r.bottom-i*b);p.lineTo(r.left+s-i*b,r.bottom-i*b);} // 左下
            p.lineTo(r.left,r.top+s);
            for(int i=1;i<=steps;i++){p.lineTo(r.left+(i-1)*b,r.top+s-i*b);p.lineTo(r.left+i*b,r.top+s-i*b);} // 左上
            p.close();return p;
        }
        @Override public void draw(Canvas c){
            Rect r=getBounds();
            if(stroked){c.drawPath(stepped(r,block,steps),line);Rect in=new Rect(r.left+block,r.top+block,r.right-block,r.bottom-block);c.drawPath(stepped(in,block,steps),fill);}
            else c.drawPath(stepped(r,block,steps),fill);
        }
        @Override public void setAlpha(int a){fill.setAlpha(a);line.setAlpha(a);}
        @Override public void setColorFilter(ColorFilter f){fill.setColorFilter(f);line.setColorFilter(f);}
        @Override public int getOpacity(){return PixelFormat.TRANSLUCENT;}
    }
    /** 像素进度条：深色底槽、粉色已播部分、粉色小方块滑块。 */
    static final class PixelProgress extends Drawable {
        private final Paint track=new Paint(),done=new Paint();private final int block;private float value;
        PixelProgress(int block){this.block=block;track.setColor(TRACK);done.setColor(PINK);}
        void set(float v){if(Math.abs(v-value)>.001f){value=v;invalidateSelf();}}
        @Override public void draw(Canvas c){
            Rect r=getBounds();int cy=r.centerY(),h=block*2;
            c.drawRect(r.left,cy-h/2f,r.right,cy+h/2f,track);
            int x=r.left+Math.round((r.width()-block*3)*value);
            c.drawRect(r.left,cy-h/2f,x,cy+h/2f,done);
            c.drawRect(x,r.top,x+block*3,r.bottom,done);
        }
        @Override public void setAlpha(int a){track.setAlpha(a);done.setAlpha(a);}
        @Override public void setColorFilter(ColorFilter f){track.setColorFilter(f);done.setColorFilter(f);}
        @Override public int getOpacity(){return PixelFormat.TRANSLUCENT;}
    }
    /** 像素箭头「>」。 */
    static final class PixelChevron extends Drawable {
        private final Paint p=new Paint();private final int block;
        PixelChevron(int color,int block){p.setColor(color);this.block=block;}
        @Override public void draw(Canvas c){Rect r=getBounds();int[] xs={0,1,2,1,0};for(int i=0;i<5;i++)c.drawRect(r.left+xs[i]*block,r.top+i*block,r.left+(xs[i]+1)*block,r.top+(i+1)*block,p);}
        @Override public void setAlpha(int a){p.setAlpha(a);}
        @Override public void setColorFilter(ColorFilter f){p.setColorFilter(f);}
        @Override public int getOpacity(){return PixelFormat.TRANSLUCENT;}
    }
}

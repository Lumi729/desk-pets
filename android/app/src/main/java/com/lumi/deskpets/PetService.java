package com.lumi.deskpets;

import android.app.*;
import android.content.*;
import android.content.res.Configuration;
import android.graphics.PixelFormat;
import android.os.*;
import android.provider.Settings;
import android.view.*;
import android.widget.Toast;
import java.util.*;

public final class PetService extends Service {
    private final Handler clock=new Handler(Looper.getMainLooper());
    private final List<Actor> actors=new ArrayList<>();
    private final Random random=new Random();
    private WindowManager windows;
    private Catalog catalog;
    private boolean paused,screenOn=true,walking=true,destroyed;
    private int width,height,unit;
    private long lastFrame,hugEnd;
    private Actor hugA,hugB;
    private final BroadcastReceiver screen=new BroadcastReceiver(){@Override public void onReceive(Context c,Intent i){screenOn=!Intent.ACTION_SCREEN_OFF.equals(i.getAction());refreshVisibility();}};
    private final Runnable loop=new Runnable(){public void run(){if(destroyed)return;if(!Settings.canDrawOverlays(PetService.this)){stopSelf();return;}long now=SystemClock.uptimeMillis();float dt=Math.min(.05f,(now-lastFrame)/1000f);lastFrame=now;if(screenOn&&!paused)tick(now,dt);clock.postDelayed(this,screenOn&&!paused?50:1000);}};
    private final class Actor {
        final Catalog.Pet pet;
        final PetView view;
        final WindowManager.LayoutParams pos;
        float x,y,velocity;
        int direction;
        long until,decision,cooldown;
        String action="待机";
        boolean dragging,falling;
        @android.annotation.SuppressLint("RtlHardcoded") // Overlay physics use physical screen coordinates.
        Actor(Catalog.Pet p,int index){pet=p;view=new PetView(PetService.this);view.setContentDescription(p.label+"，点击摸摸，拖动移动，长按设置");pos=new WindowManager.LayoutParams(unit,unit,WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,PixelFormat.TRANSLUCENT);pos.gravity=Gravity.TOP|Gravity.LEFT;x=Math.min(maxX(this),unit*.2f+index*unit*1.05f);y=floor();view.show(p.clip(action));decision=SystemClock.uptimeMillis()+2000+random.nextInt(3000);setTouch(this);}
        int floor(){return Math.max(0,height-unit);}
        void play(String next,long duration){action=next;until=SystemClock.uptimeMillis()+duration;view.show(pet.clip(next));}
    }
    @Override public void onCreate(){
        super.onCreate();windows=(WindowManager)getSystemService(WINDOW_SERVICE);
        getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel("pets","桌宠陪伴",NotificationManager.IMPORTANCE_LOW));
        screenOn=getSystemService(PowerManager.class).isInteractive();
        IntentFilter filter=new IntentFilter();filter.addAction(Intent.ACTION_SCREEN_OFF);filter.addAction(Intent.ACTION_SCREEN_ON);
        if(Build.VERSION.SDK_INT>=33)registerReceiver(screen,filter,Context.RECEIVER_NOT_EXPORTED);else registerReceiver(screen,filter);
        try{catalog=new Catalog(this);}catch(Exception e){stopSelf();}
    }
    @Override public int onStartCommand(Intent intent,int flags,int startId){
        String action=intent==null?"stop":intent.getAction();
        if("stop".equals(action)){stopSelf();return START_NOT_STICKY;}
        if(!Settings.canDrawOverlays(this)||catalog==null){stopSelf();return START_NOT_STICKY;}
        startForeground(7,notification());
        if(actors.isEmpty()||"start".equals(action)||"hug".equals(action))rebuild();
        if("toggle".equals(action)){paused=!paused;refreshVisibility();}
        if("hug".equals(action)){
            paused=false;refreshVisibility();boolean found=false;
            for(int a=0;a<actors.size()&&!found;a++)for(int b=a+1;b<actors.size()&&!found;b++)found=beginHug(actors.get(a),actors.get(b));
            if(!found)Toast.makeText(this,"这组伙伴没有双人贴贴，试试猫猫和狗狗吧",Toast.LENGTH_LONG).show();
        }
        getSystemService(NotificationManager.class).notify(7,notification());
        clock.removeCallbacks(loop);lastFrame=SystemClock.uptimeMillis();clock.post(loop);return START_NOT_STICKY;
    }
    private Notification notification(){
        PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent toggle=PendingIntent.getService(this,1,new Intent(this,PetService.class).setAction("toggle"),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent stop=PendingIntent.getService(this,2,new Intent(this,PetService.class).setAction("stop"),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Builder(this,"pets").setSmallIcon(R.drawable.ic_pet).setContentTitle(paused?"伙伴们休息中":"梨间雪的小伙伴陪着你").setContentText("点这里选宠 · 长按宠物也能打开设置").setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true).addAction(new Notification.Action.Builder(null,paused?"继续":"收起",toggle).build()).addAction(new Notification.Action.Builder(null,"全部回家",stop).build()).build();
    }
    @SuppressWarnings("deprecation") private void measure(){
        if(Build.VERSION.SDK_INT>=30){WindowMetrics m=windows.getCurrentWindowMetrics();android.graphics.Insets i=m.getWindowInsets().getInsetsIgnoringVisibility(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());width=m.getBounds().width()-i.left-i.right;height=m.getBounds().height()-i.top-i.bottom;}
        else{android.util.DisplayMetrics m=new android.util.DisplayMetrics();windows.getDefaultDisplay().getMetrics(m);width=m.widthPixels;height=m.heightPixels;}
    }
    private void rebuild(){
        clearActors();paused=false;measure();android.content.SharedPreferences p=getSharedPreferences("pets",MODE_PRIVATE);
        unit=Math.round(Math.max(56,Math.min(136,p.getInt("size",88)))*getResources().getDisplayMetrics().density);unit=Math.min(unit,Math.max(1,width/2));walking=p.getBoolean("walking",true);
        Set<String> ids=p.getStringSet("selected",new HashSet<>(Arrays.asList("pet0","pet2")));
        try{for(Catalog.Pet pet:catalog.pets)if(ids.contains(pet.id)&&actors.size()<3){Actor actor=new Actor(pet,actors.size());actor.pos.x=(int)actor.x;actor.pos.y=(int)actor.y;windows.addView(actor.view,actor.pos);actors.add(actor);}}
        catch(RuntimeException e){Toast.makeText(this,"悬浮窗未能开启，请检查系统权限",Toast.LENGTH_LONG).show();stopSelf();}
        if(actors.isEmpty())stopSelf();refreshVisibility();
    }
    private int maxX(Actor a){return Math.max(0,width-a.pos.width);}
    private void position(Actor a){a.x=Math.max(0,Math.min(maxX(a),a.x));a.y=Math.max(0,Math.min(a.floor(),a.y));a.pos.x=Math.round(a.x);a.pos.y=Math.round(a.y);if(a.view.isAttachedToWindow())try{windows.updateViewLayout(a.view,a.pos);}catch(RuntimeException e){stopSelf();}}
    private void tick(long now,float dt){
        if(hugA!=null&&now>=hugEnd)endHug();
        for(Actor a:actors){
            if(a==hugA||a==hugB||a.dragging)continue;
            if(a.falling){a.velocity+=unit*5*dt;a.y+=a.velocity*dt;if(a.y>=a.floor()){a.y=a.floor();a.falling=false;a.play("摔趴趴",1400);}position(a);continue;}
            if(a.until>now)continue;
            if(!a.action.equals("待机")&&!a.action.equals("向左走")&&!a.action.equals("向右走")){a.play("待机",0);a.decision=now+1500;}
            if(now>=a.decision){a.direction=walking?random.nextInt(3)-1:0;a.play(a.direction<0?"向左走":a.direction>0?"向右走":"待机",0);a.decision=now+2500+random.nextInt(4000);}
            if(a.direction!=0){a.x+=a.direction*unit*.22f*dt;if(a.x<=0||a.x>=maxX(a)){a.direction=-a.direction;a.play(a.direction<0?"向左走":"向右走",0);}position(a);}
        }
        if(hugA==null)for(int i=0;i<actors.size();i++)for(int j=i+1;j<actors.size();j++){
            Actor a=actors.get(i),b=actors.get(j);
            if(!a.dragging&&!b.dragging&&!a.falling&&!b.falling&&now>a.cooldown&&now>b.cooldown&&now>a.until&&now>b.until&&Math.abs(a.x-b.x)<unit*.65f&&Math.abs(a.y-b.y)<unit*.25f){if(beginHug(a,b))return;}
        }
    }
    private boolean beginHug(Actor a,Actor b){
        String clip=catalog.hug(a.pet,b.pet);if(clip.isEmpty()||hugA!=null)return false;
        hugA=a;hugB=b;a.direction=b.direction=0;a.falling=b.falling=false;a.dragging=b.dragging=false;
        a.pos.width=Math.min(width,unit*2);a.x=(a.x+b.x)/2;a.y=a.floor();a.view.show(clip);b.view.setVisibility(View.GONE);b.view.animate(false);position(a);hugEnd=SystemClock.uptimeMillis()+5500;return true;
    }
    private void endHug(){
        if(hugA==null)return;Actor a=hugA,b=hugB;hugA=hugB=null;a.pos.width=unit;a.play("待机",0);b.play("待机",0);a.cooldown=b.cooldown=SystemClock.uptimeMillis()+20000;
        a.x=Math.min(a.x,Math.max(0,width-unit*2.1f));b.x=a.x+unit*1.05f;b.y=a.y;a.decision=b.decision=SystemClock.uptimeMillis()+2000;position(a);position(b);refreshVisibility();
    }
    private void setTouch(Actor a){
        a.view.setOnClickListener(v->{a.direction=0;a.play("摸摸头",2000);});
        a.view.setOnLongClickListener(v->{openSettings();return true;});
        a.view.setOnTouchListener(new View.OnTouchListener(){float downX,downY,startX,startY;boolean moved,longPressed;final int slop=ViewConfiguration.get(PetService.this).getScaledTouchSlop();final Runnable hold=()->{longPressed=true;a.dragging=false;a.view.performLongClick();};
            public boolean onTouch(View v,MotionEvent e){switch(e.getActionMasked()){
                case MotionEvent.ACTION_DOWN:
                    if(a==hugA||a==hugB)endHug();downX=e.getRawX();downY=e.getRawY();startX=a.x;startY=a.y;moved=longPressed=false;a.dragging=true;a.falling=false;a.direction=0;clock.postDelayed(hold,600);return true;
                case MotionEvent.ACTION_MOVE:
                    float dx=e.getRawX()-downX,dy=e.getRawY()-downY;if(Math.hypot(dx,dy)>slop){moved=true;clock.removeCallbacks(hold);}if(moved&&!longPressed){a.x=startX+dx;a.y=startY+dy;a.view.show(a.pet.clip("掉落"));position(a);}return true;
                case MotionEvent.ACTION_UP:case MotionEvent.ACTION_CANCEL:
                    clock.removeCallbacks(hold);a.dragging=false;
                    if(moved||e.getActionMasked()==MotionEvent.ACTION_CANCEL||longPressed){a.falling=a.y<a.floor();a.velocity=0;if(a.falling)a.play("掉落",0);else a.play("待机",0);}
                    else{v.performClick();}return true;
                default:return true;
            }}
        });
    }
    private void openSettings(){try{startActivity(new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_SINGLE_TOP));}catch(RuntimeException ignored){}}
    private void refreshVisibility(){for(Actor a:actors){boolean visible=screenOn&&!paused&&a!=hugB;a.view.setVisibility(visible?View.VISIBLE:View.GONE);a.view.animate(visible);}}
    private void clearActors(){hugA=hugB=null;clock.removeCallbacksAndMessages(null);for(Actor a:actors){a.view.animate(false);if(a.view.isAttachedToWindow())windows.removeView(a.view);}actors.clear();}
    @Override public void onConfigurationChanged(Configuration config){super.onConfigurationChanged(config);endHug();measure();for(Actor a:actors){a.y=a.floor();a.dragging=a.falling=false;position(a);}}
    @Override public void onDestroy(){destroyed=true;clock.removeCallbacksAndMessages(null);clearActors();unregisterReceiver(screen);stopForeground(STOP_FOREGROUND_REMOVE);super.onDestroy();}
    @Override public IBinder onBind(Intent i){return null;}
}

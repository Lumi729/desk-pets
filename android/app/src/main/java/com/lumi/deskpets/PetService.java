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
    private int width,height,unit,keyboardFloor=-1,originX,originY;
    private String surfaceApp="";
    private List<Perch> surfaces=Collections.emptyList();
    private long lastFrame,hugEnd,demoUntil,typingDemoUntil;
    private HandlerThread usageThread;
    private Handler usageClock;
    private UsageCompanion usage;
    private volatile boolean observeApps;
    private volatile String companionMode="none";
    private final Runnable usageLoop=new Runnable(){public void run(){
        if(observeApps && getSharedPreferences("pets",MODE_PRIVATE).getBoolean("companion",false)) companionMode=usage.poll();
        else { usage.clear(); companionMode="none"; }
        weather.poll(observeApps); // 天气：开关开着、桌宠看得见时最多 30 分钟查一次
        usageClock.postDelayed(this,2000);
    }};
    private Actor hugA,hugB;
    // 天气与季节换装（默认关闭）：只替换平时的待机，不打断别的动作
    private WeatherCompanion weather;
    private String weatherDemo;
    private int weatherDemoStep=-1;
    private ShakeCompanion motion;
    private android.widget.TextView island;
    private long islandUntil,islandDismissed,lastDelivery;
    private String islandMessage="";
    private IslandMedia media;
    private String batteryLabel="";
    private boolean islandFromNotice;
    private AlertDialog islandPanel;
    private long nextMediaCheck,lastNotice,timerFinishedUntil;
    // 灵动岛：像素胶囊背景；通知出现时一只伙伴挂在下面（「通知时挂在提示条下」开关默认关闭，演示除外）
    private IslandBackground islandArt;
    private int islandBlock;
    private boolean islandNotice;
    private long hangSkipUntil;

    private final BroadcastReceiver screen=new BroadcastReceiver(){@Override public void onReceive(Context c,Intent i){screenOn=!Intent.ACTION_SCREEN_OFF.equals(i.getAction());refreshVisibility();}};
    private final Runnable loop=new Runnable(){public void run(){if(destroyed)return;if(!Settings.canDrawOverlays(PetService.this)){stopSelf();return;}long now=SystemClock.uptimeMillis();float dt=Math.min(.05f,(now-lastFrame)/1000f);lastFrame=now;checkTimer();if(screenOn&&!paused)tick(now,dt);clock.postDelayed(this,screenOn&&!paused?50:1000);}};
    private final class Actor {
        final Catalog.Pet pet;
        final PetView view;
        final WindowManager.LayoutParams pos;
        float x,y,velocity,ballX,ballY;
        long ballEnd;
        int direction;
        long until,decision,cooldown,lastTap;
        String action="待机";
        boolean dragging,falling,bouncing,rainbowAfter;
        int hang; // 0 平时，1 跑到提示条下面，2 跳上去，3 挂着
        long hangStart;
        float hangFromX,hangFromY;
        Perch perch,target;
        float hopX,hopY;
        long hopStart,nextHop;
        @android.annotation.SuppressLint("RtlHardcoded") // Overlay physics use physical screen coordinates.
        Actor(Catalog.Pet p,int index){pet=p;view=new PetView(PetService.this);view.setContentDescription(p.label+"，点击摸摸，拖动移动，长按设置");pos=new WindowManager.LayoutParams(unit,unit,WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,PixelFormat.TRANSLUCENT);pos.gravity=Gravity.TOP|Gravity.LEFT;x=Math.min(maxX(this),unit*.2f+index*unit*1.05f);y=floor();view.show(p.clip(action));decision=SystemClock.uptimeMillis()+2000+random.nextInt(3000);setTouch(this);}
        int floor(){return Math.max(0,(keyboardFloor>=0?Math.min(height,keyboardFloor):height)-unit);}
        int landing(){return perch==null?floor():Math.min(floor(),perch.top-unit);}
        void play(String next,long duration){action=next;until=SystemClock.uptimeMillis()+duration;view.show(pet.clip(next));}
    }
    @Override public void onCreate(){
        super.onCreate();windows=(WindowManager)getSystemService(WINDOW_SERVICE);
        getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel("pets","桌宠陪伴",NotificationManager.IMPORTANCE_LOW));
        screenOn=getSystemService(PowerManager.class).isInteractive();
        IntentFilter filter=new IntentFilter();filter.addAction(Intent.ACTION_SCREEN_OFF);filter.addAction(Intent.ACTION_SCREEN_ON);
        if(Build.VERSION.SDK_INT>=33)registerReceiver(screen,filter,Context.RECEIVER_NOT_EXPORTED);else registerReceiver(screen,filter);
        weather=new WeatherCompanion(this);media=new IslandMedia(this);motion=new ShakeCompanion(this,()->bounceParty());usage=new UsageCompanion(this);usageThread=new HandlerThread("pet-app-companion");usageThread.start();usageClock=new Handler(usageThread.getLooper());usageClock.post(usageLoop);
        try{catalog=new Catalog(this);}catch(Exception e){stopSelf();}
    }
    @Override public int onStartCommand(Intent intent,int flags,int startId){
        String action=intent==null?"stop":intent.getAction();
        if("stop".equals(action)){stopSelf();return START_NOT_STICKY;}
        if(!Settings.canDrawOverlays(this)||catalog==null){stopSelf();return START_NOT_STICKY;}
        startForeground(7,notification());
        if(actors.isEmpty()||"start".equals(action)||"hug".equals(action)||(action!=null&&action.startsWith("test-")))rebuild();
        if("start".equals(action)&&UpdateChecker.due(getSharedPreferences("pets",MODE_PRIVATE)))UpdateChecker.check(this,(version,url)->{ // 自动检查更新（默认关闭）
            if(version==null||destroyed)return;
            PendingIntent open=PendingIntent.getActivity(this,3,new Intent(this,MainActivity.class).setAction("update"),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
            getSystemService(NotificationManager.class).notify(9,new Notification.Builder(this,"pets").setSmallIcon(R.drawable.ic_pet).setColor(0xFFEFA7C0).setLargeIcon(android.graphics.drawable.Icon.createWithResource(this,R.drawable.ic_qianqian_large)).setContentTitle("桌宠有新版本 "+version).setContentText("点这里下载更新").setContentIntent(open).setAutoCancel(true).build());
        });
        if("test-shake".equals(action))bounceParty();
        if("test-rainbow".equals(action)){long now=SystemClock.uptimeMillis();for(Actor a:actors)spitRainbow(a,now);}
        if("test-hang".equals(action))hangDemo();
        if("test-show".equals(action)){bounceParty();clock.postDelayed(this::hangDemo,9000);clock.postDelayed(this::weatherDemoStart,18000);}
        if("test-weather".equals(action))weatherDemoStart();
        if("test-island".equals(action)){islandMessage="演示：外卖通知提醒";islandUntil=SystemClock.uptimeMillis()+6000;islandDismissed=0;showIsland(islandMessage);}
        if("test-narrow".equals(action)){
            endHug();Perch narrow=new Perch(width/2-unit/3,height/2,width/2+unit/3);surfaces=Arrays.asList(narrow);demoUntil=SystemClock.uptimeMillis()+7000;
            for(Actor a:actors){a.perch=narrow;a.x=narrow.x(unit,width);a.y=narrow.top-unit;a.nextHop=SystemClock.uptimeMillis()+2500;a.direction=1;position(a);}
        }
        if("test-jump".equals(action))for(Actor a:actors)jump(a);
        if("test-perch".equals(action)){
            endHug();surfaces=Arrays.asList(new Perch(0,height/2,width/2),new Perch(width/2,height*2/3,width),new Perch(0,height*5/6,width/2));
            demoUntil=SystemClock.uptimeMillis()+12000;for(Actor a:actors)a.nextHop=0;
        }
        if("test-drop".equals(action)){
            endHug();typingDemoUntil=SystemClock.uptimeMillis()+6500;
            for(Actor a:actors){a.y=Math.max(0,a.floor()-unit*2);a.play("敲代码",0);startFall(a,SystemClock.uptimeMillis());position(a);}
        }
        if(action!=null && action.startsWith("test-") && !"test-jump".equals(action) && !"test-perch".equals(action) && !"test-drop".equals(action)){
            endHug();String clip=AppCompanion.clip(action.substring(5));
            if(!clip.isEmpty())for(Actor a:actors){a.direction=0;a.play(clip,6500);}
        }
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
        return new Notification.Builder(this,"pets").setSmallIcon(R.drawable.ic_pet).setColor(0xFFEFA7C0).setLargeIcon(android.graphics.drawable.Icon.createWithResource(this,R.drawable.ic_qianqian_large)).setContentTitle(paused?"伙伴们休息中":"梨间雪的小伙伴陪着你").setContentText("点这里选宠 · 长按宠物也能打开设置").setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true).addAction(new Notification.Action.Builder(null,paused?"继续":"收起",toggle).build()).addAction(new Notification.Action.Builder(null,"全部回家",stop).build()).build();
    }
    @SuppressWarnings("deprecation") private void measure(){
        if(Build.VERSION.SDK_INT>=30){WindowMetrics m=windows.getCurrentWindowMetrics();android.graphics.Insets i=m.getWindowInsets().getInsetsIgnoringVisibility(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());width=m.getBounds().width()-i.left-i.right;height=m.getBounds().height()-i.top-i.bottom;}
        else{android.util.DisplayMetrics m=new android.util.DisplayMetrics();windows.getDefaultDisplay().getMetrics(m);width=m.widthPixels;height=m.heightPixels;}
    }
    private void rebuild(){
        clearActors();paused=false;keyboardFloor=-1;surfaceApp="";surfaces=Collections.emptyList();demoUntil=typingDemoUntil=0;measure();android.content.SharedPreferences p=getSharedPreferences("pets",MODE_PRIVATE);
        unit=Math.round(Math.max(56,Math.min(136,p.getInt("size",88)))*getResources().getDisplayMetrics().density);unit=Math.min(unit,Math.max(1,width/2));walking=p.getBoolean("walking",true);
        Set<String> ids=p.getStringSet("selected",new HashSet<>(Arrays.asList("pet0","pet2")));
        try{for(Catalog.Pet pet:catalog.pets)if(ids.contains(pet.id)&&actors.size()<3){Actor actor=new Actor(pet,actors.size());actor.pos.x=(int)actor.x;actor.pos.y=(int)actor.y;windows.addView(actor.view,actor.pos);actors.add(actor);}}
        catch(RuntimeException e){Toast.makeText(this,"悬浮窗未能开启，请检查系统权限",Toast.LENGTH_LONG).show();stopSelf();}
        if(actors.isEmpty())stopSelf();refreshVisibility();
    }
    /** 平时的待机：特殊天气 > 季节 > 其它天气 > 普通待机（和电脑版一样）。 */
    private String idle(Actor a){
        if(weatherDemo!=null)return a.pet.clips.has(weatherDemo)?weatherDemo:"待机";
        if(!getSharedPreferences("pets",MODE_PRIVATE).getBoolean("weather",false))return "待机";
        return Weather.pick(weather.idle(),WeatherCompanion.season(),a.pet.clips::has);
    }
    private static boolean idling(String action){return action.startsWith("待机");}
    private int maxX(Actor a){return Math.max(0,width-a.pos.width);}
    private void position(Actor a){a.x=Math.max(0,Math.min(maxX(a),a.x));a.y=Math.max(0,Math.min(a.floor(),a.y));a.pos.x=Math.round(a.x);a.pos.y=Math.round(a.y);if(a.view.isAttachedToWindow())try{windows.updateViewLayout(a.view,a.pos);}catch(RuntimeException e){stopSelf();}}
    private void updateInterface(long now){
        InterfaceCompanion.Snapshot state=InterfaceCompanion.snapshot;
        if(!actors.isEmpty()){
            Actor a=actors.get(0);int[] location=new int[2];a.view.getLocationOnScreen(location);
            originX=location[0]-a.pos.x;originY=location[1]-a.pos.y;
        }
        int nextFloor=state.keyboardTop<0?-1:Math.max(0,state.keyboardTop-originY);
        boolean changed=nextFloor!=keyboardFloor || !state.pkg.equals(surfaceApp);
        if(changed){endHug();keyboardFloor=nextFloor;surfaceApp=state.pkg;}
        if(now>=demoUntil){
            List<Perch> local=new ArrayList<>();
            if(getSharedPreferences("pets",MODE_PRIVATE).getBoolean("perching",false))for(Perch p:state.perches){
                Perch q=new Perch(p.left-originX,p.top-originY,p.right-originX);
                if(q.fits(unit,Math.max(0,(keyboardFloor<0?height:keyboardFloor)-unit)))local.add(q);
            }
            surfaces=local;
        }
        for(Actor a:actors){
            boolean missing=a.perch!=null && surfaces.stream().noneMatch(p->p.near(a.perch));
            boolean lostTarget=a.target!=null && surfaces.stream().noneMatch(p->p.near(a.target));
            if(a.ballEnd>now||a.hang!=0)continue;
            if(changed||missing||lostTarget){
                a.perch=a.target=null;a.hopStart=0;a.nextHop=now+1500;
                if(!a.dragging && a.y<a.floor() && !a.falling)startFall(a,now);
            }
            if(!a.dragging && !a.falling && a.hopStart==0 && a.perch==null && a.y<a.floor())startFall(a,now);
            if(!a.dragging && a.y>a.floor()){a.y=a.floor();a.perch=a.target=null;a.hopStart=0;a.falling=false;position(a);}
        }
    }
    private void startFall(Actor a,long now){
        a.perch=a.target=null;a.hopStart=0;a.direction=0;a.bouncing=false;
        a.falling=true;a.velocity=0;a.nextHop=now+1500;a.play("掉落",0);
    }
    private void hopTo(Actor a,Perch p,long now){
        a.direction=0;a.falling=false;a.perch=null;a.target=p;a.hopX=a.x;a.hopY=a.y;a.hopStart=now;a.play("开心蹦蹦",0);
    }
    private void tick(long now,float dt){
        android.content.SharedPreferences options=getSharedPreferences("pets",MODE_PRIVATE);
        boolean unlocked=!getSystemService(KeyguardManager.class).isKeyguardLocked();
        motion.enabled(unlocked&&options.getBoolean("motion",false));
        updateIsland(now,options,unlocked);
        updateInterface(now);
        updateHanger(now,options);
        if(hugA!=null&&now>=hugEnd)endHug();
        for(Actor a:actors){
            if(a==hugA||a==hugB||a.dragging)continue;
            if(a.hang!=0){hang(a,now,dt);continue;}
            if(a.ballEnd>now){
                a.ballX+=motion.tilt*unit*5*dt;a.ballY+=unit*4*dt;
                a.x+=a.ballX*dt;a.y+=a.ballY*dt;
                if(a.x<=0){a.x=0;a.ballX=Math.abs(a.ballX)*.78f;}else if(a.x>=maxX(a)){a.x=maxX(a);a.ballX=-Math.abs(a.ballX)*.78f;}
                if(a.y<=0){a.y=0;a.ballY=Math.abs(a.ballY)*.78f;}else if(a.y>=a.floor()){a.y=a.floor();a.ballY=-Math.abs(a.ballY)*.78f;}
                position(a);continue;
            }
            if(a.ballEnd!=0){a.ballEnd=0;startFall(a,now);a.rainbowAfter=true;} // 落地后吐彩虹（GIF 里画好了彩虹）
            if(a.hopStart>0){
                float progress=Math.min(1,(now-a.hopStart)/700f);
                a.x=a.hopX+(a.target.x(unit,width)-a.hopX)*progress;
                a.y=a.hopY+(a.target.top-unit-a.hopY)*progress-unit*.7f*4*progress*(1-progress);
                position(a);
                if(progress>=1){a.perch=a.target;a.target=null;a.hopStart=0;a.play(idle(a),0);a.nextHop=now+2000+random.nextInt(1500);}
                continue;
            }
            if(a.falling){
                float before=a.y;a.velocity+=unit*5*dt;a.y+=a.velocity*dt;
                if(a.velocity>=0){Perch caught=Perch.catchFall(surfaces,a.x,before,a.y,unit,a.floor());if(caught!=null){a.perch=caught;a.y=caught.top-unit;a.nextHop=now+3000;}}
                if(a.y>=a.landing()){a.y=a.landing();a.falling=false;if(a.rainbowAfter)spitRainbow(a,now);else a.play(a.bouncing?"开心蹦蹦":"摔趴趴",1400);a.bouncing=false;}
                position(a);continue;
            }
            if(a.until>now)continue;
            InterfaceCompanion.Snapshot state=InterfaceCompanion.snapshot;
            android.content.SharedPreferences prefs=getSharedPreferences("pets",MODE_PRIVATE);
            String mode=now<typingDemoUntil?"type":AppCompanion.live(prefs.getBoolean("companion",false),
                state.pkg,prefs.getAll(),companionMode,now,prefs.getBoolean("interface",false)?state.input:0);
            String companionClip=AppCompanion.clip(mode);
            if(!companionClip.isEmpty()){a.direction=0;a.play(companionClip,0);continue;}
            String rest=idle(a);
            if(!a.action.equals(rest)&&!a.action.equals("向左走")&&!a.action.equals("向右走")){boolean was=idling(a.action);a.play(rest,0);if(!was)a.decision=now+1500;} // 天气变了只换待机样子
            if(now>=a.nextHop && !surfaces.isEmpty() && (walking || now<demoUntil)){
                Perch next=Perch.below(surfaces,a.perch,unit,a.floor());
                if(next!=null){hopTo(a,next,now);continue;}
                if(a.perch!=null){startFall(a,now);a.nextHop=now+5000;continue;}
            }
            if(a.perch!=null && !a.perch.canWalk(unit,width)){
                a.direction=0;a.x=a.perch.x(unit,width);a.play(idle(a),0);position(a);continue;
            }
            if(now>=a.decision){a.direction=walking?random.nextInt(3)-1:0;a.play(a.direction<0?"向左走":a.direction>0?"向右走":idle(a),0);a.decision=now+2500+random.nextInt(4000);}
            if(a.direction!=0){
                float left=a.perch==null?0:a.perch.walkLeft(unit,width),right=a.perch==null?maxX(a):a.perch.walkRight(unit,width);
                a.x=Math.max(left,Math.min(right,a.x+a.direction*unit*.22f*dt));
                if((a.direction<0&&a.x<=left)||(a.direction>0&&a.x>=right)){a.direction=-a.direction;a.play(a.direction<0?"向左走":"向右走",0);}
                position(a);
            }
        }
        if(hugA==null)for(int i=0;i<actors.size();i++)for(int j=i+1;j<actors.size();j++){
            Actor a=actors.get(i),b=actors.get(j);
            if(!a.dragging&&!b.dragging&&!a.falling&&!b.falling&&a.hang==0&&b.hang==0&&now>a.cooldown&&now>b.cooldown&&now>a.until&&now>b.until&&Math.abs(a.x-b.x)<unit*.65f&&Math.abs(a.y-b.y)<unit*.25f){if(beginHug(a,b))return;}
        }
    }
    private boolean beginHug(Actor a,Actor b){
        String clip=catalog.hug(a.pet,b.pet);if(clip.isEmpty()||hugA!=null||a.hang!=0||b.hang!=0||a.ballEnd!=0||b.ballEnd!=0||a.perch!=null||b.perch!=null||a.hopStart>0||b.hopStart>0)return false;
        hugA=a;hugB=b;a.direction=b.direction=0;a.falling=b.falling=false;a.dragging=b.dragging=false;
        a.pos.width=Math.min(width,unit*2);a.x=(a.x+b.x)/2;a.y=a.floor();a.view.show(clip);b.view.setVisibility(View.GONE);b.view.animate(false);position(a);hugEnd=SystemClock.uptimeMillis()+5500;return true;
    }
    private void endHug(){
        if(hugA==null)return;Actor a=hugA,b=hugB;hugA=hugB=null;a.pos.width=unit;a.play(idle(a),0);b.play(idle(b),0);a.cooldown=b.cooldown=SystemClock.uptimeMillis()+20000;
        a.x=Math.min(a.x,Math.max(0,width-unit*2.1f));b.x=a.x+unit*1.05f;b.y=a.y;a.decision=b.decision=SystemClock.uptimeMillis()+2000;position(a);position(b);refreshVisibility();
    }
    private void jump(Actor a){
        if(a==hugA||a==hugB)endHug();
        if(a.hang!=0){a.hang=0;hangSkipUntil=Long.MAX_VALUE;}
        a.target=null;a.hopStart=0;a.nextHop=SystemClock.uptimeMillis()+4000;a.direction=0;a.dragging=false;a.falling=true;a.bouncing=true;a.velocity=-unit*3.3f;a.play("开心蹦蹦",0);
    }
    private void setTouch(Actor a){
        a.view.setOnClickListener(v->{long now=SystemClock.uptimeMillis();
            if(a.lastTap!=0 && now-a.lastTap<=ViewConfiguration.getDoubleTapTimeout()){a.lastTap=0;jump(a);}
            else{a.lastTap=now;a.direction=0;a.play("摸摸头",2000);}
        });
        a.view.setOnLongClickListener(v->{openSettings();return true;});
        a.view.setOnTouchListener(new View.OnTouchListener(){float downX,downY,startX,startY;boolean moved,longPressed;final int slop=ViewConfiguration.get(PetService.this).getScaledTouchSlop();final Runnable hold=()->{longPressed=true;a.dragging=false;a.view.performLongClick();};
            public boolean onTouch(View v,MotionEvent e){switch(e.getActionMasked()){
                case MotionEvent.ACTION_DOWN:
                    if(a==hugA||a==hugB)endHug();if(a.hang!=0){a.hang=0;hangSkipUntil=Long.MAX_VALUE;}a.rainbowAfter=false;downX=e.getRawX();downY=e.getRawY();startX=a.x;startY=a.y;moved=longPressed=false;a.ballEnd=0;a.perch=a.target=null;a.hopStart=0;a.nextHop=SystemClock.uptimeMillis()+4000;a.dragging=true;a.falling=false;a.bouncing=false;a.direction=0;clock.postDelayed(hold,600);return true;
                case MotionEvent.ACTION_MOVE:
                    float dx=e.getRawX()-downX,dy=e.getRawY()-downY;if(Math.hypot(dx,dy)>slop){moved=true;a.lastTap=0;clock.removeCallbacks(hold);}if(moved&&!longPressed){a.x=startX+dx;a.y=startY+dy;a.view.show(a.pet.clip("掉落"));position(a);}return true;
                case MotionEvent.ACTION_UP:case MotionEvent.ACTION_CANCEL:
                    clock.removeCallbacks(hold);a.dragging=false;
                    if(moved||e.getActionMasked()==MotionEvent.ACTION_CANCEL||longPressed){a.falling=a.y<a.floor();a.velocity=0;if(a.falling)startFall(a,SystemClock.uptimeMillis());else a.play(idle(a),0);}
                    else{v.performClick();}return true;
                default:return true;
            }}
        });
    }
    private void bounceParty(){
        if(!screenOn||paused||getSystemService(KeyguardManager.class).isKeyguardLocked())return;
        endHug();long now=SystemClock.uptimeMillis();
        for(Actor a:actors){
            if(a.dragging)continue;
            a.perch=a.target=null;a.hopStart=0;a.falling=false;a.direction=0;a.nextHop=now+8000;
            a.hang=0;a.rainbowAfter=false;
            a.ballEnd=now+4500;a.ballX=(random.nextBoolean()?1:-1)*unit*3;a.ballY=-unit*5;
            a.play("摇晃",0); // 弹力球飞动期间摇晃
        }
    }
    private void updateIsland(long now,android.content.SharedPreferences prefs,boolean unlocked){
        if(!unlocked){hideIsland();return;}
        if(prefs.getBoolean("delivery",false)&&DeliveryCompanion.hintAt>lastDelivery){
            lastDelivery=DeliveryCompanion.hintAt;islandFromNotice=false;
            if(SystemClock.elapsedRealtime()-lastDelivery<30000){islandMessage=DeliveryCompanion.hint;islandUntil=now+9000;islandDismissed=0;}
        }
        if(DeliveryCompanion.noticeAt>lastNotice && SystemClock.elapsedRealtime()-DeliveryCompanion.noticeAt<15000){
            lastNotice=DeliveryCompanion.noticeAt;islandFromNotice=true;islandMessage=DeliveryCompanion.notice;islandUntil=now+7000;islandDismissed=0;
        }
        if(now>=nextMediaCheck){nextMediaCheck=now+1500;if(prefs.getBoolean("islandMedia",false))media.refresh();else media.clear();
            batteryLabel="";
            if(prefs.getBoolean("islandBattery",false)){
                Intent battery=registerReceiver(null,new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
                if(battery!=null&&battery.getIntExtra(BatteryManager.EXTRA_PLUGGED,0)!=0){int level=battery.getIntExtra(BatteryManager.EXTRA_LEVEL,0),scale=Math.max(1,battery.getIntExtra(BatteryManager.EXTRA_SCALE,100));batteryLabel="⚡ 充电中 · "+(level*100/scale)+"%";}
            }
        }
        boolean notice=now<islandUntil&&(prefs.getBoolean("delivery",false)||islandFromNotice||islandMessage.startsWith("演示"));
        String label=notice?islandMessage:"";
        long remaining=prefs.getLong("timerEnd",0)-System.currentTimeMillis();
        if(SystemClock.elapsedRealtime()<timerFinishedUntil)label="⏱ 时间到啦";
        else if(label.isEmpty()&&remaining>0)label=String.format(java.util.Locale.ROOT,"⏱ %02d:%02d",remaining/60000,(remaining/1000)%60);
        if(label.isEmpty()&&prefs.getBoolean("islandMedia",false)&&!media.title.isEmpty())label=(media.playing?"♫ ":"Ⅱ ")+media.title;
        if(label.isEmpty()&&prefs.getBoolean("islandBattery",false))label=batteryLabel;
        if(label.isEmpty()&&prefs.getBoolean("island",false)){
            if(prefs.getBoolean("companion",false)&&Perch.typing(now,InterfaceCompanion.snapshot.input))label="🐾 陪你打字中";
            else if("video".equals(companionMode))label="🐾 陪你看视频";
            else if("music".equals(companionMode))label="♫ 一起摇摆";
        }
        if(label.isEmpty()||now<islandDismissed){hideIsland();islandNotice=false;}
        else{showIsland(label);islandNotice=notice&&label.equals(islandMessage);}
    }
    private void showIsland(String label){
        if(island==null){
            island=new android.widget.TextView(this);island.setGravity(Gravity.CENTER);island.setTextColor(android.graphics.Color.WHITE);island.setTextSize(14);
            float density=getResources().getDisplayMetrics().density;
            // 像素胶囊：左右两段不拉伸、中间平铺，最近邻缩放；文字只放在中间段
            islandBlock=IslandHang.block(density);
            if(islandArt==null)islandArt=IslandBackground.load(this,catalog,islandBlock);
            int islandHeight=islandArt==null?(int)(48*density):IslandHang.height(islandBlock);
            if(islandArt!=null){island.setBackground(islandArt);int cap=islandArt.capWidth();island.setPadding(cap,0,cap,0);}
            else{android.graphics.drawable.GradientDrawable bg=new android.graphics.drawable.GradientDrawable();bg.setColor(0xEE302932);bg.setCornerRadius(100);island.setBackground(bg);island.setPadding(18,0,18,0);}
            WindowManager.LayoutParams p=new WindowManager.LayoutParams(Math.min(width,(int)(270*density)),islandHeight,WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,PixelFormat.TRANSLUCENT);p.gravity=Gravity.TOP|Gravity.CENTER_HORIZONTAL;p.y=(int)(12*density);
            island.setSingleLine(true);island.setEllipsize(android.text.TextUtils.TruncateAt.END);island.setOnClickListener(v->{if(!openNotice())openIslandPanel();});island.setOnLongClickListener(v->{openIslandPanel();return true;});
            try{windows.addView(island,p);}catch(RuntimeException e){island=null;return;}
        }
        island.setText(label);
    }
    private void checkTimer(){
        android.content.SharedPreferences p=getSharedPreferences("pets",MODE_PRIVATE);long end=p.getLong("timerEnd",0);
        if(end>0&&System.currentTimeMillis()>=end){p.edit().putLong("timerEnd",0).apply();timerFinishedUntil=SystemClock.elapsedRealtime()+15000;islandDismissed=0;
            getSystemService(NotificationManager.class).notify(8,new Notification.Builder(this,"pets").setSmallIcon(R.drawable.ic_pet).setColor(0xFFEFA7C0).setLargeIcon(android.graphics.drawable.Icon.createWithResource(this,R.drawable.ic_qianqian_large)).setContentTitle("桌宠计时器：时间到啦").setContentText("回到桌宠可以再开一轮").setAutoCancel(true).build());}
    }
    /** 吐一遍彩虹（约 2.7 秒，GIF 里画好了彩虹）再回待机。 */
    private void spitRainbow(Actor a,long now){
        if(a==hugA||a==hugB)endHug();
        a.rainbowAfter=false;a.direction=0;a.play("吐彩虹",0);a.until=now+Math.max(2600,a.view.duration());
    }
    /** 天气演示：所有天气和四季待机轮流播，每个 3 秒，提示条上写着是什么天气。 */
    private void weatherDemoStart(){weatherDemoStep=-1;clock.removeCallbacks(weatherDemoNext);clock.post(weatherDemoNext);}
    private final Runnable weatherDemoNext=new Runnable(){public void run(){
        weatherDemoStep++;
        if(weatherDemoStep>=Weather.ALL.length){weatherDemo=null;weatherDemoStep=-1;for(Actor a:actors)if(a.until<=SystemClock.uptimeMillis()&&idling(a.action))a.play(idle(a),0);return;}
        weatherDemo=Weather.ALL[weatherDemoStep];long now=SystemClock.uptimeMillis();
        for(Actor a:actors)if(a!=hugB&&!a.dragging&&!a.falling&&a.hang==0&&a.ballEnd==0){a.direction=0;a.play(idle(a),0);a.until=now+3000;}
        islandMessage="演示：天气 · "+Weather.label(weatherDemo)+"（"+(weatherDemoStep+1)+"/"+Weather.ALL.length+"）";islandFromNotice=false;islandUntil=now+3200;islandDismissed=0;showIsland(islandMessage);
        clock.postDelayed(this,3000);
    }};
    private void hangDemo(){
        islandMessage="演示：挂在灵动岛上";islandFromNotice=false;islandUntil=SystemClock.uptimeMillis()+8000;islandDismissed=0;hangSkipUntil=0;showIsland(islandMessage);
    }
    /** 选好的伙伴（默认第一只出来的）在通知提示条出现时挂上去；提示条消失或换成别的内容就落回地面。 */
    private void updateHanger(long now,android.content.SharedPreferences prefs){
        // 提示条一出现（通知、充电、计时、音乐、陪伴状态都算）就挂上去，提示条消失再掉下来
        boolean want=island!=null&&island.isLaidOut()&&now>=hangSkipUntil
            &&(prefs.getBoolean("islandHang",false)||islandMessage.startsWith("演示"));
        Actor chosen=null;
        if(want){
            String id=prefs.getString("islandPet","");
            for(Actor a:actors)if(a.pet.id.equals(id)&&a!=hugB){chosen=a;break;}
            if(chosen==null&&!actors.isEmpty())chosen=actors.get(0);
        }
        for(Actor a:actors){
            if(a==chosen){
                if(a.hang==0&&!a.dragging){
                    if(a==hugA||a==hugB)endHug();
                    a.ballEnd=0;a.rainbowAfter=false;a.perch=a.target=null;a.hopStart=0;a.falling=false;a.bouncing=false;a.direction=0;
                    boolean grounded=a.y>=a.floor()-1;
                    a.hang=grounded?1:2;a.hangStart=now;a.hangFromX=a.x;a.hangFromY=a.y;
                    if(!grounded)a.play("开心蹦蹦",0);
                }
            }else if(a.hang!=0){
                a.hang=0;a.nextHop=now+3000;
                if(a.y<a.floor())startFall(a,now);else a.play(idle(a),0); // 用现有的掉落逻辑落回地面
            }
        }
    }
    private void hang(Actor a,long now,float dt){
        if(island==null){a.hang=0;startFall(a,now);return;}
        int[] at=new int[2];island.getLocationOnScreen(at);
        float tx=IslandHang.x(at[0]-originX,island.getWidth(),unit,width);
        float ty=IslandHang.y(at[1]-originY+island.getHeight(),a.view.contentTop(),Math.max(1,islandBlock));
        a.lastTap=0;
        if(a.hang==1){ // 先在地上跑到提示条正下方
            float step=unit*1.6f*dt,dx=tx-a.x;
            if(Math.abs(dx)<=step){a.x=tx;a.hang=2;a.hangStart=now;a.hangFromX=a.x;a.hangFromY=a.y;a.play("开心蹦蹦",0);}
            else{a.x+=Math.signum(dx)*step;a.play(dx<0?"向左走":"向右走",0);}
        }else if(a.hang==2){ // 跳上去
            float p=Math.min(1,(now-a.hangStart)/650f);
            a.x=a.hangFromX+(tx-a.hangFromX)*p;
            a.y=a.hangFromY+(ty-a.hangFromY)*p-unit*.6f*4*p*(1-p);
            if(p>=1){a.hang=3;a.play("灵动岛",0);bringToFront(a);}
        }else{a.x=tx;a.y=ty;if(!"灵动岛".equals(a.action))a.play("灵动岛",0);}
        position(a);
    }
    /** 挂着时爪子要盖在提示条边上，所以把这只的窗口放到最上层。 */
    private void bringToFront(Actor a){
        if(!a.view.isAttachedToWindow())return;
        try{windows.removeViewImmediate(a.view);windows.addView(a.view,a.pos);}catch(RuntimeException ignored){}
    }
    /** 提示条上正显示外卖 / 选中应用的通知时，点一下打开那条通知（和在通知栏里点一样）；打不开就打开那个应用。 */
    private boolean openNotice(){
        if(!islandNotice||islandMessage.startsWith("演示"))return false;
        PendingIntent target=islandFromNotice?DeliveryCompanion.noticeIntent:DeliveryCompanion.hintIntent;
        String pkg=islandFromNotice?DeliveryCompanion.noticePkg:DeliveryCompanion.hintPkg;
        boolean opened=false;
        if(target!=null)try{
            android.os.Bundle options=null;
            if(Build.VERSION.SDK_INT>=34)options=ActivityOptions.makeBasic().setPendingIntentBackgroundActivityStartMode(ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED).toBundle();
            target.send(this,0,null,null,null,null,options);opened=true;
        }catch(PendingIntent.CanceledException ignored){}
        if(!opened&&pkg!=null&&!pkg.isEmpty()){
            Intent launch=getPackageManager().getLaunchIntentForPackage(pkg);
            if(launch!=null)try{startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));opened=true;}catch(RuntimeException ignored){}
        }
        if(opened){islandUntil=0;hideIsland();islandNotice=false;}
        return opened;
    }
    private void openIslandPanel(){
        if(islandPanel!=null)return;
        islandPanel=new AlertDialog.Builder(this).setTitle("灵动面板").setItems(new String[]{"上一首","播放 / 暂停","下一首","取消计时器","隐藏提示 30 秒"},(d,i)->{
            if(i<3 && getSharedPreferences("pets",MODE_PRIVATE).getBoolean("islandMedia",false))media.control(i);
            if(i==3)getSharedPreferences("pets",MODE_PRIVATE).edit().putLong("timerEnd",0).apply();
            if(i==4){islandDismissed=SystemClock.uptimeMillis()+30000;hideIsland();}
        }).setNegativeButton("关闭",null).create();
        islandPanel.getWindow().setType(WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY);
        islandPanel.setOnDismissListener(d->islandPanel=null);islandPanel.show();
    }
    private void hideIsland(){hangSkipUntil=0; // 下次提示条出来又可以挂
        if(island!=null){if(island.isAttachedToWindow())windows.removeView(island);island=null;}}
    private void openSettings(){try{startActivity(new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_SINGLE_TOP));}catch(RuntimeException ignored){}}
    private void refreshVisibility(){observeApps=screenOn&&!paused;InterfaceCompanion.visible=observeApps;if(!observeApps){motion.enabled(false);hideIsland();if(islandPanel!=null)islandPanel.dismiss();media.clear();companionMode="none";InterfaceCompanion.clear();}for(Actor a:actors){boolean visible=screenOn&&!paused&&a!=hugB;a.view.setVisibility(visible?View.VISIBLE:View.GONE);a.view.animate(visible);}}
    private void clearActors(){hideIsland();hugA=hugB=null;clock.removeCallbacksAndMessages(null);for(Actor a:actors){a.view.animate(false);if(a.view.isAttachedToWindow())windows.removeView(a.view);}actors.clear();}
    @Override public void onConfigurationChanged(Configuration config){super.onConfigurationChanged(config);hideIsland();endHug();InterfaceCompanion.clear();keyboardFloor=-1;surfaces=Collections.emptyList();demoUntil=typingDemoUntil=0;measure();for(Actor a:actors){a.perch=a.target=null;a.hopStart=0;a.hang=0;a.rainbowAfter=false;a.y=a.floor();a.ballEnd=0;a.dragging=a.falling=false;position(a);}}
    @Override public void onDestroy(){destroyed=true;if(islandPanel!=null)islandPanel.dismiss();motion.enabled(false);hideIsland();observeApps=false;InterfaceCompanion.visible=false;InterfaceCompanion.clear();usageClock.removeCallbacksAndMessages(null);usageThread.quitSafely();clock.removeCallbacksAndMessages(null);clearActors();unregisterReceiver(screen);stopForeground(STOP_FOREGROUND_REMOVE);super.onDestroy();}
    @Override public IBinder onBind(Intent i){return null;}
}

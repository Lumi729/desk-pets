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
    private long lastFrame,hugEnd,demoUntil,typingDemoUntil,hangDemoUntil,nextUpdateCheck;
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
    // 特别剧情（Claude）：哥哥狗狗扶起摔趴趴的宠物、晚上给睡着的千千猫猫盖被子
    private static final String DOG="哥哥狗狗",CAT="千千猫猫";
    private String storyKind; // null / "helpup" / "blanket"
    private Actor storyPet,storyDog;
    private org.json.JSONObject storyInfo;
    private int storyPhase; // 0 等一下，1 哥哥狗狗走过去，2 两只一起播
    private long storyWaitUntil,storyGiveUp,storyEnd,nextBlanketCheck;
    // 挑衅剧情（Claude）：照电脑版 renderer/teases.js 和 pets.js 的「挑衅」一节，一步一步演
    private Actor sceneA,sceneB; // 挑衅的那只、被挑衅的哥哥
    private final ArrayDeque<Step> sceneSteps=new ArrayDeque<>();
    private Step sceneStep;
    private long nextTease;
    private final Map<String,List<Long>> teased=new HashMap<>();
    private abstract static class Step{void start(long now){} abstract boolean update(long now,float dt);}
    // 两个哥哥：贴贴完打架，冷静 3 分钟后再见面先和好
    private int hugPhase; // 0 和好，1 贴贴，2 打架
    private String hugClip="";
    private final Set<String> needsMakeup=new HashSet<>();
    private boolean fightDemo;
    private static final long CALM_DOWN=180_000;
    // 第三批（Claude）：送零食、追着玩、打哈欠传染、g老师、沙漠狐
    private static final String G="灰鸮g老师",COAL="煤球猫猫",BUNNY="梨梨兔兔",FOX="99狐狐",FENNEC="沙漠狐";
    private String hugKind="hug"; // hug / read / grading / bookmark / watch / catch / swap / tails / tailquilt
    private long nextSnack,nextChase,nextYawn,yawnNextAt,nextPairCheck,nextNightCheck;
    private final List<Actor> yawnQueue=new ArrayList<>();
    private final Handler show=new Handler(Looper.getMainLooper()); // 功能展示的时间表（换宠物时不会被清掉）
    private int snackDemoTurn;
    // 叠叠乐（Claude）：从下到上最多 3 只，最下面那只的窗口变高播合在一起的动画，播完散开各自摔趴趴
    private final List<Actor> stack=new ArrayList<>();
    private long stackEnd;
    private static final String MULTI="百变猫猫";
    // 第五批（Claude）：过节 / 生日 / 在一起多少天、时间提醒、小窝、番茄钟、分享表情
    private static final String NICK="千千";
    private String festivalToday,festivalDemo;
    private final Set<String> birthdayNames=new HashSet<>();
    private long nextDayCheck,lastBirthdayTell,lastNightNag,nextNestCheck,nestDemoUntil;
    private final Set<String> mealsDone=new HashSet<>();
    private String tellText="";
    private long tellUntil;
    private android.widget.ImageView nestBack,nestFront;
    private int nestW,nestH;
    private boolean focusing;
    // 灵动岛滚动歌词（Claude）：先用状态栏歌词，读不到再按歌名歌手查 LRC；只放内存
    private LyricFetcher lyrics;
    private boolean islandLyricMode;
    private String islandShownLabel;
    private android.animation.ValueAnimator islandSlide;
    private String lyricTitle="";
    private long lyricTitleAt,lyricDemoStart,lyricDemoUntil;
    private long tiltSince; // 往同一边歪了多久
    private int tiltSide;
    private boolean tiltArmed=true; // 爬过一次要先摆正手机才能再触发
    private long focusDemoUntil;
    private int weatherDemoStep=-1;
    private ShakeCompanion motion;
    private android.widget.TextView island;
    private long islandUntil,islandDismissed,lastDelivery;
    private String islandMessage="";
    private IslandMedia media;
    private String batteryLabel="";
    private boolean islandFromNotice;
    private AlertDialog islandPanel,islandSettings;
    private boolean islandDragging,islandLongPressed,islandTouching,islandMoved;
    private float islandDownX,islandDownY;
    private int islandStartX,islandStartY;
    private final Runnable islandLongPress=()->{if(island!=null&&islandTouching&&!islandMoved){islandLongPressed=true;island.performLongClick();}};
    private long nextMediaCheck,lastNotice,timerFinishedUntil;
    // 灵动岛：像素胶囊背景；通知出现时一只伙伴挂在下面（「通知时挂在提示条下」开关默认关闭，演示除外）
    private IslandBackground islandArt;
    private int islandBlock;
    private boolean islandNotice;
    private boolean islandLive; // 提示条正显示外卖进度（Claude）
    private long nextLiveCheck;
    private long hangSkipUntil;
    private boolean islandMediaShown; // 提示条正显示音乐 / 视频 / 一起摇摆这些：伙伴照常播看视频、跳舞，不挂

    private final BroadcastReceiver screen=new BroadcastReceiver(){@Override public void onReceive(Context c,Intent i){screenOn=!Intent.ACTION_SCREEN_OFF.equals(i.getAction());refreshVisibility();}};
    private final Runnable loop=new Runnable(){public void run(){if(destroyed)return;if(!Settings.canDrawOverlays(PetService.this)){stopSelf();return;}long now=SystemClock.uptimeMillis();float dt=Math.min(.05f,(now-lastFrame)/1000f);lastFrame=now;checkTimer();checkFocus();if(screenOn&&!paused)tick(now,dt);clock.postDelayed(this,screenOn&&!paused?50:1000);}};
    private final class Actor {
        Catalog.Pet pet; // 百变猫猫换小猫时会换成另一只
        final PetView view;
        final WindowManager.LayoutParams pos;
        float x,y,velocity,ballX,ballY;
        long ballEnd;
        int direction;
        long until,decision,cooldown,lastTap;
        String action="待机";
        boolean dragging,falling,bouncing,rainbowAfter;
        int hang; // 0 平时，1 跑到提示条下面，2 跳上去，3 挂着
        boolean sleeping; // 盖好被子睡着：摸一下才醒
        boolean reading; // g老师在看书
        long dozeAt,nextHobby;
        String thenClip; // 这个动作播完接着播（g老师摔趴趴后假装没摔过）
        int catPhase; // 百变猫猫：0 平时，1 变身_出，2 变身_进
        long nextCelebrate; // 过节 / 生日：下次什么时候播（0 = 今天不过）
        int nest; // 小窝：0 平时，1 犯困走回窝，2 在窝里睡
        long nestAfter; // 被摸醒以后过一会儿才会再回窝
        boolean nightSleep; // 晚上睡的，早上才自己出来
        int climb; // 歪手机爬墙：0 平时，1 走到边上，2 沿边往上爬，3 在边上探头（不管就一直趴着，拖出来才掉下去）
        int climbSide; // -1 左边，1 右边
        int home; // 住在屏幕边：0 住在地面，-1 住左边，1 住右边（climb 4 = 沿边往下爬）
        float climbTo; // 爬到的高度（窗口顶边）
        long edgeNext; // 住在边上的下次换位置
        int edgeQuick; // 演示时前几次换得快
        Catalog.Pet catNext;
        long nextCatSwitch;
        final List<Catalog.Pet> catBag=new ArrayList<>();
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
        weather=new WeatherCompanion(this);media=new IslandMedia(this);motion=new ShakeCompanion(this,()->{if(getSharedPreferences("pets",MODE_PRIVATE).getBoolean("motion",false))bounceParty();});usage=new UsageCompanion(this);usageThread=new HandlerThread("pet-app-companion");usageThread.start();usageClock=new Handler(usageThread.getLooper());usageClock.post(usageLoop);
        lyrics=new LyricFetcher();
        try{catalog=new Catalog(this);}catch(Exception e){stopSelf();}
    }
    @Override public int onStartCommand(Intent intent,int flags,int startId){
        String action=intent==null?"stop":intent.getAction();
        if("stop".equals(action)){stopSelf();return START_NOT_STICKY;}
        if(!Settings.canDrawOverlays(this)||catalog==null){stopSelf();return START_NOT_STICKY;}
        startForeground(7,notification());
        if(actors.isEmpty()||"start".equals(action)||"hug".equals(action)||(action!=null&&action.startsWith("test-")))
            rebuild(castFor(action)); // 演示要的宠物自动放出来
        if("island-preview".equals(action))previewIsland();
        if("test-shake".equals(action))bounceParty();
        if("test-rainbow".equals(action)){long now=SystemClock.uptimeMillis();for(Actor a:actors)spitRainbow(a,now);}
        if("test-hang".equals(action))hangDemo();
        if("test-show".equals(action))showcase();
        if("focus-start".equals(action))startFocus();
        if("focus-stop".equals(action))stopFocus();
        if("test-festival".equals(action))festivalDemoStart();
        if("test-birthday".equals(action))birthdayDemo();
        if("test-anniversary".equals(action))anniversaryDemo();
        if("test-remind".equals(action))remindDemo();
        if("test-nest".equals(action))nestDemo();
        if("test-focus".equals(action))focusDemo();
        if("test-climb-left".equals(action))climbDemo(-1);
        if("test-climb-right".equals(action))climbDemo(1);
        if("test-edge-left".equals(action))edgeDemo(-1);
        if("test-edge-right".equals(action))edgeDemo(1);
        if("test-lyrics".equals(action))lyricDemo();
        if("test-tease".equals(action))teaseDemo();
        if("test-snack".equals(action))snackDemo();
        if("test-chase".equals(action))chaseDemo();
        if("test-yawn".equals(action))yawnDemo();
        if("test-read".equals(action))readDemo();
        if("test-watch".equals(action))watchDemo();
        if("test-catch".equals(action))catchDemo();
        if("test-swap".equals(action))swapDemo();
        if("test-hobby".equals(action))hobbyDemo();
        if("test-tails".equals(action))tailsDemo();
        if("test-tailquilt".equals(action))tailquiltDemo();
        if("test-stack".equals(action))stackDemo();
        if("test-cat".equals(action))catDemo();
        if("test-fight".equals(action))fightDemoStart();
        if("test-helpup".equals(action))helpUpDemo();
        if("test-inspect".equals(action))openInspector();
        if("test-blanket".equals(action))blanketDemo();
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
        return new Notification.Builder(this,"pets").setSmallIcon(R.drawable.ic_pet).setColor(0xFFEFA7C0).setLargeIcon(android.graphics.drawable.Icon.createWithResource(this,R.drawable.ic_qianqian_large)).setContentTitle(paused?"伙伴们休息中":"梨间雪的小伙伴陪着你").setContentText("点这里选宠 · 长按宠物也能打开设置").setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true).addAction(new Notification.Action.Builder(null,paused?"继续":"收起",toggle).build()).addAction(new Notification.Action.Builder(null,focusing?"结束专注":"🍅 专注",PendingIntent.getService(this,4,new Intent(this,PetService.class).setAction(focusing?"focus-stop":"focus-start"),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT)).build()).addAction(new Notification.Action.Builder(null,"全部回家",stop).build()).build();
    }
    @SuppressWarnings("deprecation") private void measure(){
        if(Build.VERSION.SDK_INT>=30){WindowMetrics m=windows.getCurrentWindowMetrics();android.graphics.Insets i=m.getWindowInsets().getInsetsIgnoringVisibility(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());width=m.getBounds().width()-i.left-i.right;height=m.getBounds().height()-i.top-i.bottom;}
        else{android.util.DisplayMetrics m=new android.util.DisplayMetrics();windows.getDefaultDisplay().getMetrics(m);width=m.widthPixels;height=m.heightPixels;}
    }
    private void rebuild(){rebuild(Collections.<String>emptyList());}
    /** must：这次一定要放出来的宠物名字（演示用，不改你的选择），排在前面，最多还是 3 只。 */
    private void rebuild(List<String> must){
        clearActors();paused=false;keyboardFloor=-1;surfaceApp="";surfaces=Collections.emptyList();demoUntil=typingDemoUntil=0;measure();android.content.SharedPreferences p=getSharedPreferences("pets",MODE_PRIVATE);
        unit=Math.round(Math.max(56,Math.min(136,p.getInt("size",88)))*getResources().getDisplayMetrics().density);unit=Math.min(unit,Math.max(1,width/2));walking=p.getBoolean("walking",true);
        Set<String> ids=p.getStringSet("selected",new HashSet<>(Arrays.asList("pet0","pet2")));
        List<Catalog.Pet> order=new ArrayList<>();
        for(String name:must)for(Catalog.Pet pet:catalog.pets)if(pet.name.equals(name)&&!order.contains(pet)){order.add(pet);break;}
        for(Catalog.Pet pet:catalog.pets)if(ids.contains(pet.id)&&!order.contains(pet))order.add(pet);
        String lock=p.getString("catLock","");
        if(!lock.isEmpty())for(int i=0;i<order.size();i++)if(!order.get(i).skin.isEmpty())for(Catalog.Pet c:catalog.cats())if(c.skin.equals(lock))order.set(i,c); // 锁定了就出来那一只
        try{for(Catalog.Pet pet:order)if(actors.size()<3){Actor actor=new Actor(pet,actors.size());actor.pos.x=(int)actor.x;actor.pos.y=(int)actor.y;windows.addView(actor.view,actor.pos);actors.add(actor);}}
        catch(RuntimeException e){Toast.makeText(this,"悬浮窗未能开启，请检查系统权限",Toast.LENGTH_LONG).show();stopSelf();}
        Set<String> homes=p.getStringSet("edgePets",new HashSet<>());
        for(Actor a:actors)if(homes.contains(a.pet.name))settleHome(a,0); // 住在屏幕边的
        if(actors.isEmpty())stopSelf();refreshVisibility();
    }
    /** 平时的待机：特殊天气 > 季节 > 其它天气 > 普通待机（和电脑版一样）。 */
    private String idle(Actor a){
        if(weatherDemo!=null)return a.pet.clips.has(weatherDemo)?weatherDemo:"待机";
        if(focusing){String f=a.pet.name.equals(G)&&a.pet.clips.has("互动_看书")?"互动_看书":"专注";if(a.pet.clips.has(f))return f;} // 专注时安静陪着（g老师看书）
        String fest=festivalDemo!=null?festivalDemo:festivalToday;
        if(fest!=null&&a.pet.clips.has(fest))return fest; // 过节当天的待机
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
        if(changed){endHug();cancelStory();cancelScene();keyboardFloor=nextFloor;surfaceApp=state.pkg;}
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
            if(a.ballEnd>now||a.hang!=0||a.climb!=0)continue; // 爬墙的不算悬空
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
        if(unlocked&&now>=nextUpdateCheck){nextUpdateCheck=now+60000;checkAutomaticUpdate(options);}
        motion.enabled(unlocked&&(options.getBoolean("motion",false)||options.getBoolean("climb",false))); // 摇晃和歪手机爬墙共用加速度传感器
        updateIsland(now,options,unlocked);
        updateInspector();
        updateInterface(now);
        updateHanger(now,options);
        checkDay(now,options);checkClock(now,options);updateNest(now,options);checkTilt(now,options);
        if(hugA!=null&&now>=hugEnd)advanceHug(now);
        if(sceneA!=null)runScene(now,dt);
        else if(storyKind==null&&!focusing&&now>=nextTease){nextTease=now+120_000+random.nextInt(180_000);autoTease(now);}
        if(!stack.isEmpty()&&now>=stackEnd)scatter(now);
        if(sceneA==null&&storyKind==null&&hugA==null&&!focusing)everyday(now);
        for(Actor a:actors)if(a.pet.name.equals(MULTI))checkCat(a,now);
        processYawn(now);
        checkReading(now);
        if(storyKind!=null)runStory(now,dt);else if(now>=nextBlanketCheck){nextBlanketCheck=now+30000;startBlanket(now,false);}
        for(Actor a:actors){
            if(a==hugA||a==hugB||a.dragging)continue;
            if(a.climb!=0){climbStep(a,now,dt);continue;} // 歪手机爬墙
            if(a==storyPet||a==storyDog||a==sceneA||a==sceneB||stack.contains(a))continue; // 剧情里不随机走动、不贴贴
            if(a.sleeping&&a.hang==0&&a.ballEnd==0)continue; // 盖着被子睡，摸一下才醒
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
            if(a.nest==1){walkToNest(a,now,dt);continue;} // 困了慢慢走回小窝
            if(a.falling){
                float before=a.y;a.velocity+=unit*5*dt;a.y+=a.velocity*dt;
                if(a.velocity>=0){Perch caught=Perch.catchFall(surfaces,a.x,before,a.y,unit,a.floor());if(caught!=null){a.perch=caught;a.y=caught.top-unit;a.nextHop=now+3000;}}
                if(a.y>=a.landing()){a.y=a.landing();a.falling=false;if(a.home!=0){a.bouncing=false;a.rainbowAfter=false;a.climb=1;a.climbSide=a.home;position(a);continue;} // 住在边上的落地后走回去爬上去
                    if(a.rainbowAfter)spitRainbow(a,now);else if(a.bouncing)a.play("开心蹦蹦",1400);else{a.play("摔趴趴",1400);if(!tryHelpUp(a,now))afterGFall(a,now);}a.bouncing=false;}
                position(a);continue;
            }
            if(a.until>now)continue;
            if(a.catPhase==1){a.pet=a.catNext;a.catPhase=2;a.play("变身_进",0);a.until=now+Math.max(800,a.view.duration());continue;} // 换上下一只小猫
            if(a.catPhase==2)a.catPhase=0;
            a.reading=false;
            if(a.thenClip!=null){String next=a.thenClip;a.thenClip=null;a.direction=0;a.play(next,0);a.until=now+Math.max(1500,a.view.duration());continue;}
            String mode=liveCompanionMode(now,options);
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
            if(maybeCelebrate(a,now))continue;
            if(now>=a.decision&&a.perch==null&&!focusing&&maybeOwnThing(a,now))continue;
            if(now>=a.decision){a.direction=walking&&!focusing?random.nextInt(3)-1:0;a.play(a.direction<0?"向左走":a.direction>0?"向右走":idle(a),0);a.decision=now+2500+random.nextInt(4000);}
            if(a.direction!=0){
                float left=a.perch==null?0:a.perch.walkLeft(unit,width),right=a.perch==null?maxX(a):a.perch.walkRight(unit,width);
                a.x=Math.max(left,Math.min(right,a.x+a.direction*unit*.22f*dt));
                if((a.direction<0&&a.x<=left)||(a.direction>0&&a.x>=right)){a.direction=-a.direction;a.play(a.direction<0?"向左走":"向右走",0);}
                position(a);
            }
        }
        if(hugA==null&&!focusing)for(int i=0;i<actors.size();i++)for(int j=i+1;j<actors.size();j++){
            Actor a=actors.get(i),b=actors.get(j);
            if(!a.dragging&&!b.dragging&&!a.falling&&!b.falling&&a.hang==0&&b.hang==0&&!a.sleeping&&!b.sleeping&&!isStory(a)&&!isStory(b)&&!inScene(a)&&!inScene(b)&&!stack.contains(a)&&!stack.contains(b)&&a.catPhase==0&&b.catPhase==0&&a.nest==0&&b.nest==0&&a.climb==0&&b.climb==0&&a.home==0&&b.home==0&&!a.pet.name.equals(G)&&!b.pet.name.equals(G)&&now>a.cooldown&&now>b.cooldown&&now>a.until&&now>b.until&&Math.abs(a.x-b.x)<unit*.65f&&Math.abs(a.y-b.y)<unit*.25f){if(beginHug(a,b))return;}
        }
    }
    private boolean beginHug(Actor a,Actor b){
        String clip=catalog.hug(a.pet,b.pet);if(clip.isEmpty()||hugA!=null||a.hang!=0||b.hang!=0||a.sleeping||b.sleeping||isStory(a)||isStory(b)||inScene(a)||inScene(b)||a.ballEnd!=0||b.ballEnd!=0||a.perch!=null||b.perch!=null||a.hopStart>0||b.hopStart>0)return false;
        hugA=a;hugB=b;hugKind="hug";a.direction=b.direction=0;a.falling=b.falling=false;a.dragging=b.dragging=false;
        a.pos.width=Math.min(width,unit*2);a.x=(a.x+b.x)/2;a.y=a.floor();hugClip=clip;
        String makeup=catalog.pairStory("makeup",a.pet,b.pet),key=pairKey(a,b);long now=SystemClock.uptimeMillis();
        if(!makeup.isEmpty()&&needsMakeup.remove(key)){a.view.show(makeup);hugPhase=0;hugEnd=now+Math.max(1500,a.view.duration());} // 打完架冷静过了：先和好
        else{a.view.show(clip);hugPhase=1;hugEnd=now+5500;}
        b.view.setVisibility(View.GONE);b.view.animate(false);position(a);return true;
    }
    private String pairKey(Actor a,Actor b){return a.pet.id.compareTo(b.pet.id)<0?a.pet.id+":"+b.pet.id:b.pet.id+":"+a.pet.id;}
    /** 贴贴播完：两个哥哥有「_打架」就接着打一架；和好播完接着贴贴。 */
    private void advanceHug(long now){
        Actor a=hugA,b=hugB;
        if(!"hug".equals(hugKind)){endHug();return;} // 特别剧情只播一遍
        if(hugPhase==0){a.view.show(hugClip);hugPhase=1;hugEnd=now+5500;return;}
        String fight=hugPhase==1?catalog.pairStory("fight",a.pet,b.pet):"";
        if(!fight.isEmpty()){
            a.view.show(fight);hugPhase=2;hugEnd=now+Math.max(1500,a.view.duration());
            if(!catalog.pairStory("makeup",a.pet,b.pet).isEmpty())needsMakeup.add(pairKey(a,b)); // 冷静过后再见面先和好
            return;
        }
        endHug();
    }
    private void endHug(){
        if(hugA==null)return;Actor a=hugA,b=hugB;boolean fought=hugPhase==2&&"hug".equals(hugKind);String kind=hugKind;hugKind="hug";hugA=hugB=null;hugPhase=1;
        a.reading=b.reading=false;a.until=b.until=0;a.pos.width=unit;a.play(idle(a),0);b.play(idle(b),0);
        long now=SystemClock.uptimeMillis();a.cooldown=b.cooldown=now+(fought?(fightDemo?4000:CALM_DOWN):20000);
        a.x=Math.min(a.x,Math.max(0,width-unit*2.1f));b.x=a.x+unit*1.05f;b.y=a.y;a.decision=b.decision=now+2000;
        if(fought){ // 打完朝两边走开
            a.direction=-1;b.direction=1;a.play("向左走",0);b.play("向右走",0);a.decision=b.decision=now+3000+random.nextInt(1500);
            if(fightDemo){fightDemo=false;clock.postDelayed(()->fightDemoAgain(a,b),6000);}
        }
        afterPair(kind,a,b,now);
        position(a);position(b);refreshVisibility();
    }
    private void jump(Actor a){
        if(a==hugA||a==hugB)endHug();
        if(a.hang!=0){a.hang=0;hangSkipUntil=Long.MAX_VALUE;}
        if(isStory(a))cancelStory();if(inScene(a))cancelScene();a.sleeping=false;
        a.target=null;a.hopStart=0;a.nextHop=SystemClock.uptimeMillis()+4000;a.direction=0;a.dragging=false;a.falling=true;a.bouncing=true;a.velocity=-unit*3.3f;a.play("开心蹦蹦",0);
    }
    private void setTouch(Actor a){
        a.view.setOnClickListener(v->{long now=SystemClock.uptimeMillis();
            if(a.climb!=0){a.lastTap=0;if(a.home!=0&&a.climb==3)retract(a);return;} // 趴在墙上：点它不下来，拖出来才下来；住在边上的缩回去再探出来
            if(a.lastTap!=0 && now-a.lastTap<=ViewConfiguration.getDoubleTapTimeout()){a.lastTap=0;if(a.pet.name.equals(MULTI))switchCat(a,null,now);else jump(a);} // 百变猫猫双击换下一只
            else{a.lastTap=now;a.direction=0;
                if("西米".equals(a.pet.skin)&&random.nextFloat()<.35f)a.play(random.nextBoolean()?"向左看":"向右看",1500); // 西米傲娇：有时扭头不让摸
                else a.play("摸摸头",2000);}
        });
        a.view.setOnLongClickListener(v->{longPressMenu(a);return true;});
        a.view.setOnTouchListener(new View.OnTouchListener(){float downX,downY,startX,startY;boolean moved,longPressed;final IslandHang.Touch hangTouch=new IslandHang.Touch();final int slop=ViewConfiguration.get(PetService.this).getScaledTouchSlop();final Runnable hold=()->{longPressed=true;a.dragging=false;a.view.performLongClick();};
            public boolean onTouch(View v,MotionEvent e){switch(e.getActionMasked()){
                case MotionEvent.ACTION_DOWN:
                    hangTouch.begin(a.hang!=0);a.view.animate().cancel();a.view.setTranslationX(0);
                    if(stack.contains(a))scatter(SystemClock.uptimeMillis());a.catPhase=0;
                    if(a.nest!=0){a.nest=0;a.nestAfter=SystemClock.uptimeMillis()+600_000;arrangeNest();} // 被摸醒，从窝里出来
                    if(a==hugA||a==hugB)endHug();if(isStory(a))cancelStory();if(inScene(a))cancelScene();a.sleeping=false;a.reading=false;a.thenClip=null;yawnQueue.remove(a);a.rainbowAfter=false;downX=e.getRawX();downY=e.getRawY();startX=a.x;startY=a.y;moved=longPressed=false;a.ballEnd=0;a.perch=a.target=null;a.hopStart=0;a.nextHop=SystemClock.uptimeMillis()+4000;a.dragging=true;a.falling=false;a.bouncing=false;a.direction=0;clock.postDelayed(hold,600);return true;
                case MotionEvent.ACTION_MOVE:
                    if(longPressed)return true;
                    float dx=e.getRawX()-downX,dy=e.getRawY()-downY;moved=hangTouch.move(dx,dy,slop);
                    if(moved){a.hang=0;a.climb=0;a.lastTap=0;clock.removeCallbacks(hold);a.x=startX+dx;a.y=startY+dy;a.view.show(a.pet.clip("掉落"));position(a);}return true;
                case MotionEvent.ACTION_UP:case MotionEvent.ACTION_CANCEL:
                    clock.removeCallbacks(hold);a.dragging=false;
                    // Only a completed real drag suppresses re-hanging. Taps and system cancellations do not.
                    if(hangTouch.suppressAfterRelease(e.getActionMasked()==MotionEvent.ACTION_CANCEL))hangSkipUntil=Long.MAX_VALUE;
                    if(a.hang!=0&&!moved){if(!longPressed&&e.getActionMasked()==MotionEvent.ACTION_UP)v.performClick();return true;}
                    if(a.climb!=0&&!moved){a.view.show(a.pet.clip(a.action));if(!longPressed&&e.getActionMasked()==MotionEvent.ACTION_UP)v.performClick();return true;} // 还趴在墙上（轻点交给点击：住在边上的会缩回去再探出来）
                    if(moved&&a.home!=0&&e.getActionMasked()==MotionEvent.ACTION_UP&&edgeDrop(a,SystemClock.uptimeMillis()))return true; // 住在边上的：拖到别的高度
                    if(moved&&e.getActionMasked()==MotionEvent.ACTION_UP&&tryStackDrop(a,SystemClock.uptimeMillis()))return true; // 松手落在别人头上 → 叠叠乐
                    if(moved||e.getActionMasked()==MotionEvent.ACTION_CANCEL||longPressed){a.falling=a.y<a.floor();a.velocity=0;if(a.falling)startFall(a,SystemClock.uptimeMillis());else a.play(idle(a),0);}
                    else{v.performClick();}return true;
                default:return true;
            }}
        });
    }
    // ---- 特别剧情（Claude）：照电脑版 renderer/pets.js 的「哥哥狗狗」一节 ----
    private boolean isStory(Actor a){return a!=null&&(a==storyPet||a==storyDog);}
    private Actor byName(String name){for(Actor a:actors)if(a.pet.name.equals(name))return a;return null;}
    /** 能参加剧情：看得见、在地上、没在拖 / 掉 / 飞 / 挂 / 贴贴 / 别的剧情里。 */
    private boolean storyFree(Actor a){
        return a!=null&&!paused&&a!=hugA&&a!=hugB&&!isStory(a)&&!inScene(a)&&!stack.contains(a)&&a.catPhase==0&&a.nest==0&&a.climb==0&&a.home==0&&!a.dragging&&!a.falling&&a.hang==0&&a.ballEnd==0&&a.hopStart==0&&a.perch==null&&a.y>=a.floor()-1;
    }
    /** 有宠物落地摔趴趴：哥哥狗狗在、而且有这只的「_扶起来」就走过去扶。 */
    private boolean tryHelpUp(Actor fallen,long now){
        if(storyKind!=null||fallen.pet.name.equals(DOG)||fallen==hugA||fallen==hugB||fallen.perch!=null)return false;
        Actor dog=byName(DOG);
        org.json.JSONObject info=catalog.story("helpup",fallen.pet);
        if(info==null||!storyFree(dog)||dog==fallen)return false;
        dog.sleeping=false;
        beginStory("helpup",fallen,dog,info,now,1400); // 先让它趴着播完摔趴趴
        return true;
    }
    /** 晚上 11 点到早上 6 点，一晚一次：千千猫猫先睡着，哥哥狗狗走过去盖被子。 */
    private void startBlanket(long now,boolean force){
        if(storyKind!=null)return;
        java.util.Calendar c=java.util.Calendar.getInstance();int hour=c.get(java.util.Calendar.HOUR_OF_DAY);
        if(!force&&hour>=6&&hour<23)return;
        c.add(java.util.Calendar.HOUR_OF_DAY,-6); // 过了半夜还算前一晚
        String night=String.format(java.util.Locale.ROOT,"%d-%d",c.get(java.util.Calendar.YEAR),c.get(java.util.Calendar.DAY_OF_YEAR));
        android.content.SharedPreferences p=getSharedPreferences("pets",MODE_PRIVATE);
        if(!force&&night.equals(p.getString("blanketNight","")))return;
        Actor cat=byName(CAT),dog=byName(DOG);
        org.json.JSONObject info=cat==null?null:catalog.story("blanket",cat.pet);
        if(info==null||!storyFree(cat)||!storyFree(dog))return;
        p.edit().putString("blanketNight",night).apply();
        cat.sleeping=false;dog.sleeping=false;cat.direction=0;cat.play("睡觉",0);
        beginStory("blanket",cat,dog,info,now,2500); // 千千猫猫先睡着一会儿
    }
    private void beginStory(String kind,Actor pet,Actor dog,org.json.JSONObject info,long now,long wait){
        storyKind=kind;storyPet=pet;storyDog=dog;storyInfo=info;storyPhase=0;storyWaitUntil=now+wait;storyGiveUp=now+wait+12000;
        dog.direction=0;dog.until=0;dog.play(idle(dog),0);
    }
    private void runStory(long now,float dt){
        Actor pet=storyPet,dog=storyDog;
        if(pet==null||dog==null||!actors.contains(pet)||!actors.contains(dog)||paused){cancelStory();return;}
        if(storyPhase==0){if(now>=storyWaitUntil)storyPhase=1;return;}
        if(storyPhase==1){ // 哥哥狗狗走到旁边
            if(now>storyGiveUp){cancelStory();return;}
            float side=dog.x<pet.x?-1:1,target=Math.max(0,Math.min(maxX(dog),pet.x+side*unit*.9f)),dx=target-dog.x,step=unit*.6f*dt;
            if(Math.abs(dx)<=Math.max(step,2)){
                // 两只并排播一段（贴贴同样的做法：一只的窗口变宽播合在一起的动画，另一只先藏起来）
                String file=storyInfo.optString("file");
                pet.pos.width=Math.min(width,unit*2);pet.x=Math.min(pet.x,dog.x);pet.y=pet.floor();
                pet.view.show(file);dog.view.setVisibility(View.GONE);dog.view.animate(false);position(pet);
                storyEnd=now+Math.max("blanket".equals(storyKind)?3000:1500,pet.view.duration());storyPhase=2;
            }else{dog.x+=Math.signum(dx)*step;dog.play(dx<0?"向左走":"向右走",0);position(dog);}
            return;
        }
        if(now>=storyEnd)finishStory(now);
    }
    /** 播完：两只回到左右两边。扶起来各自往两边慢慢走开；盖被子两只一起接着睡。 */
    private void finishStory(long now){
        Actor pet=storyPet,dog=storyDog;String kind=storyKind;boolean dogLeft=storyInfo!=null&&storyInfo.optBoolean("dogLeft");
        storyKind=null;storyPet=storyDog=null;storyInfo=null;
        float left=Math.max(0,Math.min(pet.x,width-unit*2.1f));
        pet.pos.width=unit;Actor l=dogLeft?dog:pet,r=dogLeft?pet:dog;l.x=left;r.x=left+unit*1.05f;l.y=r.y=Math.max(l.floor(),0);
        if("blanket".equals(kind)){for(Actor a:new Actor[]{l,r}){a.sleeping=true;a.direction=0;a.play("睡觉",0);}}
        else{l.direction=-1;r.direction=1;l.play("向左走",0);r.play("向右走",0);l.decision=r.decision=now+2500+random.nextInt(1500);l.cooldown=r.cooldown=now+20000;}
        position(l);position(r);refreshVisibility();
    }
    private void cancelStory(){
        if(storyKind==null)return;
        Actor pet=storyPet,dog=storyDog;boolean shown=storyPhase==2;
        storyKind=null;storyPet=storyDog=null;storyInfo=null;
        if(pet!=null){pet.pos.width=unit;pet.play(idle(pet),0);position(pet);}
        if(dog!=null){if(shown)dog.x=Math.min(maxX(dog),(pet==null?dog.x:pet.x)+unit*1.05f);dog.play(idle(dog),0);position(dog);}
        refreshVisibility();
    }
    /** 演示：千千猫猫从半空掉下来摔趴趴，哥哥狗狗过去扶。 */
    private void helpUpDemo(){
        Actor cat=byName(CAT),dog=byName(DOG);
        if(cat==null||dog==null){Toast.makeText(this,"要千千猫猫和哥哥狗狗一起出来哦",Toast.LENGTH_SHORT).show();return;}
        endHug();cancelStory();long now=SystemClock.uptimeMillis();
        for(Actor a:new Actor[]{cat,dog}){a.hang=0;a.ballEnd=0;a.sleeping=false;a.perch=a.target=null;a.hopStart=0;a.direction=0;a.until=0;}
        cat.x=Math.max(0,Math.min(maxX(cat),width/2f-unit*1.2f));dog.x=Math.min(maxX(dog),cat.x+unit*2.4f);dog.y=dog.floor();dog.falling=false;dog.play(idle(dog),0);position(dog);
        cat.y=Math.max(0,cat.floor()-unit*2.5f);startFall(cat,now);position(cat);
    }
    /** 演示：不管几点，千千猫猫先睡着，哥哥狗狗过去盖被子。 */
    private void blanketDemo(){
        Actor cat=byName(CAT),dog=byName(DOG);
        if(cat==null||dog==null){Toast.makeText(this,"要千千猫猫和哥哥狗狗一起出来哦",Toast.LENGTH_SHORT).show();return;}
        endHug();cancelStory();long now=SystemClock.uptimeMillis();
        for(Actor a:new Actor[]{cat,dog}){a.hang=0;a.ballEnd=0;a.sleeping=false;a.perch=a.target=null;a.hopStart=0;a.direction=0;a.until=0;a.falling=false;a.y=a.floor();}
        cat.x=Math.max(0,Math.min(maxX(cat),width/2f-unit*1.2f));dog.x=Math.min(maxX(dog),cat.x+unit*2.4f);position(cat);position(dog);
        startBlanket(now,true);
    }
    // ---- 挑衅（Claude）：千千猫猫挑衅哥哥狗狗，梨梨兔兔挑衅梨梨哥哥 ----
    private boolean inScene(Actor a){return a!=null&&(a==sceneA||a==sceneB);}
    private Step faceStep(Actor pet,Actor other){return new Step(){long end;
        void start(long now){pet.direction=0;pet.play(other.x<pet.x?"向左看":"向右看",0);end=now+700;}
        boolean update(long now,float dt){return now>=end;}};}
    private Step playStep(Actor pet,String clip,long min){return new Step(){
        void start(long now){
            if(!pet.pet.clips.has(clip)){pet.until=0;return;}
            pet.direction=0;pet.play(clip,0);long d=Math.max(100,pet.view.duration());pet.until=now+d*Math.max(1,(min+d-1)/d); // 很短的动作重复几遍
        }
        boolean update(long now,float dt){return now>=pet.until;}};}
    private Step approachStep(Actor pet,Actor other){return new Step(){long giveUp;
        void start(long now){giveUp=now+6000;}
        boolean update(long now,float dt){
            float target=Math.max(0,Math.min(maxX(pet),other.x+(pet.x<other.x?-1:1)*unit*.9f)),dx=target-pet.x,step=unit*.6f*dt;
            if(Math.abs(dx)<=Math.max(step,2)||now>giveUp){pet.play(idle(pet),0);return true;}
            pet.x+=Math.signum(dx)*step;pet.play(dx<0?"向左走":"向右走",0);position(pet);return false;
        }};}
    private Step chaseStep(Actor chaser,Actor runner){return new Step(){long end;float dir;
        void start(long now){end=now+3500;dir=Math.signum(runner.x-chaser.x);if(dir==0)dir=1;}
        boolean update(long now,float dt){
            runner.x+=dir*unit*.9f*dt;if(runner.x<=0||runner.x>=maxX(runner)){dir=-dir;runner.x=Math.max(0,Math.min(maxX(runner),runner.x));}
            float dx=runner.x-chaser.x;chaser.x+=Math.signum(dx)*unit*1.1f*dt;
            runner.play(dir<0?"向左走":"向右走",0);chaser.play(dx<0?"向左走":"向右走",0);position(runner);position(chaser);
            if(now>=end||Math.abs(dx)<unit*.5f){runner.play(idle(runner),0);chaser.play(idle(chaser),0);return true;}
            return false;
        }};}
    private Step hugStep(Actor a,Actor b){return new Step(){
        boolean update(long now,float dt){Actor x=sceneA,y=sceneB;endScene();a.cooldown=b.cooldown=0;if(!beginHug(a,b)){x.play(idle(x),0);y.play(idle(y),0);}return true;}};}
    private List<String> teaseDemoCast(){return teaseDemoTurn%2==0?Arrays.asList(CAT,DOG):Arrays.asList("梨梨兔兔","梨梨哥哥");}
    private int teaseDemoTurn;
    /** 挑衅：照 teases.js 的规则选回应，10 分钟里被挑衅超过 3 次就投降。forced 是指定的挑衅（可为 null）。 */
    private boolean startTease(Actor teaser,String forced,long now){
        Catalog.Tease pair=catalog.teases.get(teaser.pet.name);
        Actor target=pair==null?null:byName(pair.target);
        if(target==null||teaser==target)return false;
        List<String> options=new ArrayList<>();for(String t:pair.replies.keySet())if(teaser.pet.clips.has("挑衅_"+t))options.add(t);
        if(options.isEmpty())return false;
        String tease=options.contains(forced)?forced:options.get(random.nextInt(options.size()));
        List<Long> history=teased.computeIfAbsent(target.pet.name,k->new ArrayList<>());
        history.removeIf(t->now-t>=catalog.teaseWindow);
        List<String> reply=TeaseRules.reply(pair.replies,tease,history,now,catalog.teaseWindow,catalog.teaseLimit);
        history.add(now);
        if(reply==null)return false;
        sceneA=teaser;sceneB=target;sceneSteps.clear();sceneStep=null;
        for(Actor x:new Actor[]{teaser,target}){x.sleeping=false;x.direction=0;x.until=0;}
        sceneSteps.add(faceStep(teaser,target));sceneSteps.add(playStep(teaser,"挑衅_"+tease,2000));sceneSteps.add(faceStep(target,teaser));
        for(String step:reply){
            if("@chase".equals(step))sceneSteps.add(chaseStep(target,teaser));
            else if("@hug".equals(step)){sceneSteps.add(approachStep(target,teaser));sceneSteps.add(hugStep(teaser,target));}
            else if("@comfort".equals(step)){sceneSteps.add(approachStep(target,teaser));sceneSteps.add(playStep(target,"回应_摸摸头",2000));sceneSteps.add(playStep(teaser,"开心蹦蹦",2000));sceneSteps.add(playStep(target,"回应_无语",2000));} // 装哭露馅了
            else sceneSteps.add(playStep(target,"回应_"+step,2000));
        }
        return true;
    }
    private void runScene(long now,float dt){
        if(!actors.contains(sceneA)||!actors.contains(sceneB)||paused||sceneA.dragging||sceneB.dragging||sceneA.falling||sceneB.falling){cancelScene();return;}
        if(sceneStep==null){sceneStep=sceneSteps.poll();if(sceneStep==null){endScene();return;}sceneStep.start(now);}
        if(sceneStep.update(now,dt))sceneStep=null;
    }
    private void endScene(){
        Actor a=sceneA,b=sceneB;sceneA=sceneB=null;sceneSteps.clear();sceneStep=null;
        for(Actor x:new Actor[]{a,b})if(x!=null&&x!=hugA&&x!=hugB){x.until=0;x.decision=SystemClock.uptimeMillis()+1500;}
    }
    private void cancelScene(){
        if(sceneA==null)return;Actor a=sceneA,b=sceneB;endScene();
        for(Actor x:new Actor[]{a,b})if(x!=null&&!x.dragging){x.play(idle(x),0);position(x);}
    }
    /** 平时偶尔：挑衅的那只和哥哥都在、都闲着、离得不远。 */
    private void autoTease(long now){
        List<String> names=new ArrayList<>(catalog.teases.keySet());Collections.shuffle(names,random);
        for(String name:names){
            Actor teaser=byName(name),target=byName(catalog.teases.get(name).target);
            if(!storyFree(teaser)||!storyFree(target)||teaser.sleeping||target.sleeping||teaser.until>now||target.until>now)continue;
            if(Math.abs(teaser.x-target.x)>unit*4)continue;
            if(startTease(teaser,null,now))return;
        }
    }
    /** 长按：千千猫猫 / 梨梨兔兔多一个「挑衅哥哥」。 */
    private void longPressMenu(Actor a){
        Catalog.Tease pair=catalog.teases.get(a.pet.name);
        List<String> items=new ArrayList<>();List<Runnable> picks=new ArrayList<>();
        if(pair!=null){items.add("😈 挑衅哥哥（"+pair.target+"）");picks.add(()->{
            Actor target=byName(pair.target);
            if(target==null){Toast.makeText(this,"要先让"+pair.target+"出来哦",Toast.LENGTH_SHORT).show();return;}
            freeForScene(a);freeForScene(target);
            if(!startTease(a,null,SystemClock.uptimeMillis()))Toast.makeText(this,"现在闹不起来，等一下再试哦",Toast.LENGTH_SHORT).show();
        });}
        items.add("📤 分享这个表情");picks.add(()->shareExpression(a));
        items.add("打开设置");picks.add(this::openSettings);
        AlertDialog menu=new AlertDialog.Builder(this).setTitle(a.pet.label).setItems(items.toArray(new String[0]),(d,i)->picks.get(i).run()).setNegativeButton("取消",null).create();
        menu.getWindow().setType(WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY);menu.show();
    }
    /** 分享表情（Claude）：把它现在播的 GIF 用系统分享发出去（电脑版的「复制这个表情」）。 */
    private void shareExpression(Actor a){
        String asset=a.view.asset();
        if(asset==null||asset.isEmpty()){Toast.makeText(this,"这个表情还没加载好",Toast.LENGTH_SHORT).show();return;}
        try{
            android.net.Uri uri=ShareProvider.copy(this,asset,a.pet.name+"_"+a.action);
            Intent send=new Intent(Intent.ACTION_SEND).setType("image/gif").putExtra(Intent.EXTRA_STREAM,uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            send.setClipData(android.content.ClipData.newRawUri(a.pet.name,uri));
            startActivity(Intent.createChooser(send,"分享这个表情").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_GRANT_READ_URI_PERMISSION));
        }catch(java.io.IOException|RuntimeException e){Toast.makeText(this,"分享没成功，再试一次吧",Toast.LENGTH_SHORT).show();}
    }
    /** 演示前把这只从别的事里拉出来，站回地上。 */
    private void freeForScene(Actor a){
        if(a==hugA||a==hugB)endHug();if(isStory(a))cancelStory();if(inScene(a))cancelScene();
        a.hang=0;a.ballEnd=0;a.sleeping=false;a.perch=a.target=null;a.hopStart=0;a.falling=false;a.dragging=false;a.direction=0;a.until=0;a.y=a.floor();a.play(idle(a),0);position(a);
    }
    private void teaseDemo(){
        List<String> cast=teaseDemoCast();teaseDemoTurn++;
        Actor teaser=byName(cast.get(0)),target=byName(cast.get(1));
        if(teaser==null||target==null){Toast.makeText(this,"要"+cast.get(0)+"和"+cast.get(1)+"一起出来哦",Toast.LENGTH_SHORT).show();return;}
        freeForScene(teaser);freeForScene(target);
        teaser.x=Math.max(0,Math.min(maxX(teaser),width/2f-unit*1.3f));target.x=Math.min(maxX(target),teaser.x+unit*2.2f);position(teaser);position(target);
        startTease(teaser,null,SystemClock.uptimeMillis());
    }
    /** 演示：两个哥哥贴贴 → 打架 → 走开，过几秒再碰到先和好再贴贴。 */
    private void fightDemoStart(){
        Actor dog=byName(DOG),lili=byName("梨梨哥哥");
        if(dog==null||lili==null){Toast.makeText(this,"要哥哥狗狗和梨梨哥哥一起出来哦",Toast.LENGTH_SHORT).show();return;}
        freeForScene(dog);freeForScene(lili);needsMakeup.remove(pairKey(dog,lili));fightDemo=true;
        dog.x=Math.max(0,Math.min(maxX(dog),width/2f-unit*.6f));lili.x=dog.x+unit*.5f;dog.cooldown=lili.cooldown=0;position(dog);position(lili);
        if(!beginHug(dog,lili)){fightDemo=false;Toast.makeText(this,"这一对没有贴贴动画",Toast.LENGTH_SHORT).show();}
    }
    private void fightDemoAgain(Actor dog,Actor lili){
        if(!actors.contains(dog)||!actors.contains(lili))return;
        freeForScene(dog);freeForScene(lili);
        dog.x=Math.max(0,Math.min(maxX(dog),width/2f-unit*.6f));lili.x=dog.x+unit*.5f;dog.cooldown=lili.cooldown=0;position(dog);position(lili);
        beginHug(dog,lili); // 冷静过了：先和好再贴贴
    }
    // ---- 第三批互动（Claude）：照电脑版 renderer/pets.js 的送零食、追着玩、打哈欠、灰鸮g老师、沙漠狐几节 ----
    private boolean free(Actor a){return storyFree(a)&&!a.sleeping&&a.until<=SystemClock.uptimeMillis()&&!a.reading;}
    private boolean near(Actor a,Actor b,float units){return Math.abs(a.x-b.x)<=unit*units;}
    /** 两只按电脑版贴贴文件名的顺序（左边那只在前）。 */
    private Actor[] ordered(Actor a,Actor b){return catalog.pets.indexOf(a.pet)<=catalog.pets.indexOf(b.pet)?new Actor[]{a,b}:new Actor[]{b,a};}
    /** 两只一起播一段特别的动画（批改作业、围观睡着、接眼镜、换眼镜、比尾巴、尾巴被子……），和贴贴一样一只窗口变宽。 */
    private boolean beginPair(Actor x,Actor y,String kind,String clip,long min){
        if(clip==null||clip.isEmpty()||hugA!=null||x==y)return false;
        Actor[] o=ordered(x,y);Actor a=o[0],b=o[1];
        for(Actor p:o){if(isStory(p))cancelStory();if(inScene(p))cancelScene();p.thenClip=null;p.hang=0;p.ballEnd=0;p.sleeping=false;p.perch=p.target=null;p.hopStart=0;p.falling=false;p.direction=0;}
        hugA=a;hugB=b;hugKind=kind;hugPhase=3;long now=SystemClock.uptimeMillis();
        a.pos.width=Math.min(width,unit*2);a.x=Math.min(a.x,b.x);a.y=a.floor();a.view.show(clip);
        hugEnd=now+Math.max(min,a.view.duration());
        b.view.setVisibility(View.GONE);b.view.animate(false);position(a);return true;
    }
    /** 特别剧情播完以后。 */
    private void afterPair(String kind,Actor a,Actor b,long now){
        android.content.SharedPreferences p=getSharedPreferences("pets",MODE_PRIVATE);
        Actor g=a.pet.name.equals(G)?a:b.pet.name.equals(G)?b:null;
        if("watch".equals(kind)||"tailquilt".equals(kind)){for(Actor x:new Actor[]{a,b}){x.sleeping=true;x.direction=0;x.play("睡觉",0);}} // 两只都睡着，摸一下才醒
        else if("grading".equals(kind)&&g!=null){p.edit().putBoolean("gBookmark",true).apply();g.direction=0;g.play("互动_夹书签",0);g.until=now+Math.max(1500,g.view.duration());} // 改完夹上书签
        else if("bookmark".equals(kind))p.edit().putBoolean("gBookmark",false).apply(); // 书签用掉了
        else if("swap".equals(kind))p.edit().putLong("glassesSwapAt",System.currentTimeMillis()).apply();
    }
    /** 平时偶尔：送零食、煤球追着玩、两只狐狸比尾巴、哥哥和g老师换眼镜、晚上两只狐狸尾巴被子。 */
    private void everyday(long now){
        if(nextSnack==0){nextSnack=now+140_000;nextChase=now+100_000;nextYawn=now+180_000;nextPairCheck=now+60_000;}
        if(now>=nextSnack){nextSnack=now+90_000+random.nextInt(110_000);trySnack(now,-1);}
        if(now>=nextChase){nextChase=now+60_000+random.nextInt(90_000);tryChase(now);}
        if(now>=nextYawn){java.util.Calendar c=java.util.Calendar.getInstance();int h=c.get(java.util.Calendar.HOUR_OF_DAY);boolean night=h>=23||h<7;
            nextYawn=now+(night?60_000+random.nextInt(120_000):240_000+random.nextInt(300_000));startYawn(now,null);}
        if(now>=nextPairCheck){nextPairCheck=now+60_000;
            if(random.nextFloat()<.3f)trySwap(now,false);
            if(random.nextFloat()<.3f)tryTails(now,false);
        }
        if(now>=nextNightCheck){nextNightCheck=now+30_000;tryTailquilt(now,false);}
    }
    // 送零食：千千猫猫叼胡萝卜给梨梨兔兔，梨梨兔兔叼小鱼给千千猫猫
    private boolean trySnack(long now,int which){
        String[][] snacks={{CAT,BUNNY,"叼胡萝卜","吃胡萝卜"},{BUNNY,CAT,"叼小鱼","吃小鱼"}};
        int start=which>=0?which:random.nextInt(2);
        for(int k=0;k<2;k++){
            String[] s=snacks[(start+k)%2];Actor giver=byName(s[0]),receiver=byName(s[1]);
            if(!free(giver)||!free(receiver)||!giver.pet.clips.has(s[2]+"向左走")||!receiver.pet.clips.has(s[3]))continue;
            sceneA=giver;sceneB=receiver;sceneSteps.clear();sceneStep=null;
            receiver.direction=0;receiver.play(idle(receiver),0); // 站着等零食
            sceneSteps.add(carryStep(giver,receiver,s[2]));sceneSteps.add(playStep(receiver,s[3],3000));
            return true;
        }
        return false;
    }
    private Step carryStep(Actor giver,Actor to,String carry){return new Step(){long giveUp;
        void start(long now){giveUp=now+30000;}
        boolean update(long now,float dt){
            float target=Math.max(0,Math.min(maxX(giver),to.x+(giver.x<to.x?-1:1)*unit*.7f)),dx=target-giver.x,step=unit*.3f*dt;
            if(Math.abs(dx)<=Math.max(step,2)||now>giveUp){giver.play(idle(giver),0);return true;}
            giver.x+=Math.signum(dx)*step;giver.play(carry+(dx<0?"向左走":"向右走"),0);position(giver);return false;
        }};}
    private Step togetherStep(Actor a,Actor b,String clip,long min){return new Step(){
        void start(long now){for(Actor x:new Actor[]{a,b}){x.direction=0;x.play(clip,0);long d=Math.max(100,x.view.duration());x.until=now+d*Math.max(1,(min+d-1)/d);}}
        boolean update(long now,float dt){return now>=a.until&&now>=b.until;}};}
    private Step pairStep(Actor a,Actor b,String kind,long min){return new Step(){
        boolean update(long now,float dt){String clip=catalog.pairStory(kind,a.pet,b.pet);endScene();if(!beginPair(a,b,kind,clip,min)){a.play(idle(a),0);b.play(idle(b),0);}return true;}};}
    // 追着玩：煤球猫猫突然冲向另一只，那只加速跑开，追一会儿一起开心蹦蹦
    private boolean tryChase(long now){
        Actor coal=byName(COAL);
        Actor cat=byName(MULTI);if(cat!=null&&"核桃".equals(cat.pet.skin)&&free(cat)&&(!free(coal)||random.nextBoolean()))coal=cat; // 核桃爱捣蛋，也会去追
        if(!free(coal))return false;
        List<Actor> others=new ArrayList<>();for(Actor a:actors)if(a!=coal&&free(a))others.add(a);
        if(others.isEmpty())return false;
        Actor target=others.get(random.nextInt(others.size()));
        sceneA=coal;sceneB=target;sceneSteps.clear();sceneStep=null;
        sceneSteps.add(chaseStep(coal,target));sceneSteps.add(togetherStep(coal,target,"开心蹦蹦",2000));
        return true;
    }
    // 打哈欠会传染：一只打哈欠，旁边的（最多 3 只）隔 2～4 秒跟着打
    private boolean startYawn(long now,Actor first){
        if(!yawnQueue.isEmpty())return false;
        List<Actor> can=new ArrayList<>();for(Actor a:actors)if(free(a)&&a.pet.clips.has("打哈欠"))can.add(a);
        if(first==null){if(can.isEmpty())return false;first=can.get(random.nextInt(can.size()));}
        yawn(first,now);
        Actor src=first;can.remove(src);
        can.removeIf(a->!near(a,src,4));can.sort((x,y)->Float.compare(Math.abs(x.x-src.x),Math.abs(y.x-src.x)));
        yawnQueue.addAll(can.subList(0,Math.min(3,can.size())));yawnNextAt=now+2000+random.nextInt(2000);
        return true;
    }
    private void yawn(Actor a,long now){String clip=a.pet.name.equals(G)&&a.pet.clips.has("互动_强撑")?"互动_强撑":"打哈欠";a.direction=0;a.play(clip,0);a.until=now+Math.max(1500,a.view.duration());}
    private void processYawn(long now){
        if(yawnQueue.isEmpty()||now<yawnNextAt)return;
        Actor a=yawnQueue.remove(0);if(actors.contains(a)&&free(a))yawn(a,now);
        yawnNextAt=now+2000+random.nextInt(2000);
    }
    /** 平时空闲时自己的事：g老师偶尔看书，沙漠狐偶尔玩小爱好。返回 true 表示已经开始做了。 */
    private boolean maybeOwnThing(Actor a,long now){
        if(a.pet.name.equals(G)&&random.nextFloat()<.06f&&a.pet.clips.has("互动_看书")){startReading(a,now,false);return true;}
        if(a.pet.name.equals(MULTI))switch(a.pet.skin){ // 百变猫猫的性格（照电脑版）
            case "芝麻":if(random.nextFloat()<.1f){a.direction=0;a.play("睡觉",0);a.until=now+6000;return true;}break; // 爱睡觉
            case "面包":if(random.nextFloat()<.4f){Actor o=nearestOther(a);if(o!=null){a.direction=o.x<a.x?-1:1;a.play(a.direction<0?"向左走":"向右走",0);a.decision=now+4000;return true;}}break; // 爱贴贴：凑过去
            case "蛋黄酥":if(mealTime()&&random.nextFloat()<.3f&&a.pet.clips.has("吃饭")){a.direction=0;a.play("吃饭",0);a.until=now+4000;return true;}break; // 贪吃
            default:break;
        }
        if(a.pet.name.equals(FENNEC)&&now>=a.nextHobby){a.nextHobby=now+60_000+random.nextInt(90_000);if(random.nextBoolean()&&playHobby(a,now,null))return true;}
        return false;
    }
    /** g老师看书 20～40 秒；有时会有一只伙伴走过来（哥哥狗狗来就是批改作业），有时看着看着打瞌睡。 */
    private void startReading(Actor g,long now,boolean dozeSoon){
        g.direction=0;g.reading=true;g.play("互动_看书",0);g.until=now+20_000+random.nextInt(20_000);
        g.dozeAt=dozeSoon?now+3000:random.nextFloat()<.35f?now+8000+random.nextInt(10_000):0;
        List<Actor> others=new ArrayList<>();for(Actor a:actors)if(a!=g&&free(a))others.add(a);
        if(!dozeSoon&&!others.isEmpty()&&random.nextFloat()<.5f){Actor f=others.get(random.nextInt(others.size()));f.direction=f.x<g.x?1:-1;f.play(f.direction<0?"向左走":"向右走",0);f.decision=now+8000;}
    }
    /** 看书时有伙伴挨过来：一起看书 / 哥哥狗狗批改作业（有书签就是带书签的那段）；到点打瞌睡，旁边有伙伴就围观睡着。 */
    private void checkReading(long now){
        Actor g=byName(G);if(g==null||!g.reading||hugA!=null||sceneA!=null||storyKind!=null)return;
        if(g.dozeAt>0&&now>=g.dozeAt){
            g.dozeAt=0;Actor friend=nearestWith(g,3,"watch");
            if(friend!=null&&beginPair(friend,g,"watch",catalog.pairStory("watch",friend.pet,g.pet),0))return;
            g.reading=false;g.play("互动_看书打瞌睡",0);g.until=now+3000;return;
        }
        for(Actor f:actors){
            if(f==g||!free(f)||!near(f,g,.65f))continue;
            String kind="read",clip=catalog.hug(f.pet,g.pet);
            if(f.pet.name.equals(DOG)){
                boolean mark=getSharedPreferences("pets",MODE_PRIVATE).getBoolean("gBookmark",false);
                String grading=catalog.pairStory("grading",f.pet,g.pet),bookmark=catalog.pairStory("bookmark",f.pet,g.pet);
                if(mark&&!bookmark.isEmpty()){kind="bookmark";clip=bookmark;}else if(!grading.isEmpty()){kind="grading";clip=grading;}
            }
            if(beginPair(f,g,kind,clip,"read".equals(kind)?6000:0))return;
        }
    }
    /** 离 g老师最近、有这段动画的空闲伙伴。 */
    private Actor nearestWith(Actor g,float units,String kind){
        Actor best=null;for(Actor a:actors){if(a==g||!free(a)||!near(a,g,units)||catalog.pairStory(kind,a.pet,g.pet).isEmpty())continue;if(best==null||Math.abs(a.x-g.x)<Math.abs(best.x-g.x))best=a;}
        return best;
    }
    /** g老师摔趴趴：旁边有伙伴就接住眼镜（六成机会），不然假装没摔过。 */
    private void afterGFall(Actor a,long now){
        if(!a.pet.name.equals(G))return;
        Actor friend=nearestWith(a,3,"catch");
        if(friend!=null&&random.nextFloat()<.6f&&beginPair(friend,a,"catch",catalog.pairStory("catch",friend.pet,a.pet),0))return;
        if(a.pet.clips.has("互动_假装没摔过"))a.thenClip="互动_假装没摔过";
    }
    /** 哥哥狗狗和g老师离得不远时偶尔换眼镜戴（最多两小时一次）。 */
    private boolean trySwap(long now,boolean force){
        Actor dog=byName(DOG),g=byName(G);if(!free(dog)||!free(g))return false;
        if(!force&&(!near(dog,g,3)||System.currentTimeMillis()-getSharedPreferences("pets",MODE_PRIVATE).getLong("glassesSwapAt",0)<2*3600_000L))return false;
        return beginPair(dog,g,"swap",catalog.pairStory("swap",dog.pet,g.pet),0);
    }
    // 沙漠狐：小爱好（白天晴天更爱晒太阳），和 99狐狐 比尾巴、两只都睡着时尾巴当被子
    private static final String[] HOBBIES={"互动_刨坑","互动_堆沙堡","互动_偷听","互动_追尾巴","互动_晒太阳"};
    private boolean playHobby(Actor a,long now,String forced){
        List<String> list=new ArrayList<>();for(String h:HOBBIES)if(a.pet.clips.has(h))list.add(h);
        if(list.isEmpty())return false;
        String pick=forced!=null&&list.contains(forced)?forced:null;
        if(pick==null){
            int hour=java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY);String w=weather==null?null:weather.idle();
            boolean sunny=hour>=8&&hour<18&&(w==null||w.equals("待机_晴天")||w.equals("待机_炎热")||w.equals("待机_多云"));
            float total=0;float[] weights=new float[list.size()];
            for(int i=0;i<list.size();i++){weights[i]=list.get(i).equals("互动_晒太阳")?(sunny?4:hour>=7&&hour<19?.5f:0):1;total+=weights[i];}
            float r=random.nextFloat()*total;for(int i=0;i<list.size()&&pick==null;i++){r-=weights[i];if(r<=0&&weights[i]>0)pick=list.get(i);}
            if(pick==null)return false;
        }
        a.direction=0;a.play(pick,0);long d=Math.max(100,a.view.duration()),min=pick.equals("互动_晒太阳")?8000:4000;a.until=now+d*Math.max(1,(min+d-1)/d);
        return true;
    }
    private boolean tryTails(long now,boolean force){
        Actor fox=byName(FOX),fennec=byName(FENNEC);if(!free(fox)||!free(fennec)||(!force&&!near(fox,fennec,3)))return false;
        return beginPair(fox,fennec,"tails",catalog.pairStory("tails",fox.pet,fennec.pet),0);
    }
    /** 晚上 11 点到早上 6 点，一晚一次：两只狐狸离得不远就一起睡着，沙漠狐用大尾巴给 99狐狐 当被子。 */
    private boolean tryTailquilt(long now,boolean force){
        if(sceneA!=null||hugA!=null||storyKind!=null)return false;
        java.util.Calendar c=java.util.Calendar.getInstance();int hour=c.get(java.util.Calendar.HOUR_OF_DAY);
        if(!force&&hour>=6&&hour<23)return false;
        c.add(java.util.Calendar.HOUR_OF_DAY,-6);String night=c.get(java.util.Calendar.YEAR)+"-"+c.get(java.util.Calendar.DAY_OF_YEAR);
        android.content.SharedPreferences p=getSharedPreferences("pets",MODE_PRIVATE);
        Actor fox=byName(FOX),fennec=byName(FENNEC);
        if(!free(fox)||!free(fennec)||catalog.pairStory("tailquilt",fox.pet,fennec.pet).isEmpty())return false;
        if(!force&&(night.equals(p.getString("tailquiltNight",""))||!near(fox,fennec,4)))return false;
        p.edit().putString("tailquiltNight",night).apply();
        sceneA=fox;sceneB=fennec;sceneSteps.clear();sceneStep=null;
        sceneSteps.add(togetherStep(fox,fennec,"睡觉",3000));sceneSteps.add(pairStep(fox,fennec,"tailquilt",4000));
        return true;
    }
    // ---- 演示（Claude）：需要的伙伴自动放出来（不改你的选择），站好位置再演 ----
    private List<String> castFor(String action){
        if(action==null)return Collections.<String>emptyList();
        switch(action){
            case "test-show":return Arrays.asList(CAT,DOG,"梨梨哥哥");
            case "test-fight":return Arrays.asList(DOG,"梨梨哥哥");
            case "test-tease":return teaseDemoCast();
            case "test-helpup":case "test-blanket":return Arrays.asList(CAT,DOG);
            case "test-snack":return Arrays.asList(CAT,BUNNY);
            case "test-chase":return Arrays.asList(COAL,CAT);
            case "test-yawn":return Arrays.asList(CAT,BUNNY,DOG);
            case "test-read":case "test-swap":return Arrays.asList(G,DOG);
            case "test-watch":case "test-catch":return Arrays.asList(G,CAT);
            case "test-hobby":return Arrays.asList(FENNEC);
            case "test-tails":case "test-tailquilt":return Arrays.asList(FOX,FENNEC);
            case "test-stack":return Arrays.asList(CAT,BUNNY,"梨梨哥哥");
            case "test-cat":return Arrays.asList(MULTI);
            default:return Collections.<String>emptyList();
        }
    }
    /** 演示要的伙伴都在就直接用，不在就重新放出来；然后把它们拉回地面、并排站好。 */
    private boolean ensureCast(List<String> names,float gap){
        boolean all=true;for(String n:names)if(byName(n)==null)all=false;
        if(!all){rebuild(names);clock.removeCallbacks(loop);lastFrame=SystemClock.uptimeMillis();clock.post(loop);} // 换了宠物，重新开始每帧的循环
        List<Actor> cast=new ArrayList<>();for(String n:names){Actor a=byName(n);if(a==null){Toast.makeText(this,"要先让"+n+"出来哦",Toast.LENGTH_SHORT).show();return false;}cast.add(a);}
        endHug();cancelStory();cancelScene();yawnQueue.clear();
        float startX=Math.max(0,width/2f-unit*(gap*(cast.size()-1)+1)/2f);
        for(int i=0;i<cast.size();i++){Actor a=cast.get(i);freeForScene(a);a.reading=false;a.thenClip=null;a.x=Math.min(maxX(a),startX+i*unit*gap);a.cooldown=0;position(a);}
        return true;
    }
    private void snackDemo(){if(!ensureCast(Arrays.asList(CAT,BUNNY),2.4f))return;trySnack(SystemClock.uptimeMillis(),snackDemoTurn++%2);}
    private void chaseDemo(){if(!ensureCast(Arrays.asList(COAL,CAT),2f))return;tryChase(SystemClock.uptimeMillis());}
    private void yawnDemo(){if(!ensureCast(Arrays.asList(CAT,BUNNY,DOG),1.3f))return;startYawn(SystemClock.uptimeMillis(),byName(CAT));}
    private void readDemo(){
        if(!ensureCast(Arrays.asList(G,DOG),2.6f))return;long now=SystemClock.uptimeMillis();Actor g=byName(G),dog=byName(DOG);
        startReading(g,now,false);g.dozeAt=0;dog.direction=dog.x<g.x?1:-1;dog.play(dog.direction<0?"向左走":"向右走",0);dog.decision=now+10000; // 哥哥狗狗走过去批改作业
    }
    private void watchDemo(){if(!ensureCast(Arrays.asList(CAT,G),1.6f))return;startReading(byName(G),SystemClock.uptimeMillis(),true);}
    private void catchDemo(){
        if(!ensureCast(Arrays.asList(CAT,G),1.6f))return;Actor g=byName(G),cat=byName(CAT);long now=SystemClock.uptimeMillis();
        String clip=catalog.pairStory("catch",cat.pet,g.pet);
        g.y=Math.max(0,g.floor()-unit*2.5f);startFall(g,now);position(g);
        clock.postDelayed(()->{if(actors.contains(g)&&actors.contains(cat)&&!g.falling&&hugA==null&&storyKind==null)beginPair(cat,g,"catch",clip,0);},1500); // 演示一定接住
    }
    private void swapDemo(){if(!ensureCast(Arrays.asList(DOG,G),1.4f))return;trySwap(SystemClock.uptimeMillis(),true);}
    private void hobbyDemo(){
        if(!ensureCast(Arrays.asList(FENNEC),1))return;Actor f=byName(FENNEC);
        sceneA=f;sceneB=f;sceneSteps.clear();sceneStep=null;
        for(String h:HOBBIES)sceneSteps.add(playStep(f,h,2500)); // 五个小爱好轮流来
    }
    private void tailsDemo(){if(!ensureCast(Arrays.asList(FOX,FENNEC),1.4f))return;tryTails(SystemClock.uptimeMillis(),true);}
    private void tailquiltDemo(){if(!ensureCast(Arrays.asList(FOX,FENNEC),1.4f))return;tryTailquilt(SystemClock.uptimeMillis(),true);}
    /** 功能展示：按顺序把各种互动演一遍（用单独的时间表，换宠物时不会被打断）。 */
    private void showcase(){
        show.removeCallbacksAndMessages(null);
        Runnable[] steps={this::bounceParty,()->{hangDemo();tell("灵动岛可在设置中调位置和大小，开启后可以拖动",8000);},this::weatherDemoStart,this::helpUpDemo,this::blanketDemo,this::teaseDemo,this::fightDemoStart,
            this::snackDemo,this::chaseDemo,this::yawnDemo,this::readDemo,this::watchDemo,this::catchDemo,this::swapDemo,this::hobbyDemo,this::tailsDemo,this::tailquiltDemo,this::stackDemo,this::catDemo,
            this::festivalDemoStart,this::birthdayDemo,this::anniversaryDemo,this::remindDemo,this::nestDemo,this::focusDemo,()->climbDemo(-1),()->climbDemo(1),()->edgeDemo(-1),()->edgeDemo(1),this::lyricDemo};
        long[] at={0,9000,18000,68000,84000,100000,116000,140000,158000,170000,184000,204000,220000,232000,244000,272000,284000,300000,316000,330000,350000,358000,366000,380000,410000,422000,436000,450000,475000,500000};
        for(int i=0;i<steps.length;i++)show.postDelayed(steps[i],at[i]);
    }
    // ---- 叠叠乐（Claude）：照电脑版 tryStack / scatter ----
    /** 拖着的这只松手时，脚落在别人（或一摞）的头上，而且有对应的叠叠乐动画，就叠上去。 */
    private boolean tryStackDrop(Actor a,long now){
        if(hugA!=null||storyKind!=null||sceneA!=null)return false;
        float feet=a.y+unit,center=a.x+a.pos.width/2f;
        List<Actor> below=null;
        if(!stack.isEmpty()&&stack.size()<3&&!stack.contains(a)){
            Actor host=stack.get(0);float top=host.y+host.pos.height-host.view.gifHeight()*unit/300f,hc=host.x+host.pos.width/2f;
            if(Math.abs(center-hc)<unit*.5f&&feet>top-unit*.3f&&feet<top+unit*.6f)below=new ArrayList<>(stack);
        }
        if(below==null)for(Actor t:actors){
            if(t==a||!free(t))continue;
            float top=t.y+t.view.contentTop(),tc=t.x+t.pos.width/2f;
            if(Math.abs(center-tc)<unit*.45f&&feet>top-unit*.3f&&feet<top+unit*.5f){below=new ArrayList<>();below.add(t);break;}
        }
        if(below==null)return false;
        List<Catalog.Pet> pets=new ArrayList<>();for(Actor b:below)pets.add(b.pet);pets.add(a.pet);
        String clip=catalog.stack(pets);if(clip.isEmpty())return false;
        below.add(a);startStack(below,clip,now);return true;
    }
    private void startStack(List<Actor> members,String clip,long now){
        Actor host=members.get(0);float bottom=host.y+host.pos.height,center=host.x+host.pos.width/2f;
        for(Actor m:members){m.dragging=false;m.falling=false;m.direction=0;m.hang=0;m.ballEnd=0;m.sleeping=false;m.reading=false;m.thenClip=null;m.catPhase=0;m.perch=m.target=null;m.hopStart=0;}
        stack.clear();stack.addAll(members);
        host.view.show(clip);
        host.pos.width=Math.max(unit,Math.round(host.view.gifWidth()*unit/300f));host.pos.height=Math.max(unit,Math.round(host.view.gifHeight()*unit/300f));
        host.x=Math.max(0,Math.min(width-host.pos.width,center-host.pos.width/2f));host.y=Math.max(0,bottom-host.pos.height);
        for(int i=1;i<members.size();i++){Actor m=members.get(i);m.view.setVisibility(View.GONE);m.view.animate(false);}
        position(host);stackEnd=now+4000;
    }
    /** 叠叠乐播完：散开，最下面那只原地摔趴趴，上面的从各自的高度掉下来摔趴趴。 */
    private void scatter(long now){
        if(stack.isEmpty())return;
        List<Actor> members=new ArrayList<>(stack);stack.clear();
        Actor host=members.get(0);int n=members.size();float gifH=host.view.gifHeight()*unit/300f;
        float bottom=host.y+host.pos.height,center=host.x+host.pos.width/2f,step=n>1?Math.max(0,(gifH-unit*250f/300f)/(n-1)):0;
        host.pos.width=unit;host.pos.height=unit;
        for(int i=0;i<n;i++){
            Actor m=members.get(i);m.x=Math.max(0,Math.min(width-unit,center-unit/2f+(i==0?0:(random.nextFloat()-.5f)*unit*.6f)));m.y=bottom-unit-i*step;m.cooldown=now+10000;
            if(i==0){m.play("摔趴趴",1400);position(m);}else{startFall(m,now);position(m);}
        }
        refreshVisibility();
    }
    // ---- 百变猫猫（Claude）：2～4 分钟换下一只，变身_出 → 变身_进；双击换；设置里可锁定；性格照电脑版 ----
    private static boolean mealTime(){java.util.Calendar c=java.util.Calendar.getInstance();int m=c.get(java.util.Calendar.HOUR_OF_DAY)*60+c.get(java.util.Calendar.MINUTE);return (m>=11*60+30&&m<=12*60+30)||(m>=17*60+30&&m<=18*60+30);}
    private Actor nearestOther(Actor a){Actor best=null;for(Actor o:actors)if(o!=a&&free(o)&&(best==null||Math.abs(o.x-a.x)<Math.abs(best.x-a.x)))best=o;return best;}
    private void checkCat(Actor a,long now){
        if(a.nextCatSwitch==0)a.nextCatSwitch=now+120_000+random.nextInt(120_000);
        String lock=getSharedPreferences("pets",MODE_PRIVATE).getString("catLock","");
        if(!lock.isEmpty()&&!lock.equals(a.pet.skin)&&a.catPhase==0&&free(a)){for(Catalog.Pet c:catalog.cats())if(c.skin.equals(lock))switchCat(a,c,now);return;} // 锁定了某一只
        if(now<a.nextCatSwitch||!lock.isEmpty())return;
        if(!free(a)){a.nextCatSwitch=now+5000;return;}
        a.nextCatSwitch=now+120_000+random.nextInt(120_000);switchCat(a,null,now);
    }
    /** 下一只：五只都轮到之前不重复；饭点蛋黄酥更容易轮到，晚上芝麻更容易轮到。 */
    private Catalog.Pet nextCat(Actor a){
        List<Catalog.Pet> cats=catalog.cats();
        a.catBag.removeIf(c->c==a.pet);
        if(a.catBag.isEmpty())for(Catalog.Pet c:cats)if(c!=a.pet)a.catBag.add(c);
        int h=java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY);boolean night=h>=23||h<7,meal=mealTime();
        float total=0;for(Catalog.Pet c:a.catBag)total+=("蛋黄酥".equals(c.skin)&&meal?5:1)*("芝麻".equals(c.skin)&&night?3:1);
        float r=random.nextFloat()*total;
        for(Catalog.Pet c:a.catBag){r-=("蛋黄酥".equals(c.skin)&&meal?5:1)*("芝麻".equals(c.skin)&&night?3:1);if(r<=0)return c;}
        return a.catBag.get(a.catBag.size()-1);
    }
    private void switchCat(Actor a,Catalog.Pet to,long now){
        if(!a.pet.name.equals(MULTI)||a.catPhase!=0)return;
        if(a==hugA||a==hugB)endHug();if(isStory(a))cancelStory();if(inScene(a))cancelScene();if(stack.contains(a))scatter(now);
        Catalog.Pet next=to!=null?to:nextCat(a);if(next==null||next==a.pet)return;
        a.catBag.remove(next);a.catNext=next;a.catPhase=1;a.direction=0;a.sleeping=false;a.reading=false;a.thenClip=null;
        a.play("变身_出",0);a.until=now+Math.max(800,a.view.duration());
    }
    private void stackDemo(){
        if(!ensureCast(Arrays.asList(CAT,BUNNY,"梨梨哥哥"),1.6f))return;
        Actor cat=byName(CAT),bunny=byName(BUNNY),lili=byName("梨梨哥哥");long now=SystemClock.uptimeMillis();
        String two=catalog.stack(Arrays.asList(cat.pet,bunny.pet));if(two.isEmpty())return;
        startStack(new ArrayList<>(Arrays.asList(cat,bunny)),two,now);stackEnd=now+60_000;
        clock.postDelayed(()->{ // 第三只也叠上去
            if(stack.size()!=2||!actors.contains(lili))return;String three=catalog.stack(Arrays.asList(cat.pet,bunny.pet,lili.pet));
            if(three.isEmpty()){stackEnd=SystemClock.uptimeMillis()+2500;return;}
            freeForScene(lili);List<Actor> all=new ArrayList<>(stack);all.add(lili);startStack(all,three,SystemClock.uptimeMillis());
        },2500);
    }
    private void catDemo(){
        if(!ensureCast(Arrays.asList(MULTI),1))return;
        switchCat(byName(MULTI),null,SystemClock.uptimeMillis());
    }
    private void bounceParty(){
        if(!screenOn||paused||getSystemService(KeyguardManager.class).isKeyguardLocked())return;
        endHug();cancelStory();cancelScene();long now=SystemClock.uptimeMillis();if(!stack.isEmpty())scatter(now);
        for(Actor a:actors){
            if(a.dragging||a.climb!=0)continue; // 趴在墙上的只有拖出来才下来
            a.sleeping=false;if(a.nest!=0){a.nest=0;a.nestAfter=now+600_000;}
            a.perch=a.target=null;a.hopStart=0;a.falling=false;a.direction=0;a.nextHop=now+8000;
            a.hang=0;a.rainbowAfter=false;
            a.ballEnd=now+4500;a.ballX=(random.nextBoolean()?1:-1)*unit*3;a.ballY=-unit*5;
            a.play("摇晃",0); // 弹力球飞动期间摇晃
        }
    }
    private void checkAutomaticUpdate(android.content.SharedPreferences prefs){
        if(!UpdateChecker.due(prefs))return;
        UpdateChecker.check(this,result->{
            if(result.version==null||destroyed||!prefs.getBoolean("autoUpdate",false))return;
            PendingIntent open=PendingIntent.getActivity(this,3,new Intent(this,MainActivity.class).setAction("update"),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
            getSystemService(NotificationManager.class).notify(9,new Notification.Builder(this,"pets").setSmallIcon(R.drawable.ic_pet).setColor(0xFFEFA7C0).setLargeIcon(android.graphics.drawable.Icon.createWithResource(this,R.drawable.ic_qianqian_large)).setContentTitle("桌宠有新版本 "+result.version).setContentText("点这里查看更新说明并下载").setContentIntent(open).setAutoCancel(true).build());
        });
    }
    private String liveCompanionMode(long now,android.content.SharedPreferences prefs){
        InterfaceCompanion.Snapshot state=InterfaceCompanion.snapshot;
        return now<typingDemoUntil?"type":AppCompanion.live(prefs.getBoolean("companion",false),
            state.pkg,prefs.getAll(),companionMode,now,prefs.getBoolean("interface",false)?state.input:0);
    }
    private void updateIsland(long now,android.content.SharedPreferences prefs,boolean unlocked){
        if(!unlocked){hideIsland();return;}
        if(islandTouching&&island!=null)return; // Finish the gesture before a short notification expires.
        if(prefs.getBoolean("delivery",false)&&DeliveryCompanion.hintAt>lastDelivery){
            lastDelivery=DeliveryCompanion.hintAt;islandFromNotice=false;
            if(SystemClock.elapsedRealtime()-lastDelivery<30000){islandMessage=DeliveryCompanion.hint;islandUntil=now+9000;islandDismissed=0;}
        }
        if(DeliveryCompanion.noticeAt>lastNotice && SystemClock.elapsedRealtime()-DeliveryCompanion.noticeAt<15000){
            lastNotice=DeliveryCompanion.noticeAt;islandFromNotice=true;islandMessage=DeliveryCompanion.notice;islandUntil=now+7000;islandDismissed=0;
        }
        if(now>=nextMediaCheck){nextMediaCheck=now+1500;if(prefs.getBoolean("islandMedia",false)||prefs.getBoolean("islandLyrics",false))media.refresh();else media.clear();
            batteryLabel="";
            if(prefs.getBoolean("islandBattery",false)){
                Intent battery=registerReceiver(null,new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
                if(battery!=null&&battery.getIntExtra(BatteryManager.EXTRA_PLUGGED,0)!=0){int level=battery.getIntExtra(BatteryManager.EXTRA_LEVEL,0),scale=Math.max(1,battery.getIntExtra(BatteryManager.EXTRA_SCALE,100));batteryLabel="⚡ 充电中 · "+(level*100/scale)+"%";}
            }
        }
        boolean notice=now<islandUntil&&(prefs.getBoolean("delivery",false)||islandFromNotice||islandMessage.startsWith("演示"));
        String label=notice?islandMessage:"";
        // 外卖进度（Claude）：每分钟重新读一次正在进行的外卖通知，按现在的时间算还有几分钟；读不到就不显示
        String delivery="";
        if(prefs.getBoolean("delivery",false)){
            if(now>=nextLiveCheck){nextLiveCheck=now+60000;DeliveryCompanion.refreshLive();}
            delivery=DeliveryCompanion.liveLabel(DeliveryCompanion.nowMinute());
        }else if(DeliveryCompanion.live!=null)DeliveryCompanion.live=null;
        if(label.isEmpty()&&now<tellUntil)label=tellText; // 伙伴说的话（提醒、过节、纪念日、专注）
        boolean live=label.isEmpty()&&!delivery.isEmpty();
        if(live)label=delivery;
        long remaining=prefs.getLong("timerEnd",0)-System.currentTimeMillis();
        if(SystemClock.elapsedRealtime()<timerFinishedUntil)label="⏱ 时间到啦";
        else if(label.isEmpty()&&remaining>0)label=String.format(java.util.Locale.ROOT,"⏱ %02d:%02d",remaining/60000,(remaining/1000)%60);
        long focusLeft=prefs.getLong("focusEnd",0)-System.currentTimeMillis();
        if(label.isEmpty()&&focusing&&focusLeft>0)label="🍅 专注中 · 还剩 "+((focusLeft+59_999)/60_000)+" 分钟";
        boolean mediaLabel=false;
        // 歌词在通知、外卖、计时这些提示后面：提示结束再回到歌词（Claude）
        String lyric=now<lyricDemoUntil?demoLyric(now):prefs.getBoolean("islandLyrics",false)?currentLyric():"";
        boolean lyricShown=false;
        if(label.isEmpty()&&!lyric.isEmpty()){label=lyric;mediaLabel=true;lyricShown=true;}
        else if(label.isEmpty()&&(prefs.getBoolean("islandMedia",false)||prefs.getBoolean("islandLyrics",false))&&!media.title.isEmpty()){label=(media.playing?"♫ ":"Ⅱ ")+media.title;mediaLabel=true;}
        if(label.isEmpty()&&prefs.getBoolean("islandBattery",false))label=batteryLabel;
        if(label.isEmpty()&&prefs.getBoolean("island",false)){
            String mode=liveCompanionMode(now,prefs);
            if("type".equals(mode)){label="🐾 陪你打字中";mediaLabel=true;}
            else if("video".equals(mode)){label="🐾 陪你看视频";mediaLabel=true;}
            else if("music".equals(mode)){label="♫ 一起摇摆";mediaLabel=true;}
        }
        islandMediaShown=mediaLabel;
        if(label.isEmpty()||now<islandDismissed){hideIsland();islandNotice=false;}
        else{lyricMode(lyricShown);showIsland(label);islandNotice=notice&&label.equals(islandMessage);}
        islandLive=live&&label.equals(delivery)&&now>=islandDismissed;
    }
    private void showIsland(String label){
        if(island==null){
            island=new android.widget.TextView(this);island.setGravity(Gravity.CENTER);island.setTextColor(android.graphics.Color.WHITE);
            island.setSingleLine(true);island.setEllipsize(android.text.TextUtils.TruncateAt.END);
            island.setOnClickListener(v->{if(!openNotice())openIslandPanel();});island.setOnLongClickListener(v->{openIslandPanel();return true;});
            island.setOnTouchListener(this::touchIsland);
            WindowManager.LayoutParams p=new WindowManager.LayoutParams(1,1,WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,PixelFormat.TRANSLUCENT);
            p.gravity=Gravity.TOP|Gravity.LEFT;island.setLayoutParams(p);layoutIsland();
            islandShownLabel=null;islandLyricMode=false;
            try{windows.addView(island,p);}catch(RuntimeException e){island=null;return;}
        }else if(!islandTouching)layoutIsland();
        if(!label.equals(islandShownLabel)){
            boolean slide=islandLyricMode&&islandShownLabel!=null&&islandShownLabel.startsWith("♫")&&label.startsWith("♫")&&island.isLaidOut();
            islandShownLabel=label;
            if(slide)slideIsland(label);else{stopSlide();island.setText(label);}
        }
    }
    private void layoutIsland(){
        if(island==null)return;
        android.content.SharedPreferences prefs=getSharedPreferences("pets",MODE_PRIVATE);
        float density=getResources().getDisplayMetrics().density;int scale=IslandHang.percent(prefs.getInt("islandScale",100));
        int block=IslandHang.scaledBlock(density,scale,height);
        if(island.getBackground()==null||block!=islandBlock){
            islandBlock=block;islandArt=IslandBackground.load(this,catalog,block);
            if(islandArt!=null){island.setBackground(islandArt);int cap=islandArt.capWidth();island.setPadding(cap,0,cap,0);}
            else{android.graphics.drawable.GradientDrawable bg=new android.graphics.drawable.GradientDrawable();bg.setColor(0xEE302932);bg.setCornerRadius(100);island.setBackground(bg);int pad=Math.round(18*density*scale/100f);island.setPadding(pad,0,pad,0);}
        }
        float textSize=14*scale/100f;if(Math.abs(island.getTextSize()/getResources().getDisplayMetrics().scaledDensity-textSize)>.01f)island.setTextSize(textSize);
        WindowManager.LayoutParams p=(WindowManager.LayoutParams)island.getLayoutParams();
        int w=IslandHang.width(density,scale,width),h=Math.min(height,islandArt==null?Math.round(48*density*scale/100f):IslandHang.height(block));
        int x=IslandHang.position(prefs.getFloat("islandX",.5f),width,w,(width-w)/2),y=IslandHang.position(prefs.getFloat("islandY",-1),height,h,Math.round(12*density));
        if(p.width==w&&p.height==h&&p.x==x&&p.y==y)return;
        p.width=w;p.height=h;p.x=x;p.y=y;
        if(island.isAttachedToWindow())try{windows.updateViewLayout(island,p);}catch(RuntimeException ignored){}
    }
    private boolean touchIsland(View view,MotionEvent event){
        WindowManager.LayoutParams p=(WindowManager.LayoutParams)view.getLayoutParams();
        switch(event.getActionMasked()){
            case MotionEvent.ACTION_DOWN:
                islandTouching=true;islandDragging=islandMoved=islandLongPressed=false;
                islandDownX=event.getRawX();islandDownY=event.getRawY();islandStartX=p.x;islandStartY=p.y;
                clock.postDelayed(islandLongPress,ViewConfiguration.getLongPressTimeout());return true;
            case MotionEvent.ACTION_MOVE:
                if(!islandTouching||islandLongPressed)return true;
                float dx=event.getRawX()-islandDownX,dy=event.getRawY()-islandDownY;
                if(IslandHang.dragged(dx,dy,ViewConfiguration.get(this).getScaledTouchSlop())){islandMoved=true;clock.removeCallbacks(islandLongPress);}
                if(islandMoved&&getSharedPreferences("pets",MODE_PRIVATE).getBoolean("islandDrag",false)){
                    islandDragging=true;p.x=IslandHang.limit(islandStartX+Math.round(dx),width,p.width);p.y=IslandHang.limit(islandStartY+Math.round(dy),height,p.height);
                    try{windows.updateViewLayout(view,p);}catch(RuntimeException ignored){}
                }return true;
            case MotionEvent.ACTION_UP:
                clock.removeCallbacks(islandLongPress);
                if(!islandTouching)return true;islandTouching=false;
                if(islandDragging)getSharedPreferences("pets",MODE_PRIVATE).edit().putFloat("islandX",IslandHang.fraction(p.x,width,p.width)).putFloat("islandY",IslandHang.fraction(p.y,height,p.height)).apply();
                else if(!islandMoved&&!islandLongPressed)view.performClick();
                islandDragging=false;return true;
            case MotionEvent.ACTION_POINTER_DOWN:case MotionEvent.ACTION_CANCEL:
                clock.removeCallbacks(islandLongPress);islandTouching=islandDragging=false;islandMoved=true;layoutIsland();return true;
            default:return true;
        }
    }
    private void previewIsland(){
        paused=false;refreshVisibility();islandMessage="演示：灵动岛位置与大小";islandFromNotice=false;islandUntil=SystemClock.uptimeMillis()+60000;islandDismissed=0;showIsland(islandMessage);
    }
    private void openIslandSettings(){
        if(islandSettings!=null)return;
        islandSettings=IslandSettings.open(this,true,this::previewIsland);islandSettings.setOnDismissListener(d->islandSettings=null);
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
        hangDemoUntil=islandUntil;
    }
    /** 选好的伙伴（默认第一只出来的）在通知提示条出现时挂上去；提示条消失或换成别的内容就落回地面。 */
    private void updateHanger(long now,android.content.SharedPreferences prefs){
        // 和敲键盘动画使用同一份联动状态；任何提示或演示都不能抢走打字。
        // 只有明确的挂岛演示临时绕过开关，不能根据残留的提示文字判断。
        boolean want=island!=null&&island.isLaidOut()&&now>=hangSkipUntil
            &&IslandHang.allowed(prefs.getBoolean("islandHang",false),now,hangDemoUntil,
                liveCompanionMode(now,prefs),islandMediaShown);
        Actor chosen=null;
        if(want){
            String id=prefs.getString("islandPet","");
            for(Actor a:actors)if(a.pet.id.equals(id)&&a!=hugB&&(a.climb==0||a.home!=0)&&!a.dragging){chosen=a;break;}
            if(chosen==null)for(Actor a:actors)if(a.climb==0||a.home!=0){chosen=a;break;} // 歪手机趴在墙上的不去挂；住在边上的照样去挂，挂完回边上
        }
        for(Actor a:actors){
            if(a==chosen){
                if(a.hang==0&&!a.dragging){
                    if(a.home!=0){a.climbTo=a.y;a.climb=0;a.view.animate().cancel();a.view.setTranslationX(0);} // 记住原来的高度，挂完回去
                    if(a==hugA||a==hugB)endHug();
                    if(isStory(a))cancelStory();if(inScene(a))cancelScene();if(stack.contains(a))scatter(now);a.sleeping=false;
                    a.ballEnd=0;a.rainbowAfter=false;a.perch=a.target=null;a.hopStart=0;a.falling=false;a.bouncing=false;a.direction=0;
                    boolean grounded=a.y>=a.floor()-1;
                    a.hang=grounded?1:2;a.hangStart=now;a.hangFromX=a.x;a.hangFromY=a.y;
                    a.lastTap=0;
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
        if(a.hang==1){ // 先在地上跑到提示条正下方
            float step=unit*1.6f*dt,dx=tx-a.x;
            if(Math.abs(dx)<=step){a.x=tx;a.hang=2;a.hangStart=now;a.hangFromX=a.x;a.hangFromY=a.y;a.play("开心蹦蹦",0);}
            else{a.x+=Math.signum(dx)*step;a.play(dx<0?"向左走":"向右走",0);}
        }else if(a.hang==2){ // 跳上去
            float p=Math.min(1,(now-a.hangStart)/650f);
            a.x=a.hangFromX+(tx-a.hangFromX)*p;
            a.y=a.hangFromY+(ty-a.hangFromY)*p-unit*.6f*4*p*(1-p);
            if(p>=1){a.hang=3;a.play("灵动岛",0);bringToFront(a);}
        }else{a.x=tx;a.y=ty;if(now>=a.until&&!"灵动岛".equals(a.action))a.play("灵动岛",0);}
        position(a);
    }
    /** 挂着时爪子要盖在提示条边上，所以把这只的窗口放到最上层。 */
    private void bringToFront(Actor a){
        if(!a.view.isAttachedToWindow())return;
        try{windows.removeViewImmediate(a.view);windows.addView(a.view,a.pos);}catch(RuntimeException ignored){}
    }
    /** 提示条上正显示外卖 / 选中应用的通知时，点一下打开那条通知（和在通知栏里点一样）；打不开就打开那个应用。 */
    private boolean openNotice(){
        DeliveryCompanion.Live order=islandLive?DeliveryCompanion.live:null;
        if(order==null&&(!islandNotice||islandMessage.startsWith("演示")))return false;
        PendingIntent target=order!=null?order.intent:islandFromNotice?DeliveryCompanion.noticeIntent:DeliveryCompanion.hintIntent;
        String pkg=order!=null?order.pkg:islandFromNotice?DeliveryCompanion.noticePkg:DeliveryCompanion.hintPkg;
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
        if(opened&&order==null){islandUntil=0;hideIsland();islandNotice=false;} // 外卖进度点开 App 后还留着
        return opened;
    }
    private void openIslandPanel(){
        if(islandPanel!=null)return;
        islandPanel=new AlertDialog.Builder(this).setTitle("灵动面板").setItems(new String[]{"上一首","播放 / 暂停","下一首","取消计时器","隐藏提示 30 秒","位置、大小与拖动"},(d,i)->{
            if(i<3 && getSharedPreferences("pets",MODE_PRIVATE).getBoolean("islandMedia",false))media.control(i);
            if(i==3)getSharedPreferences("pets",MODE_PRIVATE).edit().putLong("timerEnd",0).apply();
            if(i==5)openIslandSettings();
            if(i==4){islandDismissed=SystemClock.uptimeMillis()+30000;hideIsland();}
        }).setNegativeButton("关闭",null).create();
        islandPanel.getWindow().setType(WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY);
        islandPanel.setOnDismissListener(d->islandPanel=null);islandPanel.show();
    }
    // ---- 外卖通知检查（Claude）：屏幕上一个小窗口，显示可能是外卖的通知能读到的字段；有「刷新」「关闭」 ----
    private android.widget.LinearLayout inspector;
    private android.widget.TextView inspectorText;
    private long inspectorShown=-1;
    private void openInspector(){
        DeliveryCompanion.inspecting=true;
        if(inspector==null){
            float d=getResources().getDisplayMetrics().density;
            inspector=new android.widget.LinearLayout(this);inspector.setOrientation(android.widget.LinearLayout.VERTICAL);inspector.setPadding((int)(12*d),(int)(8*d),(int)(12*d),(int)(8*d));
            android.graphics.drawable.GradientDrawable bg=new android.graphics.drawable.GradientDrawable();bg.setColor(0xE6302932);bg.setCornerRadius(16*d);inspector.setBackground(bg);
            android.widget.LinearLayout row=new android.widget.LinearLayout(this);
            for(String name:new String[]{"刷新","关闭"}){
                android.widget.Button button=new android.widget.Button(this);button.setText(name);button.setAllCaps(false);
                button.setOnClickListener(v->{if(name.equals("关闭"))closeInspector();else{inspectorShown=-1;checkListener();DeliveryCompanion.scanActive();updateInspector();}});
                row.addView(button,new android.widget.LinearLayout.LayoutParams(0,(int)(44*d),1));
            }
            inspector.addView(row);
            android.widget.ScrollView scroll=new android.widget.ScrollView(this);
            inspectorText=new android.widget.TextView(this);inspectorText.setTextColor(android.graphics.Color.WHITE);inspectorText.setTextSize(12);inspectorText.setTextIsSelectable(false);
            scroll.addView(inspectorText);
            inspector.addView(scroll,new android.widget.LinearLayout.LayoutParams(-1,(int)(height*0.5f)));
            WindowManager.LayoutParams p=new WindowManager.LayoutParams(width-(int)(16*d),WindowManager.LayoutParams.WRAP_CONTENT,WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,PixelFormat.TRANSLUCENT);
            p.gravity=Gravity.TOP|Gravity.CENTER_HORIZONTAL;p.y=(int)(76*d);
            try{windows.addView(inspector,p);}catch(RuntimeException e){inspector=null;inspectorText=null;DeliveryCompanion.inspecting=false;return;}
        }
        inspectorShown=-1;checkListener();DeliveryCompanion.scanActive();updateInspector();
    }
    /** 通知使用权开着吗（系统设置里的名单）。 */
    private boolean listenerAllowed(){
        String list=Settings.Secure.getString(getContentResolver(),"enabled_notification_listeners");
        return list!=null&&list.contains(new android.content.ComponentName(this,DeliveryCompanion.class).flattenToString());
    }
    /** 权限开了但还没连上：请系统重新连一次。 */
    private void checkListener(){
        if(!DeliveryCompanion.connected()&&listenerAllowed())try{android.service.notification.NotificationListenerService.requestRebind(new android.content.ComponentName(this,DeliveryCompanion.class));}catch(RuntimeException ignored){}
    }
    private void updateInspector(){
        if(inspector==null||inspectorText==null||inspectorShown==DeliveryCompanion.inspectedAt)return;
        inspectorShown=DeliveryCompanion.inspectedAt;
        StringBuilder b=new StringBuilder("通知检查：外卖 / 音乐歌词（只显示在屏幕上，不保存不上传不写日志）\n");
        if(!DeliveryCompanion.connected()){
            if(!listenerAllowed())b.append("\n⚠ 通知使用权没开：在设置页点「允许音乐与通知访问」，给「外卖提示 · 梨间雪桌宠」打开，再点「刷新」。");
            else b.append("\n通知使用权开了，但还没连上，已经请系统重新连接，过几秒点「刷新」。");
        }else synchronized(DeliveryCompanion.inspected){
            int total=DeliveryCompanion.scannedTotal;
            if(DeliveryCompanion.inspected.isEmpty())b.append("\n没找到外卖或音乐通知：通知栏里").append(total>=0?"的 "+total+" 条通知":"").append("没有美团 / 饿了么、网易云等音乐 App 的，也没有标题或正文包含「送达、骑手、取餐、配送、商家」的。有新的会自动出现，也可以点「刷新」。");
            else b.append("\n读了一遍通知栏").append(total>=0?"（共 "+total+" 条）":"").append("，找到这些（最新的在上面）：");
            java.util.List<String> list=new java.util.ArrayList<>(DeliveryCompanion.inspected.values());java.util.Collections.reverse(list);
            for(String t:list)b.append("\n\n").append(t);
        }
        inspectorText.setText(b);
    }
    private void closeInspector(){
        DeliveryCompanion.stopInspect();
        if(inspector!=null){if(inspector.isAttachedToWindow())windows.removeView(inspector);inspector=null;inspectorText=null;}
    }
    private void hideIsland(){clock.removeCallbacks(islandLongPress);islandTouching=islandDragging=false;hangSkipUntil=0;hangDemoUntil=0; // 下次提示条出来又可以挂
        stopSlide();if(island!=null){if(island.isAttachedToWindow())windows.removeView(island);island=null;}islandShownLabel=null;islandLyricMode=false;}
    private void openSettings(){try{startActivity(new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_SINGLE_TOP));}catch(RuntimeException ignored){}}
    private void refreshVisibility(){observeApps=screenOn&&!paused;InterfaceCompanion.visible=observeApps;if(!observeApps){motion.enabled(false);hideIsland();hideNest();if(islandPanel!=null)islandPanel.dismiss();if(islandSettings!=null)islandSettings.dismiss();media.clear();companionMode="none";InterfaceCompanion.clear();}for(Actor a:actors){boolean visible=screenOn&&!paused&&a!=hugB;a.view.setVisibility(visible?View.VISIBLE:View.GONE);a.view.animate(visible);}}
    private void clearActors(){hideIsland();hideNest();hugA=hugB=null;storyKind=null;storyPet=storyDog=null;sceneA=sceneB=null;sceneSteps.clear();sceneStep=null;fightDemo=false;stack.clear();clock.removeCallbacksAndMessages(null);for(Actor a:actors){a.view.animate(false);if(a.view.isAttachedToWindow())windows.removeView(a.view);}actors.clear();}
    @Override public void onConfigurationChanged(Configuration config){super.onConfigurationChanged(config);hideIsland();hideNest();for(Actor a:actors){if(a.nest!=0){a.nest=0;a.sleeping=false;}a.climb=a.home!=0?1:0;a.climbSide=a.home;a.view.setTranslationX(0);}endHug();cancelStory();cancelScene();if(!stack.isEmpty())scatter(SystemClock.uptimeMillis());InterfaceCompanion.clear();keyboardFloor=-1;surfaces=Collections.emptyList();demoUntil=typingDemoUntil=0;measure();for(Actor a:actors){a.perch=a.target=null;a.hopStart=0;a.hang=0;a.rainbowAfter=false;a.y=a.floor();a.ballEnd=0;a.dragging=a.falling=false;position(a);}}
    @Override public void onDestroy(){destroyed=true;if(lyrics!=null)lyrics.shutdown();closeInspector();hideNest();show.removeCallbacksAndMessages(null);if(islandPanel!=null)islandPanel.dismiss();if(islandSettings!=null)islandSettings.dismiss();motion.enabled(false);hideIsland();observeApps=false;InterfaceCompanion.visible=false;InterfaceCompanion.clear();usageClock.removeCallbacksAndMessages(null);usageThread.quitSafely();clock.removeCallbacksAndMessages(null);clearActors();unregisterReceiver(screen);stopForeground(STOP_FOREGROUND_REMOVE);super.onDestroy();}
    @Override public IBinder onBind(Intent i){return null;}

    // ---- 过节 / 生日 / 在一起多少天（Claude）：照电脑版 lib/calendar.js、lib/diary.js、pets.js 的 maybeCelebrate ----
    /** 农历的 {月, 日}；闰月算 0（不算正月）。 */
    private static int[] lunar(long millis){
        try{android.icu.util.ChineseCalendar c=new android.icu.util.ChineseCalendar();c.setTimeInMillis(millis);
            boolean leap=c.get(android.icu.util.ChineseCalendar.IS_LEAP_MONTH)==1;
            return new int[]{leap?0:c.get(android.icu.util.Calendar.MONTH)+1,c.get(android.icu.util.Calendar.DAY_OF_MONTH)};}
        catch(RuntimeException e){return new int[]{0,0};}
    }
    /** 每分钟看一次今天是什么日子；开关「过节、生日、纪念日」默认关闭。 */
    private void checkDay(long now,android.content.SharedPreferences prefs){
        if(now<nextDayCheck)return;nextDayCheck=now+60_000;
        long today=java.time.LocalDate.now().toEpochDay();
        if(!prefs.contains("firstDay"))prefs.edit().putLong("firstDay",today).apply(); // 第一次打开的日子
        boolean on=prefs.getBoolean("celebrate",false);
        java.util.Calendar c=java.util.Calendar.getInstance();
        int month=c.get(java.util.Calendar.MONTH)+1,day=c.get(java.util.Calendar.DAY_OF_MONTH);
        int[] lt=lunar(c.getTimeInMillis()),ln=lunar(c.getTimeInMillis()+86_400_000L);
        String fest=on?CalendarRules.festival(month,day,lt[0],lt[1],ln[0],ln[1]):null;
        Set<String> born=new HashSet<>();
        if(on){String md=CalendarRules.monthDay(month,day);for(Catalog.Pet pet:catalog.pets)if(md.equals(prefs.getString("birthday:"+pet.name,"")))born.add(pet.name);}
        boolean changed=!java.util.Objects.equals(fest,festivalToday)||!born.equals(birthdayNames);
        festivalToday=fest;birthdayNames.clear();birthdayNames.addAll(born);
        if(changed)for(Actor a:actors)a.nextCelebrate=fest!=null||!born.isEmpty()?now+2000+random.nextInt(6000):0;
        long days=CalendarRules.daysTogether(prefs.getLong("firstDay",today),today);
        if(on&&CalendarRules.isAnniversary(days)&&prefs.getLong("celebratedDays",0)!=days){
            prefs.edit().putLong("celebratedDays",days).apply();clock.postDelayed(()->celebrateTogether(days),3000);
        }
    }
    /** 过节 / 生日当天时不时播一下（3～6 分钟一次），过生日的那只六成机会播「生日」。 */
    private boolean maybeCelebrate(Actor a,long now){
        if(focusing||a.nextCelebrate==0||now<a.nextCelebrate)return false;
        boolean birthday=birthdayNames.contains(a.pet.name)&&a.pet.clips.has("生日");
        String fest=festivalToday!=null&&a.pet.clips.has(festivalToday)?festivalToday:null;
        if(!birthday&&fest==null){a.nextCelebrate=0;return false;}
        a.nextCelebrate=now+180_000+random.nextInt(180_000);
        String clip=birthday&&(fest==null||random.nextFloat()<.6f)?"生日":fest;
        a.direction=0;a.play(clip,4000);
        if("生日".equals(clip)&&now-lastBirthdayTell>60_000){lastBirthdayTell=now;tell(NICK+"，今天是"+a.pet.name+"的生日 🎂",6000);}
        return true;
    }
    private void celebrateTogether(long days){
        long now=SystemClock.uptimeMillis();
        for(Actor a:actors)if(storyFree(a)&&!a.sleeping&&a.pet.clips.has("纪念日")){a.direction=0;a.play("纪念日",4000);}
        tell(NICK+"，我们在一起第 "+days+" 天啦",8000);
    }
    /** 手机上没有气泡：伙伴说的话显示在提示条上。 */
    private void tell(String text,long ms){tellText=text;tellUntil=SystemClock.uptimeMillis()+ms;islandDismissed=0;}
    // ---- 时间提醒（Claude）：0～5 点每 20 分钟催睡觉，12 点、18 点左右提醒吃饭；默认关闭，专注时不打扰 ----
    private void checkClock(long now,android.content.SharedPreferences prefs){
        if(!prefs.getBoolean("timeRemind",false))return;
        java.util.Calendar c=java.util.Calendar.getInstance();
        int hour=c.get(java.util.Calendar.HOUR_OF_DAY),minute=hour*60+c.get(java.util.Calendar.MINUTE);
        if(CalendarRules.nagNight(hour)){
            if(lastNightNag==0||now-lastNightNag>=CalendarRules.NIGHT_EVERY){lastNightNag=now;if(!focusing)remind("睡觉",NICK+"，该睡觉啦",6000);}
        }else lastNightNag=0;
        int meal=CalendarRules.meal(minute);
        if(meal>=0&&mealsDone.add(java.time.LocalDate.now()+"-"+meal)&&!focusing)remind("吃饭",NICK+"，该吃饭啦",4000);
    }
    /** 提醒：能动的伙伴都做个动作，话写在提示条上；窝里睡着的不吵它。 */
    private void remind(String clip,String text,long ms){
        for(Actor a:actors)if(storyFree(a)&&!a.sleeping){a.direction=0;a.play(a.pet.clips.has(clip)?clip:"开心蹦蹦",ms);}
        tell(text,8000);
    }
    // ---- 小窝（Claude）：屏幕左下角两层图（后层在伙伴下面、前层盖在上面）；晚上 11 点后困了回窝挤着睡，早上 7 点后或被摸醒出来 ----
    private void updateNest(long now,android.content.SharedPreferences prefs){
        boolean on=(prefs.getBoolean("nest",false)||now<nestDemoUntil)&&catalog.nest!=null&&screenOn&&!paused;
        if(on&&nestBack==null)showNest();else if(!on&&nestBack!=null){for(Actor a:actors)if(a.nest!=0){a.nest=0;a.sleeping=false;a.play(idle(a),0);}hideNest();}
        if(nestBack==null||now<nextNestCheck||now<nestDemoUntil)return;
        nextNestCheck=now+30_000;
        int hour=java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY);
        if(CalendarRules.night(hour)){
            if(focusing)return;
            for(Actor a:actors)if(a.nest==0&&now>=a.nestAfter&&free(a)&&random.nextFloat()<("芝麻".equals(a.pet.skin)?.5f:.25f))goToNest(a); // 芝麻困得快
        }else{
            int i=0;for(Actor a:actors)if(a.nest==2&&a.nightSleep){Actor x=a;clock.postDelayed(()->leaveNest(x),i++*1500L);} // 早上一个一个出来
        }
    }
    private android.widget.ImageView nestImage(String part) throws java.io.IOException {
        try(java.io.InputStream in=getAssets().open(catalog.nest.optString(part))){
            android.graphics.drawable.BitmapDrawable art=new android.graphics.drawable.BitmapDrawable(getResources(),android.graphics.BitmapFactory.decodeStream(in));
            art.setFilterBitmap(false); // 像素图整像素放大
            android.widget.ImageView view=new android.widget.ImageView(this);view.setScaleType(android.widget.ImageView.ScaleType.FIT_XY);view.setImageDrawable(art);return view;
        }
    }
    @android.annotation.SuppressLint("RtlHardcoded")
    private WindowManager.LayoutParams nestParams(){
        WindowManager.LayoutParams p=new WindowManager.LayoutParams(nestW,nestH,WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,PixelFormat.TRANSLUCENT);
        p.gravity=Gravity.TOP|Gravity.LEFT;p.x=nestLeft();p.y=Math.max(0,height-nestH);return p;
    }
    private int nestLeft(){return Math.round(8*getResources().getDisplayMetrics().density);}
    private float nestCenter(){return nestLeft()+nestW/2f;}
    /** 后层先放，伙伴的窗口重新放一遍（叠在后层上面），最后放前层。 */
    private void showNest(){
        nestW=Math.min(width,Math.round(unit*460f/300f));nestH=Math.round(nestW*120f/460f);
        try{
            nestBack=nestImage("back");nestFront=nestImage("front");
            windows.addView(nestBack,nestParams());
            for(Actor a:actors)if(a.view.isAttachedToWindow()){windows.removeView(a.view);windows.addView(a.view,a.pos);}
            windows.addView(nestFront,nestParams());
        }catch(java.io.IOException|RuntimeException e){hideNest();}
        refreshPetsShown();
    }
    private void refreshPetsShown(){for(Actor a:actors){boolean visible=screenOn&&!paused&&a!=hugB&&!(stack.contains(a)&&a!=stack.get(0));a.view.setVisibility(visible?View.VISIBLE:View.GONE);a.view.animate(visible);}}
    private void hideNest(){
        for(android.widget.ImageView v:new android.widget.ImageView[]{nestBack,nestFront})if(v!=null&&v.isAttachedToWindow())try{windows.removeView(v);}catch(RuntimeException ignored){}
        nestBack=nestFront=null;
    }
    private void goToNest(Actor a){
        if(nestBack==null||a.nest!=0)return;
        a.nest=1;a.direction=0;a.until=0;a.reading=false;a.thenClip=null;yawnQueue.remove(a);
    }
    private void walkToNest(Actor a,long now,float dt){
        float goal=nestCenter()-a.pos.width/2f,d=goal-a.x;
        if(Math.abs(d)<unit*.05f){settleNest(a);return;}
        int dir=d<0?-1:1;String clip=dir<0?"犯困向左走":"犯困向右走";if(!a.pet.clips.has(clip))clip=dir<0?"向左走":"向右走";
        if(!a.action.equals(clip))a.play(clip,0);
        a.x+=dir*Math.min(Math.abs(d),unit*.35f*dt);position(a);
    }
    private void settleNest(Actor a){
        a.nest=2;a.sleeping=true;a.direction=0;a.until=0;
        a.nightSleep=CalendarRules.night(java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY));
        a.play("睡觉",0);arrangeNest();
    }
    /** 窝里睡的挤在一起。 */
    private void arrangeNest(){
        List<Actor> sleepers=new ArrayList<>();for(Actor a:actors)if(a.nest==2)sleepers.add(a);
        for(int i=0;i<sleepers.size();i++){Actor a=sleepers.get(i);a.perch=null;a.x=nestCenter()-a.pos.width/2f+CalendarRules.nestOffset(i,sleepers.size(),unit,nestW);a.y=a.floor();position(a);}
    }
    private void leaveNest(Actor a){
        if(a.nest!=2)return;
        a.nest=0;a.sleeping=false;a.until=0;a.direction=walking?1:0;a.play(a.direction>0?"向右走":idle(a),0);a.decision=SystemClock.uptimeMillis()+3000;arrangeNest();
    }
    // ---- 番茄钟（Claude）：专注 25 分钟、休息 5 分钟；专注时伙伴安静陪着，结束提醒休息 ----
    private static final long FOCUS_MS=25*60_000L,REST_MS=5*60_000L;
    private void startFocus(){
        getSharedPreferences("pets",MODE_PRIVATE).edit().putLong("focusEnd",System.currentTimeMillis()+FOCUS_MS).putLong("restEnd",0).apply();
        getSystemService(NotificationManager.class).cancel(10);
        applyFocus(true);tell("🍅 开始专注 25 分钟，大家安静陪着你",5000);
    }
    private void stopFocus(){
        getSharedPreferences("pets",MODE_PRIVATE).edit().remove("focusEnd").remove("restEnd").apply();
        applyFocus(false);
    }
    private void applyFocus(boolean on){
        if(focusing==on)return;
        focusing=on;
        if(on){cancelScene();yawnQueue.clear();}
        for(Actor a:actors)if(storyFree(a)&&!a.sleeping){a.direction=0;a.until=0;a.play(idle(a),0);}
        if(!destroyed)getSystemService(NotificationManager.class).notify(7,notification());
    }
    /** 每次循环都看一下（息屏也看）：专注到点 → 叫你休息；休息到点 → 问要不要继续。 */
    private void checkFocus(){
        android.content.SharedPreferences p=getSharedPreferences("pets",MODE_PRIVATE);
        long end=p.getLong("focusEnd",0),wall=System.currentTimeMillis();
        boolean should=end>wall||SystemClock.uptimeMillis()<focusDemoUntil;
        if(focusing&&!should&&end>0){p.edit().remove("focusEnd").putLong("restEnd",wall+REST_MS).apply();applyFocus(false);focusDone(true);}
        else if(should!=focusing)applyFocus(should);
        long rest=p.getLong("restEnd",0);
        if(rest>0&&wall>=rest){p.edit().remove("restEnd").apply();tell("休息好啦～",6000);focusNotice("🍅 休息好啦","继续专注吗？点「继续专注」",true);}
    }
    private void focusDone(boolean notify){
        for(Actor a:actors)if(storyFree(a)&&!a.sleeping){a.direction=0;a.play("开心蹦蹦",3000);}
        tell(NICK+"，专注结束啦，休息一下吧",8000);
        if(notify)focusNotice("🍅 专注结束啦","休息 5 分钟吧",false);
    }
    private void focusNotice(String title,String text,boolean again){
        Notification.Builder b=new Notification.Builder(this,"pets").setSmallIcon(R.drawable.ic_pet).setColor(0xFFEFA7C0).setLargeIcon(android.graphics.drawable.Icon.createWithResource(this,R.drawable.ic_qianqian_large)).setContentTitle(title).setContentText(text).setAutoCancel(true);
        if(again)b.addAction(new Notification.Action.Builder(null,"继续专注",PendingIntent.getService(this,5,new Intent(this,PetService.class).setAction("focus-start"),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT)).build());
        getSystemService(NotificationManager.class).notify(10,b.build());
    }
    // ---- 第五批的演示（Claude） ----
    private static final List<String> FIFTH_CAST=Arrays.asList(CAT,DOG,BUNNY);
    private void festivalDemoStart(){
        if(!ensureCast(FIFTH_CAST,1.3f))return;
        String[] list={"国庆","万圣节","圣诞","春节"};
        for(int i=0;i<=list.length;i++){int k=i;show.postDelayed(()->{
            festivalDemo=k<list.length?list[k]:null;
            for(Actor a:actors)if(storyFree(a)&&!a.sleeping){a.direction=0;a.until=0;a.play(idle(a),0);}
            if(k<list.length)tell("演示：过节 · "+list[k]+"（"+(k+1)+"/"+list.length+"）",3200);
        },i*3500L);}
    }
    private void birthdayDemo(){
        if(!ensureCast(FIFTH_CAST,1.3f))return;
        long now=SystemClock.uptimeMillis();
        for(Actor a:actors)if(a.pet.clips.has("生日")){a.direction=0;a.play("生日",4000);}
        tell("演示：在设置「宠物生日」里设好，那天会过生日 🎂",5000);lastBirthdayTell=now;
    }
    private void anniversaryDemo(){
        if(!ensureCast(FIFTH_CAST,1.3f))return;
        android.content.SharedPreferences p=getSharedPreferences("pets",MODE_PRIVATE);
        long today=java.time.LocalDate.now().toEpochDay();
        celebrateTogether(CalendarRules.daysTogether(p.getLong("firstDay",today),today));
    }
    private void remindDemo(){
        if(!ensureCast(FIFTH_CAST,1.3f))return;
        remind("睡觉","演示："+NICK+"，该睡觉啦（0～5 点每 20 分钟）",4000);
        show.postDelayed(()->remind("吃饭","演示："+NICK+"，该吃饭啦（12 点、18 点左右）",4000),5000);
    }
    private void nestDemo(){
        if(!ensureCast(FIFTH_CAST,1.6f))return;
        long now=SystemClock.uptimeMillis();nestDemoUntil=now+26_000;
        updateNest(now,getSharedPreferences("pets",MODE_PRIVATE));
        tell("演示：晚上 11 点后困了就回小窝睡",5000);
        int i=0;for(Actor a:actors){Actor x=a;show.postDelayed(()->goToNest(x),300+i++*700L);}
        show.postDelayed(()->{tell("演示：早上 7 点后（或者摸一下）就出来",5000);int k=0;for(Actor a:actors){Actor x=a;show.postDelayed(()->leaveNest(x),k++*1500L);}},16_000);
    }
    private void focusDemo(){
        if(!ensureCast(Arrays.asList(CAT,G,DOG),1.3f))return;
        focusDemoUntil=SystemClock.uptimeMillis()+9000;applyFocus(true);tell("演示：🍅 专注时大家安静陪着你（g老师看书）",5000);
        show.postDelayed(()->{if(getSharedPreferences("pets",MODE_PRIVATE).getLong("focusEnd",0)>System.currentTimeMillis())return;focusDemoUntil=0;applyFocus(false);focusDone(false);},9100);
    }

    // ---- 歪手机爬墙（Claude）：往一边歪一会儿，一只伙伴走过去沿屏幕边爬到上半部分探头；不管就一直趴着，拖出来才掉下去 ----
    private void checkTilt(long now,android.content.SharedPreferences prefs){
        if(!prefs.getBoolean("climb",false)){tiltSince=0;return;}
        float tilt=motion.tilt;
        if(ClimbRules.rearm(tilt))tiltArmed=true;
        int side=ClimbRules.side(tilt);
        if(side==0||side!=tiltSide){tiltSide=side;tiltSince=side==0?0:now;return;}
        if(!tiltArmed||now-tiltSince<ClimbRules.HOLD)return;
        for(Actor a:actors)if(a.climb!=0&&a.home==0)return; // 同一时间最多一只（住在边上的不算）
        if(hugA!=null||storyKind!=null||sceneA!=null||!stack.isEmpty())return;
        for(Actor a:actors)if(a.hang!=0)return; // 挂灵动岛时不爬
        Actor best=null;
        for(Actor a:actors)if(canClimb(a)&&(best==null||Math.abs(ClimbRules.edgeX(side,width,a.pos.width)-a.x)<Math.abs(ClimbRules.edgeX(side,width,best.pos.width)-best.x)))best=a; // 离那边最近的去
        if(best==null)return;
        tiltArmed=false;startClimb(best,side);
    }
    private boolean canClimb(Actor a){return free(a)&&a.pet.clips.has(ClimbRules.climbClip(-1))&&a.pet.clips.has(ClimbRules.climbClip(1))&&a.pet.clips.has(ClimbRules.peekClip(-1))&&a.pet.clips.has(ClimbRules.peekClip(1));}
    private void startClimb(Actor a,int side){
        a.climb=1;a.climbSide=side;a.direction=0;a.until=0;a.reading=false;a.thenClip=null;a.sleeping=false;yawnQueue.remove(a);
    }
    private void climbStep(Actor a,long now,float dt){
        if(a.climb==1){ // 走到那一边
            float goal=ClimbRules.edgeX(a.climbSide,width,a.pos.width),d=goal-a.x;
            if(Math.abs(d)<1){
                a.x=goal;a.climbTo=a.home!=0?EdgeRules.clamp(a.climbTo,edgeBand()):ClimbRules.top(height);
                a.climb=2;a.play(ClimbRules.climbClip(a.climbSide),0);position(a);return;
            }
            String walk=d<0?"向左走":"向右走";if(!a.action.equals(walk))a.play(walk,0);
            a.x+=Math.signum(d)*Math.min(Math.abs(d),unit*.6f*dt);position(a);return;
        }
        a.x=ClimbRules.edgeX(a.climbSide,width,a.pos.width);
        if(a.climb==2||a.climb==4){ // 沿边往上 / 往下爬
            float step=unit*.45f*dt;
            if(a.climb==2)a.y=Math.max(a.climbTo,a.y-step);else a.y=Math.min(a.climbTo,a.y+step);
            if(Math.abs(a.y-a.climbTo)<.5f){a.y=a.climbTo;peek(a,now);}
            position(a);return;
        }
        // 3：在边上探头。歪手机爬上来的一直趴着；住在边上的时不时换位置，键盘弹出来就避开
        if(a.home==0)return;
        float[] band=edgeBand();
        float inside=EdgeRules.clamp(a.y,band);
        if(Math.abs(inside-a.y)>1){moveAlongEdge(a,inside);return;}
        if(now<a.edgeNext)return;
        if(a.edgeQuick>0)a.edgeQuick--;
        if(random.nextFloat()<EdgeRules.SWITCH){ // 换到另一边：先掉到地面，走过去再爬上去
            a.home=-a.home;a.climb=0;a.view.setTranslationX(0);startFall(a,now);return;
        }
        moveAlongEdge(a,EdgeRules.next(random.nextDouble(),band,a.y,unit));
    }
    private float[] edgeBand(){return EdgeRules.band(height,keyboardFloor,unit);}
    private void moveAlongEdge(Actor a,float to){
        a.climbTo=to;boolean up=to<a.y;a.climb=up?2:4;
        a.play(EdgeRules.moveClip(a.climbSide,up,a.pet.clips.has(EdgeRules.moveClip(a.climbSide,false,true))),0);
    }
    private void peek(Actor a,long now){
        a.climb=3;a.play(ClimbRules.peekClip(a.climbSide),0);
        a.edgeNext=now+(a.edgeQuick>0?5000:EdgeRules.WANDER_MIN+random.nextInt((int)EdgeRules.WANDER_SPAN));
    }
    /** 摸它：缩到屏幕外，再从头探出来。 */
    private void retract(Actor a){
        a.view.animate().cancel();
        a.view.animate().translationX(a.climbSide*a.pos.width*.7f).setStartDelay(0).setDuration(220).withEndAction(()->{
            a.view.restart();a.view.animate().translationX(0).setStartDelay(450).setDuration(260).start();
        }).start();
        a.edgeNext=Math.max(a.edgeNext,SystemClock.uptimeMillis()+4000);
    }
    /** 住在边上的被拖动松手：贴着左 / 右边就住到那边的这个高度；拖到中间就落回地面，变回住在地面。 */
    private boolean edgeDrop(Actor a,long now){
        int side=EdgeRules.dropSide(a.x+a.pos.width/2f,width,unit);
        if(side!=0&&a.y<a.floor()-unit*.3f){
            a.home=side;a.climbSide=side;a.falling=false;a.x=ClimbRules.edgeX(side,width,a.pos.width);
            float to=EdgeRules.clamp(a.y,edgeBand());
            if(Math.abs(to-a.y)>1){a.climbTo=to;moveAlongEdge(a,to);}else{a.y=to;peek(a,now);}
            position(a);return true;
        }
        a.home=0;a.edgeQuick=0;
        android.content.SharedPreferences p=getSharedPreferences("pets",MODE_PRIVATE);
        Set<String> homes=new HashSet<>(p.getStringSet("edgePets",new HashSet<>()));
        if(homes.remove(a.pet.name))p.edit().putStringSet("edgePets",homes).apply(); // 拖回地面就变回住在地面
        return false;
    }
    /** 设置里选了「住在屏幕边」的伙伴：出来时走到离得近的那边爬上去。 */
    private void settleHome(Actor a,int side){
        if(!a.pet.clips.has(ClimbRules.peekClip(-1))||!a.pet.clips.has(ClimbRules.peekClip(1))||!a.pet.clips.has(ClimbRules.climbClip(-1))||!a.pet.clips.has(ClimbRules.climbClip(1)))return; // 没有爬边动画就照常住地面
        a.home=side!=0?side:(a.x+a.pos.width/2f<width/2f?-1:1);a.climbSide=a.home;a.climb=1;
        float[] band=edgeBand();a.climbTo=EdgeRules.next(random.nextDouble(),band,-unit*10,unit);
        a.direction=0;a.until=0;a.sleeping=false;a.reading=false;a.thenClip=null;
    }
    /** 演示：住到左边 / 右边（只是这次，不改设置），前几次换位置快一点。 */
    private void edgeDemo(int side){
        Actor pick=null;
        for(Actor a:actors)if(a.home==side){pick=a;break;}
        if(pick==null)for(Actor a:actors)if(a.climb==0||a.home!=0){freeForScene(a);a.home=0;a.climb=0;if(a.pet.clips.has(ClimbRules.peekClip(side))){pick=a;break;}}
        if(pick==null){Toast.makeText(this,"出来的伙伴还没有住边上的动画",Toast.LENGTH_SHORT).show();return;}
        settleHome(pick,side);pick.edgeQuick=3;
        tell("演示：住在"+(side<0?"左":"右")+"边，时不时爬到别的高度，偶尔换到另一边；摸它会缩回去再探出来",7000);
    }
    /** 演示：第一只能爬的伙伴马上去爬这一边（已经有在爬的先让它掉下来）。 */
    private void climbDemo(int side){
        long now=SystemClock.uptimeMillis();
        for(Actor a:actors)if(a.climb!=0&&a.home==0){a.climb=0;startFall(a,now);}
        Actor pick=null;
        for(Actor a:actors){if(a.climb==0&&a.home==0&&a.pet.clips.has(ClimbRules.climbClip(side))){freeForScene(a);if(canClimb(a)){pick=a;break;}}}
        if(pick==null){Toast.makeText(this,"出来的伙伴还没有爬墙动画",Toast.LENGTH_SHORT).show();return;}
        tell("演示：手机往"+(side<0?"左":"右")+"歪一会儿，伙伴就去爬"+(side<0?"左":"右")+"边；拖出来才下来",6000);
        startClimb(pick,side);
    }

    // ---- 灵动岛滚动歌词（Claude） ----
    /** 现在这句歌词（带 ♫ / Ⅱ）；读不到、纯音乐、第一句还没开始都返回空，照旧显示歌名。 */
    private String currentLyric(){
        if(media.title.isEmpty())return "";
        long t=SystemClock.elapsedRealtime();
        if(!media.title.equals(lyricTitle)){lyricTitle=media.title;lyricTitleAt=t;} // 切歌：旧的状态栏歌词作废
        String prefix=media.playing?"♫ ":"Ⅱ ";
        // 路线一：音乐 App 的状态栏歌词（这首歌开始以后发来的才算）
        if(media.pkg.equals(DeliveryCompanion.tickerPkg)&&!DeliveryCompanion.tickerLyric.isEmpty()&&DeliveryCompanion.tickerAt>=lyricTitleAt-1500)return prefix+DeliveryCompanion.tickerLyric;
        // 路线二：按歌名、歌手查带时间轴的歌词，按播放进度找这句
        LyricFetcher.Song song=lyrics.get(media.title,media.artist,media.duration);
        if(song==null||song.lines.isEmpty())return "";
        int i=LyricRules.index(song.lines,media.now());
        return i<0?"":prefix+song.lines.get(i).text;
    }
    /** 歌词用跑马灯：放不下的长句子慢慢滚过去；别的提示还是放不下就省略号。 */
    private void lyricMode(boolean on){
        if(island==null||on==islandLyricMode)return;
        islandLyricMode=on;
        if(on){island.setEllipsize(android.text.TextUtils.TruncateAt.MARQUEE);island.setMarqueeRepeatLimit(-1);island.setHorizontallyScrolling(true);island.setSelected(true);}
        else{stopSlide();island.setSelected(false);island.setEllipsize(android.text.TextUtils.TruncateAt.END);}
    }
    /** 换句时：旧的一句往上滑走、淡出，新的一句从下面滑上来、淡入（只动文字，背景不动）。 */
    private void slideIsland(String next){
        stopSlide();
        android.widget.TextView view=island;int half=Math.max(1,view.getHeight()/2);
        android.animation.ValueAnimator out=android.animation.ValueAnimator.ofFloat(0,1);out.setDuration(160);
        out.addUpdateListener(v->{float f=(float)v.getAnimatedValue();view.scrollTo(view.getScrollX(),Math.round(half*f));view.setTextColor(android.graphics.Color.argb(Math.round(255*(1-f)),255,255,255));});
        out.addListener(new android.animation.AnimatorListenerAdapter(){boolean cancelled;
            @Override public void onAnimationCancel(android.animation.Animator a){cancelled=true;}
            @Override public void onAnimationEnd(android.animation.Animator a){
                if(cancelled||island!=view)return;
                view.setText(next);
                android.animation.ValueAnimator in=android.animation.ValueAnimator.ofFloat(1,0);in.setDuration(220);
                in.addUpdateListener(v->{float f=(float)v.getAnimatedValue();view.scrollTo(view.getScrollX(),-Math.round(half*f));view.setTextColor(android.graphics.Color.argb(Math.round(255*(1-f)),255,255,255));});
                islandSlide=in;in.start();
            }});
        islandSlide=out;out.start();
    }
    private void stopSlide(){
        boolean running=islandSlide!=null;
        if(running){islandSlide.cancel();islandSlide=null;}
        if(island!=null&&running){island.scrollTo(island.getScrollX(),0);island.setTextColor(android.graphics.Color.WHITE);}
    }
    /** 演示用的假歌词（自己写的），按时间一句一句换，有一句特别长用来看跑马灯。 */
    private static final long[] DEMO_TIMES={0,2600,5200,7800,15800,18400};
    private static final String[] DEMO_LINES={"演示：灵动岛滚动歌词","小猫在屏幕边上探头","尾巴轻轻扫过通知栏","这一句特别特别长，长到灵动岛放不下，所以会像跑马灯一样慢慢地滚过去","哥哥狗狗跟着轻轻哼","（演示结束）"};
    private String demoLyric(long now){
        long t=now-lyricDemoStart;int i=0;
        for(int k=0;k<DEMO_TIMES.length;k++)if(DEMO_TIMES[k]<=t)i=k;
        return "♫ "+DEMO_LINES[i];
    }
    private void lyricDemo(){
        lyricDemoStart=SystemClock.uptimeMillis();lyricDemoUntil=lyricDemoStart+21000;islandDismissed=0;
    }
}

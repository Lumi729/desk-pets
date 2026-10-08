package com.lumi.deskpets;
import java.util.Map;
public final class AppCompanionTest {
    static void equal(Object actual,Object expected){if(!java.util.Objects.equals(actual,expected))throw new AssertionError(actual+" != "+expected);}
    public static void main(String[] args){
        long checked=1_800_000_000_000L;
        equal(UpdateRules.due(false,checked,0),false);
        equal(UpdateRules.due(true,checked,0),true); // old swallowed failure must not keep the 12h lock
        long failedNext=UpdateRules.nextCheck(checked,false,0),successNext=UpdateRules.nextCheck(checked,true,0);
        equal(failedNext,checked+15*60_000L);equal(successNext,checked+12*3600_000L);
        equal(UpdateRules.due(true,failedNext-1,failedNext),false);
        equal(UpdateRules.due(true,failedNext,failedNext),true);
        equal(UpdateRules.due(true,failedNext,successNext),false);
        equal(UpdateRules.due(true,successNext,successNext),true);
        equal(UpdateRules.nextCheck(checked,false,checked+3600_000L),checked+3600_000L);
        equal(UpdateRules.due(true,checked,checked+48*3600_000L),true); // recover after clock correction
        equal(UpdateRules.newer("android-v0.13-preview","0.12-preview"),true);
        equal(UpdateRules.newer("android-v0.14-preview","0.13-preview"),true);
        // Typing blocks both starting and continuing a hang, even with a notice/media/demo.
        for(boolean enabled:new boolean[]{false,true})for(boolean media:new boolean[]{false,true})
            for(long demoEnd:new long[]{0,999,1000,9000})
                equal(IslandHang.allowed(enabled,1000,demoEnd,"type",media),false);
        equal(IslandHang.allowed(false,1000,9000,"none",false),true);
        equal(IslandHang.allowed(false,9000,9000,"none",false),false); // demo expires exactly on time
        equal(IslandHang.allowed(false,10000,9000,"none",false),false); // stale demo cannot enable hanging
        equal(IslandHang.allowed(true,1000,0,"none",false),true); // normal notification
        equal(IslandHang.allowed(true,1000,0,"none",true),false);
        for(String mode:new String[]{"video","music"}){
            equal(IslandHang.allowed(true,1000,0,mode,false),false);
            equal(IslandHang.allowed(false,1000,9000,mode,false),true); // explicit demo remains available
            equal(IslandHang.allowed(true,9000,9000,mode,false),false);
        }
        String liveTyping=AppCompanion.live(true,"notes.any",Map.of(),"none",1000,999);
        equal(AppCompanion.clip(liveTyping),"敲代码");
        equal(IslandHang.allowed(true,1000,9000,liveTyping,false),false);
        equal(IslandHang.percent(0),60);equal(IslandHang.percent(1000),140);
        equal(IslandHang.width(3,100,1080),810);equal(IslandHang.width(3,140,500),500);
        equal(IslandHang.scaledBlock(3,60,1920)<IslandHang.scaledBlock(3,100,1920),true);
        equal(IslandHang.height(IslandHang.scaledBlock(4,140,70))<=70,true);
        equal(IslandHang.position(.5f,1080,810,0),135);
        equal(IslandHang.position(-1,1920,140,36),36);
        equal(IslandHang.position(Float.NaN,1920,140,36),36);
        equal(IslandHang.position(2,1920,140,36),1780);
        equal(IslandHang.limit(-50,1080,810),0);equal(IslandHang.limit(5000,1080,810),270);
        equal(IslandHang.fraction(300,300,300),0f);
        for(int screen:new int[]{320,1080,1920})for(int percent:new int[]{60,100,140})for(float fraction:new float[]{0,.25f,.5f,1}){
            int size=IslandHang.width(3,percent,screen),pos=IslandHang.position(fraction,screen,size,0);
            equal(pos>=0&&pos+size<=screen,true);
            float saved=IslandHang.fraction(pos,screen,size);
            equal(IslandHang.position(saved,screen,size,0),pos);
            int rotatedSize=IslandHang.width(3,percent,720),rotated=IslandHang.position(saved,720,rotatedSize,0);
            equal(rotated>=0&&rotated+rotatedSize<=720,true);
        }
        equal(IslandHang.dragged(3,4,8),false);equal(IslandHang.dragged(0,9,8),true);
        equal(IslandHang.dragged(-9,0,8),true);

        Perch upper=new Perch(80,300,230),lower=new Perch(80,500,230),side=new Perch(250,200,390);
        java.util.List<Perch> platforms=java.util.List.of(lower,side,upper);
        equal(Perch.catchFall(platforms,100,100,450,100,700),upper);
        equal(Perch.catchFall(platforms,100,201,450,100,700),lower);
        equal(Perch.catchFall(platforms,100,200,450,100,700),lower);
        equal(Perch.catchFall(platforms,0,100,450,100,700)==null,true);
        equal(Perch.catchFall(platforms,100,450,460,100,700)==null,true);

        equal(DeliveryRules.supported("com.tencent.mobileqq"),false);
        equal(DeliveryRules.supported("me.ele"),true);
        for(String text:new String[]{"预计12点送达","还有5分钟送达","订单尚未送达","您的红包已送达","骑手已到吗？","优惠已送达"}) equal(DeliveryRules.hint(text),"");
        equal(DeliveryRules.hint("订单已送达，请查看取餐码").isEmpty(),false);
        equal(DeliveryRules.hint("骑手已到，请取餐").isEmpty(),false);
        for(int span:new int[]{40,80,100,110}) equal(new Perch(100,300,100+span).canWalk(100,400),false);
        equal(new Perch(100,300,300).canWalk(100,400),true);
        equal(new Perch(-20,300,90).canWalk(100,400),false);
        equal(new Perch(100,300,160).walkLeft(100,400),new Perch(100,300,160).walkRight(100,400));
        equal(AppCompanion.mode("com.tencent.mm",Map.of()),"type");
        equal(AppCompanion.mode("com.google.android.youtube",Map.of()),"video");
        equal(AppCompanion.mode("com.spotify.music",Map.of()),"music");
        equal(AppCompanion.mode("com.android.chrome",Map.of()),"none");
        equal(AppCompanion.mode("com.android.chrome",Map.of("app:com.android.chrome","type")),"type");
        equal(AppCompanion.mode("com.spotify.music",Map.of("app:com.spotify.music","none")),"none");
        equal(AppCompanion.mode("unknown.app",Map.of("app:unknown.app","untrusted")),"none");
        AppCompanion.Foreground f=new AppCompanion.Foreground();
        f.accept(1,"video",100);f.accept(1,"chat",110);f.accept(2,"video",111);equal(f.pkg,"chat");
        f.accept(1,"stale",99);equal(f.pkg,"chat");f.accept(2,"chat",112);equal(f.pkg,"");
        f.accept(1,"video",120);f.accept(15,null,130);equal(f.pkg,"");
        f.accept(1,"video",140);f.accept(17,null,150);equal(f.pkg,"");
        f.clear();equal(f.time,0L);
        equal(AppCompanion.clip("none"),"");equal(AppCompanion.clip("type"),"敲代码");
        equal(AppCompanion.active("type",1000,0),"none");
        equal(AppCompanion.active("type",1000,999),"type");
        equal(AppCompanion.active("type",2600,1000),"none");
        equal(AppCompanion.active("video",1000,0),"video");
        equal(AppCompanion.active("none",1000,999),"none");
        for(String pkg:java.util.List.of("com.android.chrome","notes.any","search.any","com.tencent.mobileqq","com.spotify.music")){
            equal(AppCompanion.live(true,pkg,Map.of(),"none",1000,999),"type");
            equal(AppCompanion.live(false,pkg,Map.of(),"none",1000,999),"none");
            equal(AppCompanion.live(true,pkg,Map.of("app:"+pkg,"none"),"none",1000,999),"none");
        }
        equal(AppCompanion.live(true,"notes.any",Map.of(),"none",3000,999),"none");
        equal(AppCompanion.live(true,"com.spotify.music",Map.of(),"none",3000,999),"music");
        equal(AppCompanion.live(true,"",Map.of(),"type",1000,999),"none");
        // Input received during a fall remains available after the landing pause;
        // stale input never starts a fresh typing loop after landing.
        equal(AppCompanion.live(true,"notes.any",Map.of(),"none",2400,2300),"type");
        equal(AppCompanion.live(true,"notes.any",Map.of(),"none",2400,700),"none");
        Perch first=new Perch(20,180,170),second=new Perch(100,300,280),narrow=new Perch(20,200,30);
        equal(Perch.below(java.util.List.of(second,narrow,first),null,100,400),first);
        equal(Perch.below(java.util.List.of(second,narrow,first),first,100,400),second);
        if(Perch.below(java.util.List.of(first,second),second,100,400)!=null)throw new AssertionError("End of stairs must return to floor");
        if(first.fits(100,70))throw new AssertionError("Below keyboard edge");
        if(new Perch(0,80,200).fits(100,400))throw new AssertionError("No headroom");
        equal(new Perch(-40,200,70).x(100,400),0f);
        equal(new Perch(390,200,500).x(100,400),300f);
        equal(Perch.typing(1000,1100),false);
        equal(SurfaceRules.kind("android.widget.TextView","",true,false,false,10,120,30,360),SurfaceRules.CONTENT);
        equal(SurfaceRules.kind("android.widget.TextView","",true,false,false,150,60,25,360),SurfaceRules.NONE);
        equal(SurfaceRules.kind("android.widget.ImageView","",true,false,false,10,240,100,360),SurfaceRules.CARD);
        equal(SurfaceRules.kind("android.widget.ImageView","",true,false,false,10,48,48,360),SurfaceRules.NONE);
        equal(SurfaceRules.kind("android.widget.EditText","",false,true,false,10,300,40,360),SurfaceRules.CONTROL);
        equal(SurfaceRules.kind("android.widget.Button","",false,false,true,10,100,40,360),SurfaceRules.CONTROL);
        equal(SurfaceRules.kind("android.widget.FrameLayout","",true,false,false,0,360,640,360),SurfaceRules.NONE);
        equal(SurfaceRules.kind("android.view.View","",false,false,false,10,240,100,360),SurfaceRules.NONE);
        // 灵动岛（Claude）：整像素放大保持清晰，宠物居中挂在提示条下面、GIF 顶边压住提示条底边一点
        equal(IslandHang.block(3f),19);equal(IslandHang.height(19),133);equal(IslandHang.cap(19),76);
        equal(IslandHang.block(1f),6);equal(IslandHang.block(.1f),1);
        equal(IslandHang.x(100,300,100,1080),200f);
        equal(IslandHang.x(-50,100,100,1080),0f);
        equal(IslandHang.x(1000,300,100,1080),980f);
        equal(IslandHang.y(180,40f,10),130f);
        equal(IslandHang.y(20,40f,10),0f);
        // 检查更新（Claude）：只认更高的安卓版本，只接受本仓库安卓发布页的 APK
        equal(UpdateRules.newer("android-v0.5-preview","0.4-preview"),true);
        equal(UpdateRules.newer("android-v0.4-preview","0.4-preview"),false);
        equal(UpdateRules.newer("android-v0.10-preview","0.9-preview"),true);
        equal(UpdateRules.newer("android-v1.0-preview","0.12-preview"),true);
        equal(UpdateRules.newer("android-v0.3-preview","0.4-preview"),false);
        equal(UpdateRules.newer("v1.0.34","0.4-preview"),false);
        equal(UpdateRules.newer("android-vbad","0.4-preview"),false);
        equal(UpdateRules.trustedApk("https://github.com/Lumi729/desk-pets/releases/download/android-v0.5-preview/lijianxue-android-0.5-preview.apk"),true);
        equal(UpdateRules.trustedApk("https://example.com/releases/download/android-v0.5-preview/x.apk"),false);
        equal(UpdateRules.trustedApk("https://github.com/Lumi729/desk-pets/releases/download/v1.0.34/desk-pets-setup-1.0.34.exe"),false);
        // 天气与四季（Claude）：和电脑版 lib/weather.js 同样的规则
        equal(Weather.idle(0,20,12),"待机_晴天");equal(Weather.idle(1,20,6),"待机_晴天");equal(Weather.idle(1,20,19),"待机_晴夜");equal(Weather.idle(0,20,3),"待机_晴夜");
        equal(Weather.idle(2,20,12),"待机_多云");equal(Weather.idle(3,20,12),"待机_阴天");
        for(int c:new int[]{45,48})equal(Weather.idle(c,20,12),"待机_雾");
        for(int c:new int[]{51,53,55,56,57})equal(Weather.idle(c,20,12),"待机_毛毛雨");
        for(int c:new int[]{61,80})equal(Weather.idle(c,20,12),"待机_雨天");
        for(int c:new int[]{63,65,66,67,81,82})equal(Weather.idle(c,20,12),"待机_大雨");
        for(int c:new int[]{71,73,75,77,85,86})equal(Weather.idle(c,20,12),"待机_下雪");
        for(int c:new int[]{95,96,99})equal(Weather.idle(c,20,12),"待机_雷雨");
        for(int c:new int[]{0,1,2,3,45,48,71})equal(Weather.isRain(c),false);
        for(int c:new int[]{51,57,61,67,80,82,95,99})equal(Weather.isRain(c),true);
        equal(Weather.idle(0,5,12),"待机_降温");equal(Weather.idle(3,9.9,12),"待机_降温");equal(Weather.idle(2,33,12),"待机_炎热");equal(Weather.idle(0,32,12),"待机_晴天");
        equal(Weather.idle(61,5,12),"待机_雨天");equal(Weather.idle(71,-3,12),"待机_下雪");equal(Weather.idle(95,35,12),"待机_雷雨");
        equal(Weather.idle(-1,5,12)==null,true);equal(Weather.idle(42,20,12)==null,true);equal(Weather.idle(0,Double.NaN,12),"待机_晴天");
        equal(Weather.season(3),"待机_春");equal(Weather.season(5),"待机_春");equal(Weather.season(6),"待机_夏");equal(Weather.season(8),"待机_夏");
        equal(Weather.season(9),"待机_秋");equal(Weather.season(11),"待机_秋");equal(Weather.season(12),"待机_冬");equal(Weather.season(1),"待机_冬");equal(Weather.season(2),"待机_冬");
        java.util.function.Predicate<String> all=n->true,none=n->false,noAutumn=n->!n.equals("待机_秋");
        equal(Weather.pick("待机_雨天","待机_秋",all),"待机_雨天");   // 特殊天气 > 季节
        equal(Weather.pick("待机_晴天","待机_秋",all),"待机_秋");     // 季节 > 其它天气
        equal(Weather.pick("待机_晴天","待机_秋",noAutumn),"待机_晴天");// 没有季节动画就用其它天气
        equal(Weather.pick(null,null,all),"待机");equal(Weather.pick("待机_雨天","待机_秋",none),"待机");
        equal(Weather.label("待机_毛毛雨"),"毛毛雨");equal(Weather.ALL.length,16);
        // 外卖通知检查（Claude）：字段排成几行，空的写「（没有）」
        String shown=DeliveryRules.inspect("美团外卖","com.sankuai.meituan.takeoutnew","12:00:00","order","progress",true,"骑手正在送餐","距你800米",null," ",3,10,false,"android.title, android.text");
        equal(shown.contains("包名：com.sankuai.meituan.takeoutnew"),true);equal(shown.contains("channel：order"),true);equal(shown.contains("category：progress"),true);
        equal(shown.contains("标题：骑手正在送餐"),true);equal(shown.contains("正文：距你800米"),true);equal(shown.contains("子文本：（没有）"),true);
        equal(shown.contains("大文本：（没有）"),true);equal(shown.contains("常驻：是"),true);equal(shown.contains("进度条：有进度条 3 / 10"),true);
        equal(shown.contains("extras 键名：android.title, android.text"),true);
        equal(DeliveryRules.inspect("饿了么","me.ele","12:00:01",null,null,false,null,null,null,null,0,0,true,"").contains("不确定进度"),true);
        equal(DeliveryRules.inspect("饿了么","me.ele","12:00:01",null,null,false,null,null,null,null,0,0,false,null).contains("进度条：（没有）"),true);
        // 外卖进度（Claude）：千千真机上美团外卖的常驻通知
        equal(DeliveryRules.looksLike("预计10月8日 00:11送达","商家正在备餐，骑手正赶往商家"),true);
        equal(DeliveryRules.looksLike("小明","晚上一起吃饭吗"),false);equal(DeliveryRules.looksLike(null,null),false);
        equal(DeliveryRules.etaMinute("预计10月8日 00:11送达"),11);equal(DeliveryRules.etaMinute("预计 18:45 送达"),18*60+45);
        equal(DeliveryRules.etaMinute("预计今天 12：05前送达"),12*60+5);equal(DeliveryRules.etaMinute("骑手正赶往商家"),-1);equal(DeliveryRules.etaMinute(null),-1);
        equal(DeliveryRules.minutesLeft(11,23*60+50),21);equal(DeliveryRules.minutesLeft(12*60,11*60+30),30);equal(DeliveryRules.minutesLeft(12*60,12*60+5),-5);
        equal(DeliveryRules.status("商家正在备餐，骑手正赶往商家"),"骑手正赶往商家");equal(DeliveryRules.status(null),"");
        equal(DeliveryRules.label("预计10月8日 00:11送达","商家正在备餐，骑手正赶往商家",23*60+50),"🛵 还有 21 分钟 · 骑手正赶往商家");
        equal(DeliveryRules.label("预计 12:00送达","骑手正在送餐，距你1.2公里",11*60+52),"🛵 还有 8 分钟 · 1.2公里 · 骑手正在送餐");
        equal(DeliveryRules.label("预计 12:00送达","骑手正在送餐",12*60+3),"🛵 预计 12:00 送达 · 骑手正在送餐");
        equal(DeliveryRules.label("订单已送达","预计 12:00送达",11*60),"");equal(DeliveryRules.label("骑手正赶往商家","商家正在备餐",11*60),"");
        equal(DeliveryRules.distance("骑手距您 800 米"),"800米");equal(DeliveryRules.distance("还有 5 分钟"),"");
        // 过节、生日、纪念日、提醒、小窝（Claude）：和 lib/calendar.js、lib/diary.js 一样
        equal(CalendarRules.festival(10,1,8,20,8,21),"国庆");equal(CalendarRules.festival(10,7,8,26,8,27),"国庆");equal(CalendarRules.festival(10,8,8,27,8,28),null);
        equal(CalendarRules.festival(10,31,9,20,9,21),"万圣节");equal(CalendarRules.festival(12,24,11,4,11,5),"圣诞");equal(CalendarRules.festival(12,25,11,5,11,6),"圣诞");
        equal(CalendarRules.festival(2,17,1,1,1,2),"春节");equal(CalendarRules.festival(2,23,1,7,1,8),"春节");equal(CalendarRules.festival(2,24,1,8,1,9),null);
        equal(CalendarRules.festival(2,16,12,30,1,1),"春节");equal(CalendarRules.festival(3,1,0,3,0,4),null); // 除夕；闰月不算正月
        equal(CalendarRules.normalizeBirthday("3/14"),"03-14");equal(CalendarRules.normalizeBirthday("3月14日"),"03-14");equal(CalendarRules.normalizeBirthday(" 12-01 "),"12-01");
        equal(CalendarRules.normalizeBirthday("13-01"),"");equal(CalendarRules.normalizeBirthday("生日"),"");equal(CalendarRules.normalizeBirthday(null),"");
        equal(CalendarRules.daysTogether(100,100),1L);equal(CalendarRules.daysTogether(100,106),7L);
        for(long n:new long[]{7,30,100,200,365,730})equal(CalendarRules.isAnniversary(n),true);
        for(long n:new long[]{1,8,99,364,366,500})equal(CalendarRules.isAnniversary(n),false);
        equal(CalendarRules.nagNight(0),true);equal(CalendarRules.nagNight(4),true);equal(CalendarRules.nagNight(5),false);equal(CalendarRules.nagNight(23),false);
        equal(CalendarRules.meal(11*60+49),-1);equal(CalendarRules.meal(12*60),0);equal(CalendarRules.meal(12*60+30),0);equal(CalendarRules.meal(18*60),1);equal(CalendarRules.meal(15*60),-1);
        equal(CalendarRules.night(23),true);equal(CalendarRules.night(6),true);equal(CalendarRules.night(7),false);equal(CalendarRules.night(22),false);
        equal(CalendarRules.nestOffset(0,1,100,300),0f);equal(CalendarRules.nestOffset(0,3,100,300),-42f);equal(CalendarRules.nestOffset(2,3,100,300),42f);
        // 挑衅（Claude）：和 teases.js 的 replyFor 一样，10 分钟里第 4 次就投降
        java.util.Map<String,java.util.List<String>> replies=new java.util.LinkedHashMap<>();
        replies.put("就这",java.util.List.of("委屈"));replies.put("来打我呀",java.util.List.of("跺脚","@chase"));
        long min=60_000;
        equal(TeaseRules.reply(replies,"晃小鱼",java.util.List.of(),0,600_000,3)==null,true);
        equal(TeaseRules.reply(replies,"来打我呀",java.util.List.of(),0,600_000,3),java.util.List.of("跺脚","@chase"));
        equal(TeaseRules.reply(replies,"就这",java.util.List.of(1*min,2*min),3*min,600_000,3),java.util.List.of("委屈"));
        equal(TeaseRules.reply(replies,"就这",java.util.List.of(1*min,2*min,3*min),4*min,600_000,3),java.util.List.of("投降"));
        equal(TeaseRules.reply(replies,"就这",java.util.List.of(1*min,2*min,3*min),12*min,600_000,3),java.util.List.of("委屈"));
        System.out.println("App classification, overrides, stale events, switch ordering and screen reset passed");
    }
}

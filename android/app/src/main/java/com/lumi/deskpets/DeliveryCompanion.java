package com.lumi.deskpets;
import android.app.Notification;
import android.os.SystemClock;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import java.util.LinkedHashMap;

/** Opt-in: no uploads, notification actions or storage; everything read stays in memory only. */
public final class DeliveryCompanion extends NotificationListenerService {
    static volatile String hint="";
    static volatile long hintAt;
    static volatile String notice="";
    static volatile long noticeAt;
    // 点提示条时打开这条通知（只在内存里，不保存）
    static volatile android.app.PendingIntent noticeIntent,hintIntent;
    static volatile String noticePkg="",hintPkg="";
    private final LinkedHashMap<String,Long> seen=new LinkedHashMap<>();
    // ---- 外卖通知检查（Claude）：测试菜单里打开时，把可能是外卖的通知能读到的字段临时显示在屏幕上 ----
    // 白名单包名的通知，或标题 / 正文里有「送达、骑手、取餐、配送、商家」的通知都列出来（方便确认真实包名）。
    // 只在内存里留最近 6 条，关掉工具就清空；不保存、不上传、不写日志。
    static volatile boolean inspecting;
    static final LinkedHashMap<String,String> inspected=new LinkedHashMap<>();
    static volatile long inspectedAt;
    /** 上次读通知栏一共看了几条（-1 是还没读过）。 */
    static volatile int scannedTotal=-1;
    private static volatile DeliveryCompanion current;
    // ---- 外卖进度（Claude）：正在进行的那条外卖通知（只在内存里，通知消失或送达就清掉） ----
    static final class Live{final String key,pkg;final CharSequence title,text;final android.app.PendingIntent intent;
        Live(String key,String pkg,CharSequence title,CharSequence text,android.app.PendingIntent intent){this.key=key;this.pkg=pkg;this.title=title;this.text=text;this.intent=intent;}}
    static volatile Live live;
    /** 灵动岛上的那一行（now 是当天第几分钟）；没有就空。 */
    static String liveLabel(int now){Live l=live;return l==null?"":DeliveryRules.label(l.title,l.text,now);}
    @Override public void onListenerConnected(){current=this;if(inspecting)scanActive();if(getSharedPreferences("pets",MODE_PRIVATE).getBoolean("delivery",false))refreshLive();}
    static boolean connected(){return current!=null;}
    /** 打开工具或点「刷新」时，把已经在通知栏里的通知读一遍。 */
    static void scanActive(){
        DeliveryCompanion c=current;if(c==null)return;
        synchronized(inspected){inspected.clear();}
        int total=0;
        try{StatusBarNotification[] all=c.getActiveNotifications();if(all!=null){total=all.length;for(StatusBarNotification sbn:all)c.inspect(sbn,false);}}catch(RuntimeException ignored){}
        scannedTotal=total;inspectedAt=SystemClock.elapsedRealtime();
    }
    /** 外卖提示开着时（约每分钟一次）重新找正在进行的外卖通知，漏掉的更新 / 消失也能跟上。 */
    static void refreshLive(){
        DeliveryCompanion c=current;if(c==null){live=null;return;}
        Live found=null;
        try{StatusBarNotification[] all=c.getActiveNotifications();if(all!=null)for(StatusBarNotification sbn:all){found=liveFrom(sbn);if(found!=null)break;}}catch(RuntimeException ignored){}
        live=found;
    }
    private static CharSequence text(android.os.Bundle e){CharSequence t=e.getCharSequence(Notification.EXTRA_TEXT);return t!=null?t:e.getCharSequence(Notification.EXTRA_BIG_TEXT);}
    /** 这条是正在进行、读得到预计送达时间的外卖通知吗？ */
    private static Live liveFrom(StatusBarNotification sbn){
        if(sbn==null)return null;
        try{
            Notification n=sbn.getNotification();if(n==null||n.extras==null)return null;
            CharSequence title=n.extras.getCharSequence(Notification.EXTRA_TITLE),body=text(n.extras);
            if(!DeliveryRules.supported(sbn.getPackageName())&&!DeliveryRules.looksLike(title,body))return null;
            if(DeliveryRules.done(title,body))return null;
            if(DeliveryRules.etaMinute(title)<0&&DeliveryRules.etaMinute(body)<0)return null;
            return new Live(sbn.getKey(),sbn.getPackageName(),title,body,n.contentIntent);
        }catch(RuntimeException e){return null;}
    }
    static void stopInspect(){inspecting=false;synchronized(inspected){inspected.clear();}scannedTotal=-1;inspectedAt=SystemClock.elapsedRealtime();}
    private void inspect(StatusBarNotification sbn,boolean removed){
        if(!inspecting||sbn==null)return;
        try{
            Notification n=sbn.getNotification();android.os.Bundle e=n==null||n.extras==null?new android.os.Bundle():n.extras;
            CharSequence title=e.getCharSequence(Notification.EXTRA_TITLE),body=e.getCharSequence(Notification.EXTRA_TEXT),sub=e.getCharSequence(Notification.EXTRA_SUB_TEXT),big=e.getCharSequence(Notification.EXTRA_BIG_TEXT);
            String pkg=sbn.getPackageName();
            boolean music=LyricRules.musicApp(pkg)||e.containsKey(Notification.EXTRA_MEDIA_SESSION); // 音乐 App 的通知也列出来，看看状态栏歌词在哪
            if(!music&&!DeliveryRules.supported(pkg)&&!DeliveryRules.looksLike(title,body,sub,big)){
                boolean listed;synchronized(inspected){listed=inspected.containsKey(sbn.getKey());}
                if(!(removed&&listed))return; // 别的通知不看；只跟进已经列出来的那条消失
            }
            String app=pkg;try{app=getPackageManager().getApplicationLabel(getPackageManager().getApplicationInfo(pkg,0)).toString();}catch(android.content.pm.PackageManager.NameNotFoundException ignored){}
            String time=new java.text.SimpleDateFormat("HH:mm:ss",java.util.Locale.ROOT).format(new java.util.Date());
            String shown;
            if(removed)shown="【"+app+" · "+time+"】\n包名："+pkg+"\n这条通知消失了";
            else{
                java.util.List<String> keys=new java.util.ArrayList<>(e.keySet());java.util.Collections.sort(keys);
                shown=DeliveryRules.inspect(app,pkg,time,n.getChannelId(),n.category,sbn.isOngoing(),title,body,sub,big,
                    e.getInt(Notification.EXTRA_PROGRESS,0),e.getInt(Notification.EXTRA_PROGRESS_MAX,0),e.getBoolean(Notification.EXTRA_PROGRESS_INDETERMINATE,false),String.join(", ",keys));
                shown+="\nticker："+(n.tickerText==null||n.tickerText.toString().trim().isEmpty()?"（没有）":n.tickerText.toString().trim())+"\nextras 内容："+extrasValues(e,keys);
                if(music){String lyric=lyricFrom(n,e);shown+="\n状态栏歌词："+(lyric.isEmpty()?"（读不到，会改用按歌名查的歌词）":lyric);}
                else{String island=DeliveryRules.label(title,text(e),nowMinute());
                shown+="\n灵动岛会显示："+(island.isEmpty()?"（读不到预计送达时间，不显示）":island);}
            }
            synchronized(inspected){inspected.remove(sbn.getKey());inspected.put(sbn.getKey(),shown);while(inspected.size()>8)inspected.remove(inspected.keySet().iterator().next());}
            inspectedAt=SystemClock.elapsedRealtime();
        }catch(RuntimeException ignored){}
    }
    /** extras 里能直接看的值（文字、数字、真假），每个最多 60 个字；图片之类只写类型。 */
    private static String extrasValues(android.os.Bundle e,java.util.List<String> keys){
        StringBuilder b=new StringBuilder();
        for(String k:keys){Object v;try{v=e.get(k);}catch(RuntimeException x){continue;}
            String shown=v==null?"null":(v instanceof CharSequence||v instanceof Number||v instanceof Boolean)?v.toString():"〈"+v.getClass().getSimpleName()+"〉";
            if(shown.length()>60)shown=shown.substring(0,60)+"…";
            b.append("\n  ").append(k).append(" = ").append(shown);}
        return b.length()==0?"（没有）":b.toString();
    }
    // ---- 状态栏歌词（Claude）：网易云等打开「状态栏歌词」时，ticker 或 extras 里带 lyric 的字段就是当前这句（只在内存里） ----
    static volatile String tickerLyric="",tickerPkg="";
    static volatile long tickerAt;
    private static String lyricFrom(Notification n,android.os.Bundle e){
        CharSequence title=e.getCharSequence(Notification.EXTRA_TITLE),text=e.getCharSequence(Notification.EXTRA_TEXT);
        for(String k:e.keySet())if(k.toLowerCase(java.util.Locale.ROOT).contains("lyric")){Object v;try{v=e.get(k);}catch(RuntimeException x){continue;}
            if(v instanceof CharSequence){String l=LyricRules.tickerLyric((CharSequence)v,str(title),str(text));if(!l.isEmpty())return l;}}
        return LyricRules.tickerLyric(n.tickerText,str(title),str(text));
    }
    private static String str(CharSequence s){return s==null?"":s.toString();}
    static int nowMinute(){java.util.Calendar c=java.util.Calendar.getInstance();return c.get(java.util.Calendar.HOUR_OF_DAY)*60+c.get(java.util.Calendar.MINUTE);}
    @Override public void onNotificationRemoved(StatusBarNotification sbn){
        inspect(sbn,true);
        Live l=live;if(sbn!=null&&l!=null&&l.key.equals(sbn.getKey()))live=null;
    }
    @Override public void onNotificationPosted(StatusBarNotification sbn){
        if(sbn==null)return;
        inspect(sbn,false);
        android.content.SharedPreferences prefs=getSharedPreferences("pets",MODE_PRIVATE);
        if(prefs.getBoolean("islandLyrics",false)&&LyricRules.musicApp(sbn.getPackageName()))try{ // 状态栏歌词
            Notification n=sbn.getNotification();String lyric=n==null||n.extras==null?"":lyricFrom(n,n.extras);
            if(!lyric.isEmpty()){tickerLyric=lyric;tickerPkg=sbn.getPackageName();tickerAt=SystemClock.elapsedRealtime();}
        }catch(RuntimeException ignored){}
        if(prefs.getBoolean("delivery",false)){ // 外卖进度：更新就跟着变，送达或不再有预计时间就收起
            Live found=liveFrom(sbn),l=live;
            if(found!=null)live=found;else if(l!=null&&l.key.equals(sbn.getKey()))live=null;
        }
        boolean delivery=prefs.getBoolean("delivery",false)&&DeliveryRules.supported(sbn.getPackageName());
        boolean chosen=prefs.getBoolean("notify:"+sbn.getPackageName(),false);
        if(!delivery&&!chosen)return;
        if(System.currentTimeMillis()-sbn.getPostTime()>60000)return;
        Notification n=sbn.getNotification();
        if((n.flags&Notification.FLAG_GROUP_SUMMARY)!=0)return;
        if(n.extras==null)return;
        if(chosen){
            CharSequence t=n.extras.getCharSequence(Notification.EXTRA_TITLE);
            String label=sbn.getPackageName();try{label=getPackageManager().getApplicationLabel(getPackageManager().getApplicationInfo(label,0)).toString();}catch(android.content.pm.PackageManager.NameNotFoundException ignored){}
            notice=label+"："+(t==null?"有新通知":t.toString().substring(0,Math.min(80,t.length())));noticeIntent=n.contentIntent;noticePkg=sbn.getPackageName();noticeAt=SystemClock.elapsedRealtime();
        }
        if(!delivery)return;
        // Read only the delivery app's visible notification text, transiently in memory.
        CharSequence title=n.extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence body=n.extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
        if(body==null)body=n.extras.getCharSequence(Notification.EXTRA_TEXT);
        String message=DeliveryRules.hint(String.valueOf(title)+" "+String.valueOf(body));
        if(message.isEmpty())return;
        long now=SystemClock.elapsedRealtime();
        String key=sbn.getKey()+":"+message;
        Long previous=seen.get(key);
        if(previous!=null&&now-previous<120000)return;
        seen.put(key,now);if(seen.size()>64)seen.remove(seen.keySet().iterator().next());
        hint=message;hintIntent=n.contentIntent;hintPkg=sbn.getPackageName();hintAt=now;
    }
    @Override public void onListenerDisconnected(){current=null;live=null;tickerLyric="";tickerPkg="";tickerAt=0;hint="";hintAt=0;notice="";noticeAt=0;noticeIntent=hintIntent=null;noticePkg=hintPkg="";seen.clear();}
}

package com.lumi.deskpets;
import android.app.Notification;
import android.os.SystemClock;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import java.util.LinkedHashMap;

/** Opt-in and allowlisted: no history scan, uploads, notification actions or full text storage. */
public final class DeliveryCompanion extends NotificationListenerService {
    static volatile String hint="";
    static volatile long hintAt;
    static volatile String notice="";
    static volatile long noticeAt;
    // 点提示条时打开这条通知（只在内存里，不保存）
    static volatile android.app.PendingIntent noticeIntent,hintIntent;
    static volatile String noticePkg="",hintPkg="";
    private final LinkedHashMap<String,Long> seen=new LinkedHashMap<>();
    // ---- 外卖通知检查（Claude）：测试菜单里打开时，把白名单外卖 App 通知能读到的字段临时显示在屏幕上 ----
    // 只在内存里留最近 3 条，关掉工具就清空；不保存、不上传、不写日志。
    static volatile boolean inspecting;
    static final LinkedHashMap<String,String> inspected=new LinkedHashMap<>();
    static volatile long inspectedAt;
    private static volatile DeliveryCompanion current;
    @Override public void onListenerConnected(){current=this;if(inspecting)scanActive();}
    static boolean connected(){return current!=null;}
    /** 打开工具时先看一眼已经在通知栏里的外卖通知。 */
    static void scanActive(){
        DeliveryCompanion c=current;if(c==null)return;
        try{StatusBarNotification[] all=c.getActiveNotifications();if(all!=null)for(StatusBarNotification sbn:all)c.inspect(sbn,false);}catch(RuntimeException ignored){}
    }
    static void stopInspect(){inspecting=false;synchronized(inspected){inspected.clear();}inspectedAt=android.os.SystemClock.elapsedRealtime();}
    private void inspect(StatusBarNotification sbn,boolean removed){
        if(!inspecting||sbn==null||!DeliveryRules.supported(sbn.getPackageName()))return;
        String app=sbn.getPackageName();try{app=getPackageManager().getApplicationLabel(getPackageManager().getApplicationInfo(app,0)).toString();}catch(android.content.pm.PackageManager.NameNotFoundException ignored){}
        String time=new java.text.SimpleDateFormat("HH:mm:ss",java.util.Locale.ROOT).format(new java.util.Date());
        String text;
        if(removed)text="【"+app+" · "+time+"】\n这条通知消失了";
        else{
            Notification n=sbn.getNotification();android.os.Bundle e=n.extras==null?new android.os.Bundle():n.extras;
            text=DeliveryRules.inspect(app,time,e.getCharSequence(Notification.EXTRA_TITLE),e.getCharSequence(Notification.EXTRA_TEXT),e.getCharSequence(Notification.EXTRA_SUB_TEXT),e.getCharSequence(Notification.EXTRA_BIG_TEXT),
                sbn.isOngoing(),e.getInt(Notification.EXTRA_PROGRESS,0),e.getInt(Notification.EXTRA_PROGRESS_MAX,0),e.getBoolean(Notification.EXTRA_PROGRESS_INDETERMINATE,false));
        }
        synchronized(inspected){inspected.remove(sbn.getKey());inspected.put(sbn.getKey(),text);while(inspected.size()>3)inspected.remove(inspected.keySet().iterator().next());}
        inspectedAt=android.os.SystemClock.elapsedRealtime();
    }
    @Override public void onNotificationRemoved(StatusBarNotification sbn){inspect(sbn,true);}
    @Override public void onNotificationPosted(StatusBarNotification sbn){
        if(sbn==null)return;
        inspect(sbn,false);
        android.content.SharedPreferences prefs=getSharedPreferences("pets",MODE_PRIVATE);
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
    @Override public void onListenerDisconnected(){current=null;hint="";hintAt=0;notice="";noticeAt=0;noticeIntent=hintIntent=null;noticePkg=hintPkg="";seen.clear();}
}

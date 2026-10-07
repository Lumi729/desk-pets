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
    @Override public void onNotificationPosted(StatusBarNotification sbn){
        if(sbn==null)return;
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
    @Override public void onListenerDisconnected(){hint="";hintAt=0;notice="";noticeAt=0;noticeIntent=hintIntent=null;noticePkg=hintPkg="";seen.clear();}
}

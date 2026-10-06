package com.lumi.deskpets;

import android.accessibilityservice.AccessibilityService;
import android.app.KeyguardManager;
import android.content.Context;
import android.graphics.Rect;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Optional read-only geometry observer. Never requests text, descriptions or key events. */
public final class InterfaceCompanion extends AccessibilityService {
    static boolean visible;
    static boolean connected;
    static Snapshot snapshot=Snapshot.EMPTY;
    static final class Snapshot {
        static final Snapshot EMPTY=new Snapshot("",-1,0,Collections.emptyList());
        final String pkg;
        final int keyboardTop;
        final long input;
        final List<Perch> perches;
        Snapshot(String p,int k,long i,List<Perch> s){pkg=p;keyboardTop=k;input=i;perches=Collections.unmodifiableList(new ArrayList<>(s));}
    }
    private final Handler clock=new Handler(Looper.getMainLooper());
    private String app="";
    private long lastInput;
    private final Runnable scan=new Runnable(){public void run(){
        inspect();clock.postDelayed(this,400);
    }};
    static void clear(){snapshot=Snapshot.EMPTY;}
    private boolean enabled(){return visible && getSharedPreferences("pets",Context.MODE_PRIVATE).getBoolean("interface",false)
        && !getSystemService(KeyguardManager.class).isKeyguardLocked();}
    @Override protected void onServiceConnected(){connected=true;clock.post(scan);}
    @Override public void onAccessibilityEvent(AccessibilityEvent event){
        if(!enabled()){lastInput=0;clear();return;}
        if(event.getEventType()!=AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED)return;
        CharSequence pkg=event.getPackageName();
        if(pkg==null || !pkg.toString().equals(app) || getPackageName().equals(app))return;
        AccessibilityNodeInfo node=event.getSource();
        try {
            if(node!=null && node.isEditable() && node.isFocused() && !node.isPassword()){
                lastInput=SystemClock.uptimeMillis();
                Snapshot old=snapshot;snapshot=new Snapshot(old.pkg,old.keyboardTop,lastInput,old.perches);
            }
        } finally {if(node!=null)node.recycle();}
    }
    private void inspect(){
        if(!enabled()){app="";lastInput=0;clear();return;}
        int keyboard=-1;String next="";AccessibilityWindowInfo active=null;
        List<AccessibilityWindowInfo> all=getWindows();
        try {
            for(AccessibilityWindowInfo w:all){
                Rect r=new Rect();w.getBoundsInScreen(r);
                if(w.getType()==AccessibilityWindowInfo.TYPE_INPUT_METHOD && !r.isEmpty())keyboard=r.top;
                if(w.getType()==AccessibilityWindowInfo.TYPE_APPLICATION && (w.isActive()||w.isFocused()))active=w;
            }
            List<Perch> surfaces=new ArrayList<>();
            if(active!=null){
                AccessibilityNodeInfo root=active.getRoot();
                if(root!=null)try{
                    CharSequence name=root.getPackageName();next=name==null?"":name.toString();
                    if(!next.equals(app))lastInput=0;
                    AccessibilityNodeInfo focus=root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
                    if(focus!=null)try{if(focus.isPassword()||!focus.isEditable())lastInput=0;}finally{focus.recycle();}
                    else lastInput=0;
                    if(!getPackageName().equals(next) && getSharedPreferences("pets",MODE_PRIVATE).getBoolean("perching",false)){
                        Rect bounds=new Rect();active.getBoundsInScreen(bounds);
                        collect(root,surfaces,bounds,false,0,new int[]{0});
                    }
                }finally{root.recycle();}
            }
            app=next;
            if(next.isEmpty()||next.equals(getPackageName())){lastInput=0;surfaces.clear();}
            snapshot=new Snapshot(next,keyboard,lastInput,surfaces);
        }catch(RuntimeException unavailable){app="";lastInput=0;clear();}
        finally{for(AccessibilityWindowInfo w:all)w.recycle();}
    }
    private void collect(AccessibilityNodeInfo node,List<Perch> out,Rect window,boolean inList,int depth,int[] count){
        if(depth>24 || ++count[0]>400 || out.size()>=32 || !node.isVisibleToUser() || node.isPassword())return;
        CharSequence className=node.getClassName();String cls=className==null?"":className.toString();
        String id=node.getViewIdResourceName();id=id==null?"":id;
        boolean list=inList||node.isScrollable()||cls.contains("RecyclerView")||cls.contains("ListView")||cls.contains("ScrollView");
        Rect r=new Rect();node.getBoundsInScreen(r);
        float density=getResources().getDisplayMetrics().density;
        int kind=SurfaceRules.kind(cls,id,list,node.isEditable(),node.isClickable(),
            (r.left-window.left)/density,r.width()/density,r.height()/density,window.width()/density);
        if(kind!=SurfaceRules.NONE && r.left>=window.left && r.right<=window.right
            && r.top>=window.top && r.bottom<=window.bottom){
            // Use a close-fitting bubble container where available; never inspect its text.
            if(kind==SurfaceRules.CONTENT){AccessibilityNodeInfo parent=node.getParent();if(parent!=null)try{
                Rect p=new Rect();parent.getBoundsInScreen(p);
                if(p.contains(r)&&p.width()<window.width()*.85f&&p.height()<=r.height()+Math.round(24*density)&&p.top>=window.top)r=p;
            }finally{parent.recycle();}}
            Perch p=new Perch(r.left,r.top,r.right);
            boolean duplicate=false;for(Perch old:out)if(old.near(p)){duplicate=true;break;}
            if(!duplicate)out.add(p);
        }
        for(int i=0;i<node.getChildCount();i++){AccessibilityNodeInfo child=node.getChild(i);if(child!=null)try{collect(child,out,window,list,depth+1,count);}finally{child.recycle();}}
    }
    @Override public void onInterrupt(){lastInput=0;clear();}
    @Override public void onDestroy(){clock.removeCallbacksAndMessages(null);connected=false;clear();super.onDestroy();}
}

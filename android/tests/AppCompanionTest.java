package com.lumi.deskpets;
import java.util.Map;
public final class AppCompanionTest {
    static void equal(Object actual,Object expected){if(!actual.equals(expected))throw new AssertionError(actual+" != "+expected);}
    public static void main(String[] args){
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
        System.out.println("App classification, overrides, stale events, switch ordering and screen reset passed");
    }
}

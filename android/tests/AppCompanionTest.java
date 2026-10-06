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
        System.out.println("App classification, overrides, stale events, switch ordering and screen reset passed");
    }
}

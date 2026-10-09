package com.lumi.deskpets;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/** 美化包（Claude，照「美化包格式说明.md」v1）：文件名白名单、路径安全、大小限制、颜色格式、默认颜色、图标着色，纯规则方便测试。 */
final class ThemeRules {
    private ThemeRules(){}
    static final String DEFAULT_ID="qianqian";
    static final int VERSION=1;
    static final int MAX_IMAGE=512*1024,MAX_PACK=2*1024*1024;
    static final List<String> ICONS=Collections.unmodifiableList(Arrays.asList("prev","play","pause","next","timer","hide","move","close","heart"));
    static final List<String> ISLAND=Collections.unmodifiableList(Arrays.asList("island_left.png","island_middle.png","island_right.png"));
    /** 颜色键和千千猫猫的默认值（美化包缺哪个就用这里的补上）。patch 可选，默认不画。 */
    static final String[] COLOR_KEYS={"background","panel","rim","card","accent","accentText","text","subtext","pageText","pageSubtext","track","icon","patch"};
    static final int[] DEFAULT_COLORS={0xFF241E26,0xFF302932,0xFF4E4352,0xFF3D3440,0xFFEFA7C0,0xFF302932,0xFFFFF7FA,0xFFC9B8C2,0xFFFFF7FA,0xFFC9B8C2,0xFF241E26,0xFFFFF7FA,0};
    static int index(String key){for(int i=0;i<COLOR_KEYS.length;i++)if(COLOR_KEYS[i].equals(key))return i;return -1;}
    /** id 只允许小写字母、数字、-。 */
    static boolean validId(String id){return id!=null&&id.matches("[a-z0-9-]{1,40}");}
    /** 路径里有 ..、绝对路径、反斜杠或盘符，整个包都不要。 */
    static boolean unsafe(String name){
        if(name==null)return true;
        String n=name.replace('\\','/');
        if(name.contains("\\")||n.startsWith("/")||n.matches("^[A-Za-z]:.*"))return true;
        for(String part:n.split("/"))if(part.equals(".."))return true;
        return false;
    }
    /** 只取说明里列出的文件：theme.json、三段灵动岛、icons/ 里九个图标；其他文件忽略（返回 null）。 */
    static String allowed(String name){
        if(name==null||unsafe(name))return null;
        if(name.equals("theme.json")||ISLAND.contains(name))return name;
        if(name.startsWith("icons/")&&name.endsWith(".png")){String icon=name.substring(6,name.length()-4);if(ICONS.contains(icon))return name;}
        return null;
    }
    /** 「#RRGGBB」或「#AARRGGBB」→ ARGB；格式不对返回 null。 */
    static Integer color(String s){
        if(s==null)return null;
        String t=s.trim();
        if(!t.matches("#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})"))return null;
        long v=Long.parseLong(t.substring(1),16);
        return t.length()==7?(int)(0xFF000000L|v):(int)v;
    }
    /** 默认图标着色：浅色、不带颜色的像素换成主题的 icon 颜色（保留透明度），粉色这些有颜色的像素不动。 */
    static int recolor(int argb,int icon){
        int a=argb>>>24,r=(argb>>16)&255,g=(argb>>8)&255,b=argb&255;
        if(a==0)return argb;
        int max=Math.max(r,Math.max(g,b)),min=Math.min(r,Math.min(g,b));
        if(min>=200&&max-min<=40)return (a<<24)|(icon&0xFFFFFF);
        return argb;
    }
    /** 小一点的说明，方便告诉千千哪里不对。 */
    static String sizeText(long bytes){return bytes>=1024*1024?String.format(java.util.Locale.ROOT,"%.1f MB",bytes/1048576.0):(bytes/1024)+" KB";}
}

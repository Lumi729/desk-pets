package com.lumi.deskpets;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 灵动岛滚动歌词（Claude）：解析带时间轴的 LRC、按播放进度找当前这句、挑搜索结果、认状态栏歌词，纯规则方便测试。 */
final class LyricRules {
    private LyricRules(){}
    /** 一句歌词：从 time 毫秒开始。 */
    static final class Line{
        final long time;final String text;
        Line(long time,String text){this.time=time;this.text=text;}
        @Override public boolean equals(Object o){return o instanceof Line&&((Line)o).time==time&&((Line)o).text.equals(text);}
        @Override public int hashCode(){return Long.hashCode(time)*31+text.hashCode();}
        @Override public String toString(){return time+":"+text;}
    }
    private static final Pattern STAMP=Pattern.compile("\\[(\\d{1,3}):(\\d{1,2})(?:[.:](\\d{1,3}))?\\]");
    private static final Pattern OFFSET=Pattern.compile("\\[offset:\\s*([+-]?\\d+)\\s*\\]",Pattern.CASE_INSENSITIVE);
    /** 解析 LRC：一行可以有好几个时间；[ar:] 这类信息行和空歌词行跳过；按时间排好。 */
    static List<Line> parse(String lrc){
        List<Line> lines=new ArrayList<>();
        if(lrc==null)return lines;
        long offset=0;
        Matcher o=OFFSET.matcher(lrc);if(o.find())try{offset=Long.parseLong(o.group(1));}catch(NumberFormatException ignored){}
        for(String raw:lrc.split("\\r?\\n")){
            Matcher m=STAMP.matcher(raw);List<Long> times=new ArrayList<>();int end=0;
            while(m.find()&&m.start()==end){
                long min=Long.parseLong(m.group(1)),sec=Long.parseLong(m.group(2));String frac=m.group(3);
                long ms=frac==null?0:frac.length()==1?Long.parseLong(frac)*100:frac.length()==2?Long.parseLong(frac)*10:Long.parseLong(frac);
                times.add(Math.max(0,min*60_000+sec*1000+ms-offset));end=m.end();
            }
            if(times.isEmpty())continue;
            String text=raw.substring(end).trim();
            if(text.isEmpty())continue;
            for(long t:times)lines.add(new Line(t,text));
        }
        Collections.sort(lines,(a,b)->Long.compare(a.time,b.time));
        return lines;
    }
    /** 纯音乐、或者没有一句带时间的歌词：不显示歌词，照旧显示歌名。 */
    static boolean instrumental(List<Line> lines){
        if(lines.isEmpty())return true;
        if(lines.size()<=2)for(Line l:lines)if(l.text.contains("纯音乐")||l.text.contains("此歌曲为没有填词"))return true;
        return false;
    }
    /** 现在唱到第几句（-1 是第一句还没开始）。 */
    static int index(List<Line> lines,long position){
        int lo=0,hi=lines.size()-1,found=-1;
        while(lo<=hi){int mid=(lo+hi)>>>1;if(lines.get(mid).time<=position){found=mid;lo=mid+1;}else hi=mid-1;}
        return found;
    }
    /** 按媒体会话推算现在播到哪：暂停就停在上次的位置。 */
    static long position(long reported,long reportedAt,long now,float speed,boolean playing){
        if(!playing||reportedAt<=0)return Math.max(0,reported);
        return Math.max(0,reported+(long)((now-reportedAt)*(speed<=0?1:speed)));
    }
    /** 比较歌名用：去掉括号里的版本说明、空格和大小写。 */
    static String normalize(String s){
        if(s==null)return "";
        return s.replaceAll("[（(\\[【].*?[)）\\]】]","").replaceAll("[\\s·・\\-_/、,，.。'’\"“”!！?？&]+","").toLowerCase(java.util.Locale.ROOT);
    }
    /** 搜索结果打分：歌名一样最重要，歌手对上再加分，时长接近也加一点；一点都对不上就是 -1（宁可不显示）。 */
    static int score(String wantTitle,String wantArtist,long wantDuration,String title,String artists,long duration){
        String a=normalize(wantTitle),b=normalize(title);
        if(a.isEmpty()||b.isEmpty())return -1;
        int s;
        if(a.equals(b))s=100;else if(a.contains(b)||b.contains(a))s=60;else return -1;
        String wa=normalize(wantArtist),ra=normalize(artists);
        if(!wa.isEmpty()&&!ra.isEmpty()){if(ra.contains(wa)||wa.contains(ra))s+=50;else s-=30;}
        if(wantDuration>0&&duration>0&&Math.abs(wantDuration-duration)<=3000)s+=20;
        return s;
    }
    /** 状态栏歌词：音乐 App 通知的 ticker 和歌名、歌手都不一样，又不是空的，才当作当前这句歌词。 */
    static String tickerLyric(CharSequence ticker,String title,String artist){
        if(ticker==null)return "";
        String t=ticker.toString().trim();
        if(t.isEmpty()||t.length()>120)return "";
        if(t.equals(title)||t.equals(artist)||t.equals(title+" - "+artist)||t.equals(artist+" - "+title))return "";
        return t;
    }
    /** 常见音乐 App（状态栏歌词只看它们的通知）。 */
    static boolean musicApp(String pkg){
        return "com.netease.cloudmusic".equals(pkg)||"com.tencent.qqmusic".equals(pkg)||"com.kugou.android".equals(pkg)||"cn.kuwo.player".equals(pkg)||"com.miui.player".equals(pkg)||"com.heytap.music".equals(pkg)||"com.android.bbkmusic".equals(pkg)||"com.huawei.music".equals(pkg);
    }
}

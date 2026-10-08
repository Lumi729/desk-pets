package com.lumi.deskpets;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 查歌词（Claude）：只把歌名和歌手发给网易云音乐网页接口（搜索 → 取 LRC），不带别的信息。
 * 结果只放内存，最多记最近 6 首；不存文件、不上传、不写日志。
 */
final class LyricFetcher {
    /** 查到的歌词；lines 为空表示查不到 / 纯音乐（照旧只显示歌名）。 */
    static final class Song{final String key;final List<LyricRules.Line> lines;Song(String key,List<LyricRules.Line> lines){this.key=key;this.lines=lines;}}
    private static final int KEEP=6;
    private final Map<String,Song> cache=new LinkedHashMap<String,Song>(8,.75f,true){
        @Override protected boolean removeEldestEntry(Map.Entry<String,Song> e){return size()>KEEP;}
    };
    private final ExecutorService worker=Executors.newSingleThreadExecutor(r->{Thread t=new Thread(r,"pet-lyrics");t.setDaemon(true);return t;});
    private volatile String pending="";
    static String key(String title,String artist){return title+"\u0001"+artist;}
    /** 有就直接给；没有就在后台查一次（同一首不会重复查），这次先返回 null。 */
    Song get(String title,String artist,long duration){
        String key=key(title,artist);
        synchronized(cache){Song s=cache.get(key);if(s!=null)return s;}
        if(key.equals(pending))return null;
        pending=key;
        worker.execute(()->{
            List<LyricRules.Line> lines;
            try{lines=lookup(title,artist,duration);}catch(IOException|RuntimeException|org.json.JSONException e){lines=Collections.emptyList();}
            if(LyricRules.instrumental(lines))lines=Collections.emptyList();
            synchronized(cache){cache.put(key,new Song(key,lines));}
            if(key.equals(pending))pending="";
        });
        return null;
    }
    void clear(){synchronized(cache){cache.clear();}pending="";}
    void shutdown(){worker.shutdownNow();clear();}
    private static List<LyricRules.Line> lookup(String title,String artist,long duration) throws IOException,org.json.JSONException {
        String query=(title+" "+artist).trim();
        JSONObject found=new JSONObject(get("https://music.163.com/api/search/get/web?type=1&limit=8&offset=0&s="+URLEncoder.encode(query,"UTF-8")));
        JSONObject result=found.optJSONObject("result");JSONArray songs=result==null?null:result.optJSONArray("songs");
        if(songs==null)return Collections.emptyList();
        long best=-1;int bestScore=-1;
        for(int i=0;i<songs.length();i++){
            JSONObject song=songs.getJSONObject(i);StringBuilder names=new StringBuilder();
            JSONArray artists=song.optJSONArray("artists");if(artists!=null)for(int k=0;k<artists.length();k++)names.append(artists.getJSONObject(k).optString("name")).append(' ');
            int score=LyricRules.score(title,artist,duration,song.optString("name"),names.toString(),song.optLong("duration",0));
            if(score>bestScore){bestScore=score;best=song.optLong("id",-1);}
        }
        if(best<0||bestScore<0)return Collections.emptyList(); // 对不上就不显示，不拿别的歌冒充
        JSONObject lyric=new JSONObject(get("https://music.163.com/api/song/lyric?lv=1&id="+best));
        JSONObject lrc=lyric.optJSONObject("lrc");
        return LyricRules.parse(lrc==null?"":lrc.optString("lyric",""));
    }
    private static String get(String url) throws IOException {
        HttpURLConnection con=(HttpURLConnection)new URL(url).openConnection();
        con.setConnectTimeout(8000);con.setReadTimeout(8000);con.setUseCaches(false);
        con.setRequestProperty("Referer","https://music.163.com/");
        con.setRequestProperty("User-Agent","Mozilla/5.0 (Linux; Android) Lijianxue-DeskPets");
        try{
            if(con.getResponseCode()!=200)throw new IOException("HTTP "+con.getResponseCode());
            try(InputStream in=con.getInputStream();ByteArrayOutputStream bytes=new ByteArrayOutputStream()){
                byte[] buf=new byte[8192];int n;
                while((n=in.read(buf))!=-1){if(bytes.size()+n>2*1024*1024)throw new IOException("too large");bytes.write(buf,0,n);}
                return bytes.toString(StandardCharsets.UTF_8.name());
            }
        }finally{con.disconnect();}
    }
}

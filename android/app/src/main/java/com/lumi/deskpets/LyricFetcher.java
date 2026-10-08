package com.lumi.deskpets;

import android.os.SystemClock;
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
 * 网络失败不会一直记着「没有歌词」：过一会儿再试（30 秒、2 分钟、5 分钟），真的没有这首 / 纯音乐才记住。
 */
final class LyricFetcher {
    /** 查到的歌词；lines 为空表示暂时没有（看 status）。 */
    static final class Song{
        final String key,status;final List<LyricRules.Line> lines;final boolean failed;final int tries;final long retryAt;
        Song(String key,List<LyricRules.Line> lines,String status,boolean failed,int tries,long retryAt){this.key=key;this.lines=lines;this.status=status;this.failed=failed;this.tries=tries;this.retryAt=retryAt;}
    }
    private static final int KEEP=6;
    private static final long[] RETRY={30_000,120_000,300_000};
    private final Map<String,Song> cache=new LinkedHashMap<String,Song>(8,.75f,true){
        @Override protected boolean removeEldestEntry(Map.Entry<String,Song> e){return size()>KEEP;}
    };
    private final ExecutorService worker=Executors.newSingleThreadExecutor(r->{Thread t=new Thread(r,"pet-lyrics");t.setDaemon(true);return t;});
    private volatile String pending="";
    static String key(String title,String artist){return title+"\u0001"+artist;}
    /** 有就直接给；没有（或上次网络失败、到了重试时间）就在后台查一次，这次先返回现有的结果或 null。 */
    Song get(String title,String artist,long duration){
        String key=key(title,artist);Song had;
        synchronized(cache){had=cache.get(key);}
        if(had!=null&&!(had.failed&&had.tries<=RETRY.length&&SystemClock.elapsedRealtime()>=had.retryAt))return had;
        if(key.equals(pending))return had;
        pending=key;int tries=had==null?0:had.tries;
        worker.execute(()->{
            Song song;
            try{
                List<LyricRules.Line> lines=lookup(title,artist,duration);
                if(lines==null)song=new Song(key,Collections.<LyricRules.Line>emptyList(),"网易云里没找到对得上的这首歌",false,tries,0);
                else if(LyricRules.instrumental(lines))song=new Song(key,Collections.<LyricRules.Line>emptyList(),"纯音乐或没有带时间的歌词",false,tries,0);
                else song=new Song(key,lines,"查到 "+lines.size()+" 句歌词",false,tries,0);
            }catch(IOException|RuntimeException|org.json.JSONException e){
                long wait=RETRY[Math.min(tries,RETRY.length-1)];
                song=new Song(key,Collections.<LyricRules.Line>emptyList(),"查歌词失败（"+reason(e)+"），"+(tries<RETRY.length?(wait/1000)+" 秒后再试":"先不试了，切歌回来会再试"),true,tries+1,SystemClock.elapsedRealtime()+wait);
            }
            synchronized(cache){cache.put(key,song);}
            if(key.equals(pending))pending="";
        });
        return had;
    }
    /** 正在查这首吗（通知检查里显示用）。 */
    boolean pending(String title,String artist){return key(title,artist).equals(pending);}
    void clear(){synchronized(cache){cache.clear();}pending="";}
    void shutdown(){worker.shutdownNow();clear();}
    private static String reason(Exception e){String m=e.getMessage();return e instanceof java.net.SocketTimeoutException?"网络超时":e instanceof java.net.UnknownHostException?"连不上网":m==null||m.isEmpty()?e.getClass().getSimpleName():m.length()>40?m.substring(0,40):m;}
    /** 返回 null 表示没找到对得上的歌（不重试）；网络或接口出错抛异常（会重试）。 */
    private static List<LyricRules.Line> lookup(String title,String artist,long duration) throws IOException,org.json.JSONException {
        String query=URLEncoder.encode((title+" "+artist).trim(),"UTF-8");
        long id=-1;IOException failure=null;
        // 两个搜索接口轮流试：一个被限制或出错就换另一个
        for(String url:new String[]{"https://music.163.com/api/search/get/web?type=1&limit=10&offset=0&s="+query,"https://music.163.com/api/cloudsearch/pc?type=1&limit=10&offset=0&s="+query}){
            try{id=pick(new JSONObject(get(url)),title,artist,duration);failure=null;if(id>=0)break;}
            catch(IOException e){failure=e;}
        }
        if(id<0){if(failure!=null)throw failure;return null;}
        JSONObject lyric=new JSONObject(get("https://music.163.com/api/song/lyric?lv=1&kv=1&tv=-1&id="+id));
        if(lyric.optInt("code",200)!=200)throw new IOException("歌词接口返回 "+lyric.optInt("code"));
        JSONObject lrc=lyric.optJSONObject("lrc");
        return LyricRules.parse(lrc==null?"":lrc.optString("lyric",""));
    }
    /** 从搜索结果挑最对得上的一首（两个接口字段名不一样：artists/ar、duration/dt）。 */
    private static long pick(JSONObject found,String title,String artist,long duration) throws IOException,org.json.JSONException {
        if(found.optInt("code",200)!=200)throw new IOException("搜索接口返回 "+found.optInt("code"));
        JSONObject result=found.optJSONObject("result");JSONArray songs=result==null?null:result.optJSONArray("songs");
        if(songs==null)return -1;
        long best=-1;int bestScore=-1;
        for(int i=0;i<songs.length();i++){
            JSONObject song=songs.getJSONObject(i);StringBuilder names=new StringBuilder();
            JSONArray artists=song.optJSONArray("artists");if(artists==null)artists=song.optJSONArray("ar");
            if(artists!=null)for(int k=0;k<artists.length();k++)names.append(artists.getJSONObject(k).optString("name")).append(' ');
            long length=song.has("duration")?song.optLong("duration",0):song.optLong("dt",0);
            int score=LyricRules.score(title,artist,duration,song.optString("name"),names.toString(),length);
            if(score>bestScore){bestScore=score;best=song.optLong("id",-1);}
        }
        return bestScore<0?-1:best; // 对不上就不显示，不拿别的歌冒充
    }
    private static String get(String url) throws IOException {
        HttpURLConnection con=(HttpURLConnection)new URL(url).openConnection();
        con.setConnectTimeout(8000);con.setReadTimeout(8000);con.setUseCaches(false);
        con.setRequestProperty("Referer","https://music.163.com/");
        con.setRequestProperty("User-Agent","Mozilla/5.0 (Linux; Android) Lijianxue-DeskPets");
        try{
            int status=con.getResponseCode();
            if(status!=200)throw new IOException("HTTP "+status);
            try(InputStream in=con.getInputStream();ByteArrayOutputStream bytes=new ByteArrayOutputStream()){
                byte[] buf=new byte[8192];int n;
                while((n=in.read(buf))!=-1){if(bytes.size()+n>2*1024*1024)throw new IOException("回复太大");bytes.write(buf,0,n);}
                return bytes.toString(StandardCharsets.UTF_8.name());
            }
        }finally{con.disconnect();}
    }
}

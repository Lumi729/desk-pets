package com.lumi.deskpets;
import java.util.*;
import java.util.concurrent.*;

/** Exercise actual cache/scheduling code without networking or Android runtime. */
public class LyricFetcherTest {
    static final class Queue extends AbstractExecutorService {
        final List<Runnable> jobs=new ArrayList<>();
        public void execute(Runnable r){jobs.add(r);}
        public void shutdown(){}
        public List<Runnable> shutdownNow(){return jobs;}
        public boolean isShutdown(){return false;}
        public boolean isTerminated(){return false;}
        public boolean awaitTermination(long t,TimeUnit u){return true;}
    }
    static void check(boolean ok){if(!ok)throw new AssertionError();}
    @SuppressWarnings("unchecked")
    public static void main(String[] args)throws Exception{
        Queue queue=new Queue();LyricFetcher f=new LyricFetcher(queue);
        java.lang.reflect.Field field=LyricFetcher.class.getDeclaredField("cache");field.setAccessible(true);
        Map<String,LyricFetcher.Song> cache=(Map<String,LyricFetcher.Song>)field.get(f);
        String a=LyricFetcher.key("same","A");
        f.select("same","A");
        cache.put(a,new LyricFetcher.Song(a,Collections.emptyList(),"failed",true,4,0));
        f.get("same","A",0);check(queue.jobs.isEmpty()); // no endless retries while staying here
        f.select("other","B"); // works even when the other song uses notification lyrics
        f.get("same","A",0);check(queue.jobs.size()==1);
        f.get("other","B",0);f.get("same","A",0);check(queue.jobs.size()==2);
        check(f.pending("same","A")&&f.pending("other","B"));
        String c=LyricFetcher.key("cached","C");
        cache.put(c,new LyricFetcher.Song(c,Collections.emptyList(),"no lyrics",false,0,0));
        f.get("cached","C",0);check(queue.jobs.size()==2); // no-lyrics success stays cached
        String d=LyricFetcher.key("backoff","D");
        cache.put(d,new LyricFetcher.Song(d,Collections.emptyList(),"failed",true,1,9999));
        f.get("backoff","D",0);check(queue.jobs.size()==2); // keep normal retry backoff
        f.shutdown();System.out.println("Lyric retry reset, cache preservation and in-flight deduplication passed");
    }
}

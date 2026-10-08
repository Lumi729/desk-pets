package com.lumi.deskpets;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;

/** Real local HTTP fixtures: no GitHub availability or credentials needed. */
public final class UpdateHttpTest {
    static void check(boolean value) { if(!value)throw new AssertionError(); }
    public static void main(String[] args) throws Exception {
        HttpServer server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        java.util.concurrent.ExecutorService workers=java.util.concurrent.Executors.newCachedThreadPool();
        server.setExecutor(workers);
        server.createContext("/ok",e->{
            boolean headers="Lijianxue-Android-Updater".equals(e.getRequestHeaders().getFirst("User-Agent"))
                &&"no-cache".equals(e.getRequestHeaders().getFirst("Cache-Control"))
                &&"application/vnd.github+json".equals(e.getRequestHeaders().getFirst("Accept"))
                &&e.getRequestHeaders().getFirst("Authorization")==null;
            byte[] body="[{\"tag_name\":\"android-v0.14-preview\"}]".getBytes(StandardCharsets.UTF_8);
            e.sendResponseHeaders(headers?200:400,body.length);e.getResponseBody().write(body);e.close();
        });
        server.createContext("/limited",e->{
            e.getResponseHeaders().set("X-RateLimit-Remaining","0");
            e.getResponseHeaders().set("X-RateLimit-Reset",Long.toString(System.currentTimeMillis()/1000+3600));
            e.sendResponseHeaders(403,-1);e.close();
        });
        server.createContext("/retry",e->{e.getResponseHeaders().set("Retry-After","3600");e.sendResponseHeaders(429,-1);e.close();});
        server.createContext("/broken",e->{e.sendResponseHeaders(503,-1);e.close();});
        server.createContext("/slow",e->{try{Thread.sleep(400);}catch(InterruptedException ignored){}e.close();});
        server.start();String base="http://127.0.0.1:"+server.getAddress().getPort();
        try {
            check(UpdateHttp.get(base+"/ok",2000).contains("android-v0.14-preview"));
            for(String path:new String[]{"/limited","/retry"}) {
                try { UpdateHttp.get(base+path,2000);throw new AssertionError("rate limit treated as success"); }
                catch(UpdateHttp.Failure e){check(e.getMessage().contains("限制"));check(e.retryAt>System.currentTimeMillis()+3_500_000);}
            }
            try { UpdateHttp.get(base+"/broken",2000);throw new AssertionError("503 treated as success"); }
            catch(UpdateHttp.Failure e){check(e.getMessage().contains("503"));check(e.retryAt==0);}
            try { UpdateHttp.get(base+"/slow",100);throw new AssertionError("timeout treated as success"); }
            catch(SocketTimeoutException expected) {}
            check(UpdateHttp.get(base+"/ok",2000).contains("android-v0.14-preview")); // recovery after failure
        } finally {server.stop(0);workers.shutdownNow();}
        System.out.println("Update HTTP success, headers, rate limits, server failure, timeout and recovery passed");
    }
}

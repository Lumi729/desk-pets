package com.lumi.deskpets;

import android.app.DownloadManager;
import android.content.*;
import android.net.Uri;
import android.os.*;
import org.json.*;

/** Checks public Android releases. Installation always needs system confirmation. */
final class UpdateChecker {
    static final String RELEASES = "https://github.com/Lumi729/desk-pets/releases";
    static final class Result {
        final String version, url, notes, error;
        Result(String version, String url, String notes, String error) {
            this.version=version; this.url=url; this.notes=notes; this.error=error;
        }
    }
    interface Callback { void done(Result result); }
    private static final String API = "https://api.github.com/repos/Lumi729/desk-pets/releases?per_page=100";
    private static final java.util.List<Callback> waiting = new java.util.ArrayList<>();
    private static boolean checking;
    private UpdateChecker() {}
    static String current(Context c) {
        try { return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionName; } catch (Exception e) { return ""; }
    }
    /** Only successful checks wait 12h. Failures retry after 15m or the server's limit. */
    static synchronized boolean due(SharedPreferences p) {
        return !checking && UpdateRules.due(p.getBoolean("autoUpdate", false), System.currentTimeMillis(), p.getLong("updateNextCheckAt", 0));
    }
    /** Main-thread callback; concurrent activity/service requests share one network request. */
    static void check(Context context, Callback callback) {
        Context c = context.getApplicationContext();
        Handler ui = new Handler(Looper.getMainLooper());
        SharedPreferences prefs = c.getSharedPreferences("pets", Context.MODE_PRIVATE);
        synchronized (UpdateChecker.class) {
            waiting.add(callback);
            if (checking) return;
            checking = true;
        }
        new Thread(() -> {
            String version=null, url=null, notes="", error=null;
            long retryAt=0;
            try {
                long blockedUntil=prefs.getLong("updateRateLimitUntil",0);
                if (blockedUntil>System.currentTimeMillis() && blockedUntil-System.currentTimeMillis()<=24*3600_000L)
                    throw new UpdateHttp.Failure("GitHub 暂时限制了更新检查次数，请稍后重试。",blockedUntil);
                String current=current(c);
                if (UpdateRules.parse(current).length==0) throw new IllegalStateException("Unknown installed version");
                JSONArray list=new JSONArray(UpdateHttp.get(API,15000));
                String best=current;
                boolean foundAndroid=false;
                for(int i=0;i<list.length();i++) {
                    JSONObject r=list.getJSONObject(i);
                    String tag=r.optString("tag_name");
                    if(r.optBoolean("draft") || !tag.startsWith(UpdateRules.TAG_PREFIX) || UpdateRules.parse(tag).length==0) continue;
                    JSONArray assets=r.optJSONArray("assets");
                    for(int j=0;assets!=null&&j<assets.length();j++) {
                        JSONObject asset=assets.getJSONObject(j);
                        String link=asset.optString("browser_download_url");
                        if(!"uploaded".equals(asset.optString("state")) || !UpdateRules.trustedApk(link)) continue;
                        foundAndroid=true;
                        if(UpdateRules.newer(tag,best)) {
                            version=tag.substring(UpdateRules.TAG_PREFIX.length()); url=link;
                            notes=r.optString("body"); best=tag;
                        }
                    }
                }
                if(!foundAndroid) throw new JSONException("No published Android APK in response");
            } catch(UpdateHttp.Failure e) { error=e.getMessage(); retryAt=e.retryAt;
            } catch(java.net.SocketTimeoutException e) { error="连接 GitHub 超时，未能检查更新。请检查网络后重试。";
            } catch(java.net.UnknownHostException e) { error="无法连接 GitHub 更新地址，请检查手机网络后重试。";
            } catch(javax.net.ssl.SSLException e) { error="无法安全连接 GitHub，请检查网络和手机日期时间。";
            } catch(JSONException e) { error="没有读到有效的安卓发布信息，请稍后重试。";
            } catch(IllegalStateException e) { error="无法读取当前安装版本，请从官方发布页查看更新。";
            } catch(Exception e) { error="连接更新服务器失败，未能确认是否有新版。请检查网络后重试。"; }
            if(error!=null) { version=null; url=null; notes=""; }
            Result result=new Result(version,url,notes,error);
            long now=System.currentTimeMillis();
            String status=error!=null?"上次检查失败："+error:version!=null?"发现新版本 "+version:"已检查，当前是最新版 "+current(c);
            prefs.edit().putLong("updateNextCheckAt",UpdateRules.nextCheck(now,error==null,retryAt))
                .putLong("updateRateLimitUntil",retryAt).putString("updateStatus",status).apply();
            ui.post(() -> {
                java.util.List<Callback> callbacks;
                synchronized(UpdateChecker.class) { callbacks=new java.util.ArrayList<>(waiting); waiting.clear(); checking=false; }
                for(Callback cb:callbacks) cb.done(result);
            });
        }, "pet-update-check").start();
    }
    static long download(Context c, String version, String url) {
        DownloadManager dm = c.getSystemService(DownloadManager.class);
        DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url))
            .setTitle("梨间雪桌宠 " + version)
            .setDescription("下载好后点这里安装新版本")
            .setMimeType("application/vnd.android.package-archive")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalFilesDir(c, Environment.DIRECTORY_DOWNLOADS, "lijianxue-" + version + ".apk");
        long id = dm.enqueue(req);
        c.getSharedPreferences("pets", Context.MODE_PRIVATE).edit().putLong("updateDownload", id).apply();
        return id;
    }
    /** DownloadManager status of our download, or -1 if it is gone. */
    static int status(Context c, long id) {
        try (android.database.Cursor q = c.getSystemService(DownloadManager.class).query(new DownloadManager.Query().setFilterById(id))) {
            return q != null && q.moveToFirst() ? q.getInt(q.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS)) : -1;
        }
    }
    /** Opens the system installer for a finished download; returns false if it is not ready. */
    static boolean install(Context c, long id) {
        DownloadManager dm = c.getSystemService(DownloadManager.class);
        Uri uri = dm.getUriForDownloadedFile(id);
        if (uri == null) return false;
        c.getSharedPreferences("pets", Context.MODE_PRIVATE).edit().remove("updateDownload").apply();
        c.startActivity(new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK));
        return true;
    }
}

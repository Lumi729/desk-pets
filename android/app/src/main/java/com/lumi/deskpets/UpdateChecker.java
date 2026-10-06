package com.lumi.deskpets;

import android.app.DownloadManager;
import android.content.*;
import android.net.Uri;
import android.os.*;
import org.json.*;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** Checks this repo's Android releases on GitHub; only network use in the app. Downloads via the system, installs only after the user confirms. */
final class UpdateChecker {
    interface Callback { void done(String version, String url); }
    private static final String API = "https://api.github.com/repos/Lumi729/desk-pets/releases?per_page=30";
    private UpdateChecker() {}
    static String current(Context c) {
        try { return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionName; } catch (Exception e) { return ""; }
    }
    /** Automatic checks: only when switched on, at most every 12 hours. */
    static boolean due(SharedPreferences p) {
        return p.getBoolean("autoUpdate", false) && System.currentTimeMillis() - p.getLong("updateCheckedAt", 0) > 12 * 3600_000L;
    }
    /** Calls back on the main thread with (version, apkUrl) of a newer release, or (null, null). */
    static void check(Context context, Callback callback) {
        Context c = context.getApplicationContext();
        Handler ui = new Handler(Looper.getMainLooper());
        c.getSharedPreferences("pets", Context.MODE_PRIVATE).edit().putLong("updateCheckedAt", System.currentTimeMillis()).apply();
        new Thread(() -> {
            String version = null, url = null;
            try {
                HttpURLConnection con = (HttpURLConnection) new URL(API).openConnection();
                con.setConnectTimeout(8000); con.setReadTimeout(8000);
                con.setRequestProperty("Accept", "application/vnd.github+json");
                try (InputStream in = con.getInputStream()) {
                    ByteArrayOutputStream bytes = new ByteArrayOutputStream(); byte[] buf = new byte[8192]; int n;
                    while ((n = in.read(buf)) != -1) bytes.write(buf, 0, n);
                    JSONArray list = new JSONArray(bytes.toString(StandardCharsets.UTF_8.name()));
                    String best = current(c);
                    for (int i = 0; i < list.length(); i++) {
                        JSONObject r = list.getJSONObject(i);
                        String tag = r.optString("tag_name");
                        if (r.optBoolean("draft") || !tag.startsWith(UpdateRules.TAG_PREFIX) || !UpdateRules.newer(tag, best)) continue;
                        JSONArray assets = r.optJSONArray("assets");
                        for (int j = 0; assets != null && j < assets.length(); j++) {
                            String link = assets.getJSONObject(j).optString("browser_download_url");
                            if (UpdateRules.trustedApk(link)) { version = tag.substring(UpdateRules.TAG_PREFIX.length()); url = link; best = tag; break; }
                        }
                    }
                } finally { con.disconnect(); }
            } catch (Exception ignored) { version = url = null; }
            String v = version, u = url;
            ui.post(() -> callback.done(v, u));
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

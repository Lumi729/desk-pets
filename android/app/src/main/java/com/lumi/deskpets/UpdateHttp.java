package com.lumi.deskpets;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;

/** Public GitHub requests only; no credentials or device/input data. */
final class UpdateHttp {
    static final class Failure extends IOException {
        final long retryAt;
        Failure(String message, long retryAt) { super(message); this.retryAt = retryAt; }
    }
    static String get(String url, int timeout) throws IOException {
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        con.setConnectTimeout(timeout); con.setReadTimeout(timeout); con.setUseCaches(false);
        con.setRequestProperty("Accept", "application/vnd.github+json");
        con.setRequestProperty("User-Agent", "Lijianxue-Android-Updater");
        con.setRequestProperty("Cache-Control", "no-cache");
        try {
            int status = con.getResponseCode();
            if (status != 200) {
                boolean limited = status == 429 || (status == 403 &&
                    ("0".equals(con.getHeaderField("X-RateLimit-Remaining")) || con.getHeaderField("Retry-After") != null));
                long retryAt = 0;
                if (limited) {
                    long now = System.currentTimeMillis();
                    retryAt = now + UpdateRules.FAILURE_INTERVAL;
                    try { retryAt = Math.max(retryAt, Math.multiplyExact(Long.parseLong(con.getHeaderField("X-RateLimit-Reset")), 1000L)); } catch (RuntimeException ignored) {}
                    try { retryAt = Math.max(retryAt, Math.addExact(now, Math.multiplyExact(Long.parseLong(con.getHeaderField("Retry-After")), 1000L))); } catch (RuntimeException ignored) {}
                    retryAt = Math.min(retryAt, now + 24 * 3600_000L);
                }
                throw new Failure(limited ? "GitHub 暂时限制了更新检查次数，请稍后重试。" : "更新服务器返回 HTTP " + status + "，未能确认是否有新版。", retryAt);
            }
            try (InputStream in = con.getInputStream(); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
                byte[] buf = new byte[8192]; int n;
                while ((n = in.read(buf)) != -1) {
                    if (bytes.size() + n > 4 * 1024 * 1024) throw new IOException("Update response too large");
                    bytes.write(buf, 0, n);
                }
                return bytes.toString(StandardCharsets.UTF_8.name());
            }
        } finally { con.disconnect(); }
    }
    private UpdateHttp() {}
}

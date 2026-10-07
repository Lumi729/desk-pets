package com.lumi.deskpets;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Calendar;
import java.util.Locale;

/** Opt-in weather via open-meteo: only the chosen county's coordinates leave the phone. No location permission. */
final class WeatherCompanion {
    // 默认：湖南省长沙市市中心（和电脑版一样）
    static final String DEFAULT_PLACE = "湖南省 · 长沙市";
    static final float DEFAULT_LAT = 28.2281f, DEFAULT_LON = 112.9389f;
    private static final long EVERY = 30 * 60_000L;
    volatile int code = -1;
    volatile double temperature = Double.NaN;
    private long lastTry;
    private String lastPlace = "";
    private final Context context;
    WeatherCompanion(Context c) { context = c.getApplicationContext(); }
    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("pets", Context.MODE_PRIVATE); }
    static String place(SharedPreferences p) { return p.getString("weatherPlace", DEFAULT_PLACE); }
    /** Background thread only. Checks at most every 30 minutes (or right away after the place changes). */
    void poll(boolean active) {
        SharedPreferences p = prefs(context);
        if (!active || !p.getBoolean("weather", false)) return;
        float lat = p.getFloat("weatherLat", DEFAULT_LAT), lon = p.getFloat("weatherLon", DEFAULT_LON);
        String key = lat + "," + lon;
        long now = System.currentTimeMillis();
        if (key.equals(lastPlace) && now - lastTry < EVERY) return;
        lastPlace = key; lastTry = now;
        try {
            String url = String.format(Locale.ROOT, "https://api.open-meteo.com/v1/forecast?latitude=%.4f&longitude=%.4f&current=temperature_2m,weather_code&timezone=auto", lat, lon);
            HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
            con.setConnectTimeout(8000); con.setReadTimeout(8000);
            JSONObject current;
            try (InputStream in = con.getInputStream()) {
                ByteArrayOutputStream bytes = new ByteArrayOutputStream(); byte[] buf = new byte[4096]; int n;
                while ((n = in.read(buf)) != -1) bytes.write(buf, 0, n);
                current = new JSONObject(bytes.toString(StandardCharsets.UTF_8.name())).getJSONObject("current");
            } finally { con.disconnect(); }
            code = current.getInt("weather_code");
            temperature = current.isNull("temperature_2m") ? Double.NaN : current.getDouble("temperature_2m");
            String temp = Double.isNaN(temperature) ? "" : String.format(Locale.ROOT, " · %.0f°C", temperature);
            p.edit().putString("weatherNow", Weather.describe(code) + temp).apply();
        } catch (Exception e) {
            code = -1; temperature = Double.NaN; // 查不到就用普通待机，不弹错
            p.edit().putString("weatherNow", "暂时查不到天气，先用普通待机").apply();
        }
    }
    void clear() { code = -1; temperature = Double.NaN; lastPlace = ""; }
    /** Current weather idle (null = none). */
    String idle() { return Weather.idle(code, temperature, Calendar.getInstance().get(Calendar.HOUR_OF_DAY)); }
    static String season() { return Weather.season(Calendar.getInstance().get(Calendar.MONTH) + 1); }

    /** Regions shared with the desktop: [[省, [[市, [[区县, 纬度, 经度], ...]], ...]], ...] */
    static JSONArray regions(Context c) throws Exception {
        try (InputStream in = c.getAssets().open("regions.json")) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream(); byte[] buf = new byte[16384]; int n;
            while ((n = in.read(buf)) != -1) bytes.write(buf, 0, n);
            return new JSONArray(bytes.toString(StandardCharsets.UTF_8.name()));
        }
    }
}

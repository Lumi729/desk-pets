package com.lumi.deskpets;

import java.util.HashMap;
import java.util.Map;

/** Same rules as the desktop's lib/weather.js; pure so the JVM tests can check them. */
final class Weather {
    private Weather() {}
    private static final Map<Integer, String> DESCRIPTIONS = new HashMap<>();
    private static final Map<Integer, String> IDLE_BY_CODE = new HashMap<>();
    private static void describe(String text, int... codes) { for (int c : codes) DESCRIPTIONS.put(c, text); }
    private static void put(String idle, int... codes) { for (int c : codes) IDLE_BY_CODE.put(c, idle); }
    static {
        describe("晴", 0); describe("基本晴朗", 1); describe("多云", 2); describe("阴", 3); describe("雾", 45); describe("雾凇", 48);
        describe("小毛毛雨", 51); describe("毛毛雨", 53); describe("大毛毛雨", 55); describe("冻毛毛雨", 56, 57);
        describe("小雨", 61); describe("中雨", 63); describe("大雨", 65); describe("冻雨", 66); describe("大冻雨", 67);
        describe("小雪", 71); describe("中雪", 73); describe("大雪", 75); describe("米雪", 77); describe("阵雨", 80); describe("中阵雨", 81); describe("强阵雨", 82);
        describe("阵雪", 85); describe("大阵雪", 86); describe("雷雨", 95); describe("雷雨带冰雹", 96); describe("雷雨带大冰雹", 99);
        put("待机_多云", 2); put("待机_阴天", 3); put("待机_雾", 45, 48);
        put("待机_毛毛雨", 51, 53, 55, 56, 57); put("待机_雨天", 61, 80);
        put("待机_大雨", 63, 65, 66, 67, 81, 82); put("待机_下雪", 71, 73, 75, 77, 85, 86); put("待机_雷雨", 95, 96, 99);
    }
    /** 雨、雪、雾、雷雨、炎热、降温：比季节换装优先。 */
    static final String[] SPECIAL = {"待机_毛毛雨", "待机_雨天", "待机_大雨", "待机_雷雨", "待机_下雪", "待机_雾", "待机_炎热", "待机_降温"};
    /** Every weather / season idle, in the order the demo plays them. */
    static final String[] ALL = {"待机_晴天", "待机_晴夜", "待机_多云", "待机_阴天", "待机_雾", "待机_毛毛雨", "待机_雨天", "待机_大雨",
        "待机_雷雨", "待机_下雪", "待机_降温", "待机_炎热", "待机_春", "待机_夏", "待机_秋", "待机_冬"};
    static String describe(int code) { String d = DESCRIPTIONS.get(code); return d == null ? "未知天气" : d; }
    static boolean isRain(int code) { String i = IDLE_BY_CODE.get(code); return i != null && (i.equals("待机_毛毛雨") || i.equals("待机_雨天") || i.equals("待机_大雨") || i.equals("待机_雷雨")); }
    static boolean isSnow(int code) { return "待机_下雪".equals(IDLE_BY_CODE.get(code)); }
    /** Weather idle for a code and temperature (NaN = unknown) at an hour 0–23; null = normal idle. */
    static String idle(int code, double temperature, int hour) {
        if (code < 0) return null;
        if (!isRain(code) && !isSnow(code) && !Double.isNaN(temperature)) {
            if (temperature < 10) return "待机_降温";
            if (temperature > 32) return "待机_炎热";
        }
        if (code == 0 || code == 1) return hour >= 6 && hour < 19 ? "待机_晴天" : "待机_晴夜";
        return IDLE_BY_CODE.get(code);
    }
    /** month 1–12: 3–5 春, 6–8 夏, 9–11 秋, 12–2 冬. */
    static String season(int month) {
        return month >= 3 && month <= 5 ? "待机_春" : month >= 6 && month <= 8 ? "待机_夏" : month >= 9 && month <= 11 ? "待机_秋" : "待机_冬";
    }
    static boolean special(String idle) { for (String s : SPECIAL) if (s.equals(idle)) return true; return false; }
    /** Desktop priority: special weather > season > other weather > plain idle; only clips the pet has. */
    static String pick(String weatherIdle, String seasonIdle, java.util.function.Predicate<String> has) {
        if (weatherIdle != null && special(weatherIdle) && has.test(weatherIdle)) return weatherIdle;
        if (seasonIdle != null && has.test(seasonIdle)) return seasonIdle;
        if (weatherIdle != null && has.test(weatherIdle)) return weatherIdle;
        return "待机";
    }
    /** Demo label: 「待机_毛毛雨」→「毛毛雨」. */
    static String label(String idle) { return idle.startsWith("待机_") ? idle.substring(3) : idle; }
}

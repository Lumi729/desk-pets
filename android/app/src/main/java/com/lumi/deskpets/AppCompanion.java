package com.lumi.deskpets;

import java.util.Map;

/** Pure app classification. No text, keys, URLs or screenshots are involved. */
final class AppCompanion {
    static final String[] MODES = {"auto", "none", "type", "video", "music"};
    static final String[] LABELS = {"自动判断", "不联动", "陪我打字", "一起看视频", "一起跳舞"};
    static String mode(String pkg, Map<String, ?> choices) {
        if (pkg == null || pkg.isEmpty()) return "none";
        Object saved = choices.get("app:" + pkg);
        if (saved instanceof String && !saved.equals("auto")) {
            for (String allowed : MODES) if (allowed.equals(saved)) return allowed;
        }
        switch (pkg) {
            case "com.tencent.mm": case "com.tencent.mobileqq":
            case "com.openai.chatgpt": case "com.anthropic.claude":
            case "org.telegram.messenger": case "com.discord":
                return "type";
            case "tv.danmaku.bili": case "com.bilibili.app.in":
            case "com.google.android.youtube": case "com.ss.android.ugc.aweme":
            case "com.ss.android.ugc.trill": case "com.zhiliaoapp.musically":
            case "com.netflix.mediaclient": case "com.tencent.qqlive":
            case "com.qiyi.video": case "com.youku.phone":
                return "video";
            case "com.netease.cloudmusic": case "com.tencent.qqmusic":
            case "com.spotify.music": case "com.apple.android.music":
            case "com.google.android.apps.youtube.music": case "com.kugou.android":
                return "music";
            default: return "none";
        }
    }
    static String clip(String mode) {
        switch (mode) {
            case "type": return "敲代码";
            case "video": return "看视频";
            case "music": return "跳舞";
            default: return "";
        }
    }
    // Event values 1 and 2 are MOVE_TO_FOREGROUND / BACKGROUND on API 26,
    // renamed ACTIVITY_RESUMED / PAUSED on newer Android.
    static final class Foreground {
        String pkg = "";
        long time;
        void accept(int event, String name, long at) {
            if (at < time) return;
            if (event == 1) { pkg = name == null ? "" : name; time = at; }
            else if (event == 2 && pkg.equals(name)) { pkg = ""; time = at; }
            else if (event == 15 || event == 17 || event == 26) { clear(); time = at; }
        }
        void clear() { pkg = ""; time = 0; }
    }
}

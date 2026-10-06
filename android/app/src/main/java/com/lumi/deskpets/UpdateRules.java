package com.lumi.deskpets;

/** Pure version rules for the in-app update check (shared with JVM tests). */
final class UpdateRules {
    private UpdateRules() {}
    static final String TAG_PREFIX = "android-v";
    /** "0.5-preview" → {0,5}; anything unparsable → empty (never newer). */
    static int[] parse(String version) {
        if (version == null) return new int[0];
        String v = version.startsWith(TAG_PREFIX) ? version.substring(TAG_PREFIX.length()) : version;
        int dash = v.indexOf('-'); if (dash >= 0) v = v.substring(0, dash);
        if (!v.matches("[0-9]+(\\.[0-9]+)*")) return new int[0];
        String[] parts = v.split("\\.");
        int[] out = new int[parts.length];
        try { for (int i = 0; i < parts.length; i++) out[i] = Integer.parseInt(parts[i]); } catch (NumberFormatException e) { return new int[0]; }
        return out;
    }
    static boolean newer(String candidate, String current) {
        int[] a = parse(candidate), b = parse(current);
        if (a.length == 0 || b.length == 0) return false;
        for (int i = 0; i < Math.max(a.length, b.length); i++) {
            int x = i < a.length ? a[i] : 0, y = i < b.length ? b[i] : 0;
            if (x != y) return x > y;
        }
        return false;
    }
    /** Only our own GitHub release downloads are accepted. */
    static boolean trustedApk(String url) {
        return url != null && url.startsWith("https://github.com/Lumi729/desk-pets/releases/download/" + TAG_PREFIX) && url.endsWith(".apk");
    }
}

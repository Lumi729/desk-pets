package com.lumi.deskpets;

/** Pure hanging policy and geometry for the pixel island (shared with JVM tests). */
final class IslandHang {
    private IslandHang() {}
    /** Typing always wins, including during an explicit hanging demo. */
    static boolean allowed(boolean enabled, long now, long demoUntil, String mode, boolean mediaShown) {
        if ("type".equals(mode)) return false;
        boolean demo = now < demoUntil;
        return (enabled || demo) && (demo || !(mediaShown || "video".equals(mode) || "music".equals(mode)));
    }
    /** Island art is 70px tall drawn in 10px blocks; pick a whole-pixel block so nearest scaling stays crisp. */
    static int block(float density) { return Math.max(1, Math.round(44 * density / 7f)); }
    static int percent(int value) { return Math.max(60, Math.min(140, value)); }
    static int scaledBlock(float density, int percent, int screenHeight) {
        return Math.min(Math.max(1, screenHeight / 7), block(density * percent(percent) / 100f));
    }
    static int width(float density, int percent, int screenWidth) { return Math.max(1, Math.min(screenWidth, Math.round(270 * density * percent(percent) / 100f))); }
    static int limit(int position, int screen, int size) { return Math.max(0, Math.min(Math.max(0, screen - size), position)); }
    static int position(float fraction, int screen, int size, int fallback) {
        if (!Float.isFinite(fraction) || fraction < 0) return limit(fallback, screen, size);
        return limit(Math.round(Math.min(1, fraction) * Math.max(0, screen - size)), screen, size);
    }
    static float fraction(int position, int screen, int size) { return screen <= size ? 0 : limit(position, screen, size) / (float)(screen - size); }
    static boolean dragged(float dx, float dy, int slop) { return dx * dx + dy * dy > slop * slop; }
    static int height(int block) { return block * 7; }
    /** Left/right caps are 40px wide (4 art blocks) and never stretch. */
    static int cap(int block) { return block * 4; }
    /** Overlay x for a pet centred under the island. */
    static float x(int islandLeft, int islandWidth, int unit, int width) {
        return Math.max(0, Math.min(width - unit, islandLeft + (islandWidth - unit) / 2f));
    }
    /** Overlay y so the GIF's top row (paws / ears) tucks a little over the island's bottom edge. */
    static float y(int islandBottom, float contentTop, int overlap) {
        return Math.max(0, islandBottom - overlap - contentTop);
    }
}

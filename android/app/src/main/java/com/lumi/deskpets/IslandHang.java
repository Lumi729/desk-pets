package com.lumi.deskpets;

/** Pure geometry for the pixel island and the pet hanging under it (shared with JVM tests). */
final class IslandHang {
    private IslandHang() {}
    /** Island art is 70px tall drawn in 10px blocks; pick a whole-pixel block so nearest scaling stays crisp. */
    static int block(float density) { return Math.max(1, Math.round(44 * density / 7f)); }
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

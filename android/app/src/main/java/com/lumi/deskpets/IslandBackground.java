package com.lumi.deskpets;

import android.content.Context;
import android.graphics.*;
import android.graphics.drawable.Drawable;
import java.io.InputStream;

/** Pixel capsule from three PNGs: fixed left/right caps, middle tiled horizontally, nearest-neighbour scaling. */
final class IslandBackground extends Drawable {
    private final Bitmap left, middle, right;
    private final Paint pixels = new Paint();
    private final Paint tile = new Paint();
    private final int block;
    private IslandBackground(Bitmap l, Bitmap m, Bitmap r, int block) {
        left = l; middle = m; right = r; this.block = block;
        pixels.setFilterBitmap(false); pixels.setAntiAlias(false); pixels.setDither(false);
        tile.setFilterBitmap(false); tile.setAntiAlias(false);
        tile.setShader(new BitmapShader(m, Shader.TileMode.REPEAT, Shader.TileMode.CLAMP));
    }
    /** Returns null when the island art is missing, so callers keep the plain fallback. */
    static IslandBackground load(Context c, Catalog catalog, int block) {
        if (catalog == null || catalog.island == null) return null;
        Bitmap l = read(c, catalog.island.optString("left")), m = read(c, catalog.island.optString("middle")), r = read(c, catalog.island.optString("right"));
        return l == null || m == null || r == null ? null : new IslandBackground(l, m, r, block);
    }
    /** 美化主题里的三段灵动岛图（Claude）；缺图就返回 null，调用方退回素材包里的默认图。 */
    static IslandBackground load(ThemeStore.Theme theme, int block) {
        if (theme == null) return null;
        Bitmap l = theme.bitmap("island_left.png"), m = theme.bitmap("island_middle.png"), r = theme.bitmap("island_right.png");
        return l == null || m == null || r == null ? null : new IslandBackground(l, m, r, block);
    }
    private static Bitmap read(Context c, String asset) {
        if (asset == null || asset.isEmpty()) return null;
        try (InputStream in = c.getAssets().open(asset)) { return BitmapFactory.decodeStream(in); } catch (Exception e) { return null; }
    }
    /** Width of one fixed cap on screen; text sits between the caps. */
    int capWidth() { return Math.round(left.getWidth() * scale()); }
    private float scale() { return IslandHang.height(block) / (float) left.getHeight(); }
    @Override public void draw(Canvas canvas) {
        Rect b = getBounds(); float s = b.height() / (float) left.getHeight();
        int lw = Math.round(left.getWidth() * s), rw = Math.round(right.getWidth() * s);
        canvas.drawBitmap(left, null, new Rect(b.left, b.top, b.left + lw, b.bottom), pixels);
        canvas.drawBitmap(right, null, new Rect(b.right - rw, b.top, b.right, b.bottom), pixels);
        if (b.width() > lw + rw) {
            Matrix m = new Matrix(); m.setScale(s, b.height() / (float) middle.getHeight()); m.postTranslate(b.left + lw, b.top);
            tile.getShader().setLocalMatrix(m);
            canvas.drawRect(b.left + lw, b.top, b.right - rw, b.bottom, tile);
        }
    }
    @Override public void setAlpha(int alpha) { pixels.setAlpha(alpha); tile.setAlpha(alpha); }
    @Override public void setColorFilter(ColorFilter filter) { pixels.setColorFilter(filter); tile.setColorFilter(filter); }
    @Override public int getOpacity() { return PixelFormat.TRANSLUCENT; }
}

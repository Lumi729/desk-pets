package com.lumi.deskpets;

import android.app.AppOpsManager;
import android.app.KeyguardManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.os.Process;

/** Queried off the UI thread, only while the user-enabled overlay is visible. */
final class UsageCompanion {
    private final Context context;
    private final AppCompanion.Foreground foreground = new AppCompanion.Foreground();
    private long lastQuery;
    UsageCompanion(Context c) { context = c; }
    @SuppressWarnings("deprecation")
    static boolean allowed(Context c) {
        try {
            return c.getSystemService(AppOpsManager.class).checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), c.getPackageName()) == AppOpsManager.MODE_ALLOWED;
        } catch (RuntimeException e) { return false; }
    }
    void clear() { lastQuery = 0; foreground.clear(); }
    String poll() {
        if (!allowed(context) || context.getSystemService(KeyguardManager.class).isKeyguardLocked()) {
            clear(); return "none";
        }
        long now = System.currentTimeMillis();
        long start = lastQuery == 0 || now < lastQuery ? now - 120000 : lastQuery;
        if (now < lastQuery) foreground.clear();
        try {
            UsageEvents events = context.getSystemService(UsageStatsManager.class).queryEvents(start, now);
            if (events == null) { clear(); return "none"; }
            UsageEvents.Event event = new UsageEvents.Event();
            while (events.hasNextEvent()) {
                events.getNextEvent(event);
                foreground.accept(event.getEventType(), event.getPackageName(), event.getTimeStamp());
            }
            lastQuery = now;
            return AppCompanion.mode(foreground.pkg, context.getSharedPreferences("pets", Context.MODE_PRIVATE).getAll());
        } catch (RuntimeException e) { clear(); return "none"; }
    }
}

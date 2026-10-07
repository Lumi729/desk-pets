package com.lumi.deskpets;

import java.util.*;

/** Same rule as renderer/teases.js replyFor (data comes from catalog.json, generated from teases.js). */
final class TeaseRules {
    private TeaseRules() {}
    /** Reply steps for this tease; more than `limit` teases within `window` ms → 投降. null = not a known tease. */
    static List<String> reply(Map<String, List<String>> replies, String tease, List<Long> history, long now, long window, int limit) {
        if (replies == null || !replies.containsKey(tease)) return null;
        int recent = 0;
        for (long t : history) if (now - t < window) recent++;
        if (recent >= limit) return Collections.singletonList("投降");
        return replies.get(tease);
    }
}

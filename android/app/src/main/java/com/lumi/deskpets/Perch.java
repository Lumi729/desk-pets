package com.lumi.deskpets;

import java.util.List;

/** Screen geometry only; shared with the standalone JVM regression checks. */
final class Perch {
    final int left, top, right;
    Perch(int l, int t, int r) { left=l; top=t; right=r; }
    boolean fits(int unit, int floor) { return right-left >= unit*.5f && top>=unit && top-unit<=floor; }
    float x(int unit, int width) { return Math.max(0,Math.min(width-unit,(left+right-unit)/2f)); }
    boolean near(Perch p) { return Math.abs(left-p.left)<12 && Math.abs(top-p.top)<12 && Math.abs(right-p.right)<12; }
    static Perch below(List<Perch> choices, Perch current, int unit, int floor) {
        Perch best=null;
        for(Perch p:choices) if(p.fits(unit,floor) && (current==null || p.top>current.top+12)
            && (best==null || p.top<best.top)) best=p;
        return best;
    }
    static boolean typing(long now, long lastInput) { return lastInput>0 && now>=lastInput && now-lastInput<1600; }
}

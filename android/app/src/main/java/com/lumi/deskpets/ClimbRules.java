package com.lumi.deskpets;

/** 歪手机爬墙（Claude）：倾斜多少算歪、歪多久才爬、爬到多高，纯规则方便测试。 */
final class ClimbRules {
    private ClimbRules(){}
    /** 歪过这个程度才算（ShakeCompanion.tilt 是 -1～1，负数是往左歪）。 */
    static final float TILT=.35f;
    /** 摆回这个程度以内，才能再触发下一次。 */
    static final float REARM=.15f;
    /** 一直歪着这么久才去爬，手抖不算。 */
    static final long HOLD=1200;
    /** -1 往左歪，1 往右歪，0 没歪够。 */
    static int side(float tilt){return tilt<=-TILT?-1:tilt>=TILT?1:0;}
    static boolean rearm(float tilt){return Math.abs(tilt)<REARM;}
    /** 爬到屏幕上半部分：窗口顶边停在屏幕高度的 22% 处。 */
    static float top(int height){return Math.max(0,height*.22f);}
    /** 贴哪边：左边窗口左缘对齐屏幕左边，右边窗口右缘对齐屏幕右边（画布已经贴好边，不用再偏移）。 */
    static float edgeX(int side,int screenWidth,int windowWidth){return side<0?0:Math.max(0,screenWidth-windowWidth);}
    static String climbClip(int side){return side<0?"沿左边向上爬":"沿右边向上爬";}
    static String peekClip(int side){return side<0?"左边探头":"右边探头";}
}

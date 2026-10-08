package com.lumi.deskpets;

/** 住在屏幕边（Claude）：能待的高度、下一次去哪、拖到哪算贴边，纯规则方便测试。 */
final class EdgeRules {
    private EdgeRules(){}
    /** 多久换一次位置。 */
    static final long WANDER_MIN=20_000,WANDER_SPAN=25_000;
    /** 换位置时有这么大机会换到另一边（先掉到地面走过去再爬上去）。 */
    static final float SWITCH=.2f;
    /**
     * 窗口顶边能待的范围 {最高, 最低}：屏幕中间，避开顶部状态栏 / 灵动岛（上面 20%）和底部导航条（下面 22%）；
     * 键盘弹出时整只都在键盘上面。keyboardTop 为 -1 表示没有键盘。
     */
    static float[] band(int height,int keyboardTop,int unit){
        float min=height*.2f,bottom=height*.78f;
        if(keyboardTop>=0)bottom=Math.min(bottom,keyboardTop-unit*.2f);
        float max=bottom-unit;
        if(max<min)max=min;
        return new float[]{min,max};
    }
    static float clamp(float y,float[] band){return Math.max(band[0],Math.min(band[1],y));}
    /** 下一个高度：随机挑一个，和现在离得太近就换到对称的位置。 */
    static float next(double random,float[] band,float current,int unit){
        float y=band[0]+(float)random*(band[1]-band[0]);
        if(Math.abs(y-current)<unit*.8f)y=band[0]+band[1]-y;
        return clamp(y,band);
    }
    /** 拖着松手时贴在哪边：中心离左边 / 右边不到 0.8 只宽就算贴上；-1 左，1 右，0 都不是。 */
    static int dropSide(float centerX,int width,int unit){
        if(centerX<unit*.8f)return -1;
        if(centerX>width-unit*.8f)return 1;
        return 0;
    }
    /** 往下爬没有动画就用往上爬的。 */
    static String moveClip(int side,boolean up,boolean hasDown){return up||!hasDown?ClimbRules.climbClip(side):(side<0?"沿左边向下爬":"沿右边向下爬");}
}

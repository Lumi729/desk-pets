package com.lumi.deskpets;
/** Conservative hints; a notification is never treated as proof of delivery. */
final class DeliveryRules {
    static boolean supported(String pkg) {
        return "me.ele".equals(pkg)||"com.sankuai.meituan.takeoutnew".equals(pkg)||"com.sankuai.meituan".equals(pkg);
    }
    static String hint(String text) {
        if(text==null)return "";
        // Discounts, estimates, pickup invitations and questions must not become arrival claims.
        if(text.contains("预计")||text.contains("即将")||text.contains("还有")||text.contains("未送达")||text.contains("尚未")||text.contains("优惠")||text.contains("红包")||text.contains("吗")||text.contains("?"))return "";
        if(text.contains("已送达")||text.contains("已放至")||text.contains("已放在")||text.contains("已存入"))return "外卖通知：请查看取餐信息";
        if(text.contains("骑手已到")||text.contains("骑手到达")||text.contains("请取餐"))return "外卖通知：骑手提醒你取餐";
        return "";
    }
    /** 外卖通知检查（Claude）：把一条通知能读到的字段排成几行给千千看；空的写「（没有）」。只在屏幕上显示。 */
    static String inspect(String app,String time,CharSequence title,CharSequence text,CharSequence sub,CharSequence big,boolean ongoing,int progress,int max,boolean indeterminate){
        String bar=indeterminate?"有进度条（不确定进度）":max>0?"有进度条 "+progress+" / "+max:"（没有）";
        return "【"+app+" · "+time+"】\n标题："+orNone(title)+"\n正文："+orNone(text)+"\n子文本："+orNone(sub)+"\n大文本："+orNone(big)+"\n常驻："+(ongoing?"是":"否")+"\n进度条："+bar;
    }
    private static String orNone(CharSequence s){return s==null||s.toString().trim().isEmpty()?"（没有）":s.toString().trim();}
}

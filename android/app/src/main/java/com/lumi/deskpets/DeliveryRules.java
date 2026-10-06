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
}

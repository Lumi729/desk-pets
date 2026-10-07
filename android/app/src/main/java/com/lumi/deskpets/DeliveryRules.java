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
    static String inspect(String app,String pkg,String time,String channel,String category,boolean ongoing,CharSequence title,CharSequence text,CharSequence sub,CharSequence big,int progress,int max,boolean indeterminate,String keys){
        String bar=indeterminate?"有进度条（不确定进度）":max>0?"有进度条 "+progress+" / "+max:"（没有）";
        return "【"+app+" · "+time+"】\n包名："+orNone(pkg)+"\nchannel："+orNone(channel)+"\ncategory："+orNone(category)+"\n常驻："+(ongoing?"是":"否")
            +"\n标题："+orNone(title)+"\n正文："+orNone(text)+"\n子文本："+orNone(sub)+"\n大文本："+orNone(big)+"\n进度条："+bar+"\nextras 键名："+orNone(keys);
    }
    private static String orNone(CharSequence s){return s==null||s.toString().trim().isEmpty()?"（没有）":s.toString().trim();}

    // ---- 外卖进度（Claude）：只靠通知里看得到的字，读不到就不显示，不猜 ----
    private static final String[] WORDS={"送达","骑手","取餐","配送","商家"};
    /** 标题或正文里有这些字，就当作可能是外卖通知（检查工具和进度都用）。 */
    static boolean looksLike(CharSequence... parts){
        for(CharSequence part:parts)if(part!=null)for(String w:WORDS)if(part.toString().contains(w))return true;
        return false;
    }
    private static final java.util.regex.Pattern ETA=java.util.regex.Pattern.compile("预计[^0-9:：]{0,6}(?:\\d{1,2}月\\d{1,2}日)?[^0-9:：]{0,4}(\\d{1,2})[:：](\\d{2})\\s*(?:前|左右)?\\s*送达");
    /** 「预计10月8日 00:11送达」→ 当天第几分钟（0～1439）；没有就 -1。 */
    static int etaMinute(CharSequence s){
        if(s==null)return -1;
        java.util.regex.Matcher m=ETA.matcher(s);if(!m.find())return -1;
        int h=Integer.parseInt(m.group(1)),min=Integer.parseInt(m.group(2));
        return h<24&&min<60?h*60+min:-1;
    }
    /** 离预计时间还有几分钟（跨午夜也算对）；过了是负数。 */
    static int minutesLeft(int eta,int now){int d=eta-now;if(d<-720)d+=1440;if(d>720)d-=1440;return d;}
    /** 已经送到 / 完成 / 取消了，提示条就收起来。 */
    static boolean done(CharSequence... parts){
        for(CharSequence part:parts)if(part!=null){String t=part.toString();
            if(t.contains("已送达")||t.contains("订单已完成")||t.contains("已完成")||t.contains("已取消")||t.contains("订单取消"))return true;}
        return false;
    }
    /** 正文最后一小句（不算写距离的那句）当作现在的进度，比如「商家正在备餐，骑手正赶往商家」→「骑手正赶往商家」。 */
    static String status(CharSequence text){
        if(text==null)return "";
        String[] parts=text.toString().split("[，,；;。\\n]");
        for(int i=parts.length-1;i>=0;i--){String t=parts[i].trim();if(!t.isEmpty()&&!DISTANCE.matcher(t).find())return t.length()>16?t.substring(0,16):t;}
        return "";
    }
    private static final java.util.regex.Pattern DISTANCE=java.util.regex.Pattern.compile("距[离你您]{0,2}[^0-9]{0,3}(\\d+(?:\\.\\d+)?)\\s*(公里|千米|km|KM|米|m(?![a-zA-Z]))");
    /** 通知里写了「距你 800 米」之类才有距离；没有就空。 */
    static String distance(CharSequence... parts){
        for(CharSequence part:parts)if(part!=null){java.util.regex.Matcher m=DISTANCE.matcher(part);
            if(m.find()){String u=m.group(2);return m.group(1)+(u.equals("米")||u.equals("m")?"米":"公里");}}
        return "";
    }
    /** 灵动岛上的一行：「🛵 还有 N 分钟 · 骑手正赶往商家」；读不到预计时间或已经送到就空。 */
    static String label(CharSequence title,CharSequence text,int now){
        if(done(title,text))return "";
        int eta=etaMinute(title);if(eta<0)eta=etaMinute(text);if(eta<0)return "";
        int left=minutesLeft(eta,now);
        StringBuilder b=new StringBuilder(left>0?"🛵 还有 "+left+" 分钟":String.format(java.util.Locale.ROOT,"🛵 预计 %02d:%02d 送达",eta/60,eta%60));
        String far=distance(title,text);if(!far.isEmpty())b.append(" · ").append(far);
        String st=status(text);if(!st.isEmpty())b.append(" · ").append(st);
        return b.toString();
    }
}

package com.lumi.deskpets;

/** 过节、生日、在一起多少天、时间提醒、小窝作息（Claude）：照电脑版 lib/calendar.js、lib/diary.js 和 renderer/pets.js，纯规则方便测试。 */
final class CalendarRules {
    private CalendarRules(){}
    /**
     * 国庆 10/1–10/7，万圣节 10/31，圣诞 12/24–12/25，春节 除夕到正月初七；没有就 null。
     * 农历由调用方算好传进来：今天 / 明天的农历月、日，闰月算 0（不算正月）。
     */
    static String festival(int month,int day,int lunarMonth,int lunarDay,int tomorrowLunarMonth,int tomorrowLunarDay){
        if(month==10&&day>=1&&day<=7)return "国庆";
        if(month==10&&day==31)return "万圣节";
        if(month==12&&(day==24||day==25))return "圣诞";
        if(lunarMonth==1&&lunarDay<=7)return "春节";
        if(tomorrowLunarMonth==1&&tomorrowLunarDay==1)return "春节"; // 除夕
        return null;
    }
    /** 生日写成「MM-DD」，比如 3/14、3月14日、03-14 都认；认不出来是空。 */
    static String normalizeBirthday(String text){
        if(text==null)return "";
        java.util.regex.Matcher m=java.util.regex.Pattern.compile("^(\\d{1,2})\\s*[-/.月]\\s*(\\d{1,2})\\s*日?$").matcher(text.trim());
        if(!m.find())return "";
        int month=Integer.parseInt(m.group(1)),day=Integer.parseInt(m.group(2));
        if(month<1||month>12||day<1||day>31)return "";
        return String.format(java.util.Locale.ROOT,"%02d-%02d",month,day);
    }
    static String monthDay(int month,int day){return String.format(java.util.Locale.ROOT,"%02d-%02d",month,day);}
    /** 第一次打开那天算第 1 天（日期用 epochDay）。 */
    static long daysTogether(long firstEpochDay,long todayEpochDay){return Math.max(1,todayEpochDay-firstEpochDay+1);}
    /** 纪念日：第 7、30、100、200 天，之后每满 365 天。 */
    static boolean isAnniversary(long n){return n==7||n==30||n==100||n==200||(n>=365&&n%365==0);}
    /** 半夜 0～5 点每 20 分钟催睡觉。 */
    static boolean nagNight(int hour){return hour<5;}
    static final long NIGHT_EVERY=20*60_000L;
    /** 吃饭提醒：11:50–12:30 是 0，17:50–18:30 是 1，其它时候 -1。 */
    static int meal(int minuteOfDay){
        if(minuteOfDay>=11*60+50&&minuteOfDay<=12*60+30)return 0;
        if(minuteOfDay>=17*60+50&&minuteOfDay<=18*60+30)return 1;
        return -1;
    }
    /** 小窝：晚上 11 点到早上 7 点是睡觉时间。 */
    static boolean night(int hour){return hour>=23||hour<7;}
    /** 窝里挤着睡：第 i 只（共 n 只）离小窝中间多远。 */
    static float nestOffset(int i,int n,float unit,float nestWidth){
        if(n<=1)return 0;
        float gap=Math.min(unit*.42f,nestWidth*.8f/(n-1));
        return (i-(n-1)/2f)*gap;
    }
}

package com.lumi.deskpets;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.view.*;
import android.widget.*;
import java.util.*;

public final class MainActivity extends Activity {
    private final Map<String,CheckBox> choices=new LinkedHashMap<>();
    private android.content.SharedPreferences prefs;
    private LinearLayout page;
    private SeekBar size;
    private Switch walking;
    private TextView usageStatus,interfaceStatus,weatherStatus,updateStatus;
    private boolean pendingStart;
    int dp(int value) { return Math.round(value*getResources().getDisplayMetrics().density); }
    // ---- 设置页（Claude，2026-10-09 照千千的设计稿重排）：顶部标题 / 权限提示 / 大按钮，其余收进 7 张可折叠卡片，颜色都来自美化主题 ----
    private ThemeStore.Theme theme;
    private int cBg,cPanel,cRim,cCard,cAccent,cAccentText,cText,cSub,cPageText,cPageSub,cTrack,block;
    private LinearLayout permissionBar;
    private TextView permissionText;
    private final List<Runnable> refreshers=new ArrayList<>(); // 回到设置页时更新摘要、权限状态
    private final Map<String,View[]> cards=new LinkedHashMap<>(); // key → {body, arrow}
    private static final String P_OVERLAY="overlay",P_ACCESS="access",P_NOTIFY="notify",P_USAGE="usage";
    private static final int IMPORT_THEME=41;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state); prefs=getSharedPreferences("pets",MODE_PRIVATE);
        theme=ThemeStore.current(this);int[] c=theme==null?ThemeRules.DEFAULT_COLORS:theme.colors;
        cBg=c[ThemeRules.index("background")];cPanel=c[ThemeRules.index("panel")];cRim=c[ThemeRules.index("rim")];cCard=c[ThemeRules.index("card")];cAccent=c[ThemeRules.index("accent")];cAccentText=c[ThemeRules.index("accentText")];
        cText=c[ThemeRules.index("text")];cSub=c[ThemeRules.index("subtext")];cPageText=c[ThemeRules.index("pageText")];cPageSub=c[ThemeRules.index("pageSubtext")];cTrack=c[ThemeRules.index("track")];
        block=Math.max(2,Math.round(getResources().getDisplayMetrics().density*2.5f));
        getWindow().setStatusBarColor(cBg);getWindow().setNavigationBarColor(cBg);
        if(PixelUi.light(cBg))getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|(Build.VERSION.SDK_INT>=26?View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR:0));
        ScrollView scroll=new ScrollView(this); scroll.setFillViewport(true); scroll.setBackgroundColor(cBg);
        page=new LinearLayout(this); page.setOrientation(LinearLayout.VERTICAL); page.setPadding(dp(18),dp(20),dp(18),dp(28)); scroll.addView(page); setContentView(scroll);
        if(Build.VERSION.SDK_INT>=30) scroll.setOnApplyWindowInsetsListener((v,insets)->{ android.graphics.Insets bars=insets.getInsets(android.view.WindowInsets.Type.systemBars()|android.view.WindowInsets.Type.displayCutout()); v.setPadding(bars.left,bars.top,bars.right,bars.bottom); return insets; });
        // Keep safe content padding on both gesture and three-button navigation.
        else scroll.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
        long today=java.time.LocalDate.now().toEpochDay();
        if(!prefs.contains("firstDay"))prefs.edit().putLong("firstDay",today).apply(); // 第一次打开的日子，第 1 天
        Catalog catalog=null;try{catalog=new Catalog(this);}catch(Exception ignored){}
        // ---- 顶部：标题和版本、权限提示、让桌宠出来玩、收起 / 继续、全部回家 ----
        LinearLayout head=new LinearLayout(this);head.setGravity(Gravity.CENTER_VERTICAL);page.addView(head);
        LinearLayout titles=new LinearLayout(this);titles.setOrientation(LinearLayout.VERTICAL);head.addView(titles,new LinearLayout.LayoutParams(0,-2,1));
        LinearLayout titleRow=new LinearLayout(this);titleRow.setGravity(Gravity.CENTER_VERTICAL);titles.addView(titleRow);
        titleRow.addView(pixelIcon("heart",26,0));
        TextView name=label("梨间雪",30,cPageText,true);name.setPadding(dp(10),0,0,0);titleRow.addView(name);
        titles.addView(label("安卓尝鲜版 · "+UpdateChecker.current(this),13,cPageSub,false));
        PetView mascot=new PetView(this);String mascotClip=mascotClip(catalog);if(mascotClip!=null)mascot.show(mascotClip);head.addView(mascot,new LinearLayout.LayoutParams(dp(64),dp(64)));
        permissionBar=new LinearLayout(this);permissionBar.setGravity(Gravity.CENTER_VERTICAL);permissionBar.setBackground(new IslandPanel.PixelBox(PixelUi.light(cBg)?cCard:cPanel,0,block,1));permissionBar.setPadding(dp(12),dp(10),dp(12),dp(10));
        permissionText=label("",13,cPageText,false);permissionBar.addView(permissionText,new LinearLayout.LayoutParams(0,-2,1));
        TextView go=label("去开启",13,cAccent,true);go.setPadding(dp(10),0,0,0);permissionBar.addView(go);
        permissionBar.setOnClickListener(v->{for(String p:new String[]{P_OVERLAY,P_ACCESS,P_NOTIFY,P_USAGE})if(!granted(p)){openPermission(p);return;}});
        page.addView(permissionBar,top(dp(14)));
        refreshers.add(this::updatePermissionBar);
        TextView start=bigButton("让桌宠出来玩",()->startPets("start"));page.addView(start,top(dp(12)));
        LinearLayout controls=new LinearLayout(this);page.addView(controls,top(dp(10)));
        controls.addView(outlineButton("收起 / 继续",()->startPets("toggle")),weight(0,dp(4)));
        controls.addView(outlineButton("全部回家",()->{stopService(new Intent(this,PetService.class));toast("小动物回家啦");}),weight(dp(4),0));
        // ---- 伙伴 ----
        LinearLayout pets=card("pets","heart","伙伴",()->Math.min(3,selected().size())+" 只在陪你 · 散步"+(prefs.getBoolean("walking",true)?"开":"关"));
        info(pets,"最多同时 3 只；点一下摸摸，双击跳起来，拖动放手会落下，长按回到这里。");
        Set<String> picked=prefs.getStringSet("selected",new HashSet<>(Arrays.asList("pet0","pet2")));
        if(catalog==null)note(pets,"素材没有加载成功，请重新安装完整安装包。");
        else for(Catalog.Pet pet:catalog.pets) {
            LinearLayout row=new LinearLayout(this); row.setGravity(Gravity.CENTER_VERTICAL); row.setPadding(dp(8),dp(2),dp(8),dp(2));row.setBackground(new IslandPanel.PixelBox(cCard,0,block,1));
            pets.addView(row,top(dp(6)));
            PetView view=new PetView(this);view.show(pet.clip("待机"));row.addView(view,new LinearLayout.LayoutParams(dp(56),dp(56)));
            CheckBox check=new CheckBox(this);check.setText(pet.label);check.setTextSize(15);check.setTextColor(cText);check.setButtonTintList(android.content.res.ColorStateList.valueOf(cAccent));check.setChecked(picked.contains(pet.id));row.addView(check,new LinearLayout.LayoutParams(0,-2,1)); choices.put(pet.id,check);
            check.setOnCheckedChangeListener((b,on)->{if(on && selected().size()>3){b.setChecked(false);toast("手机上先让 3 只一起玩哦");} save();refreshAll();});
            row.setOnClickListener(v->check.setChecked(!check.isChecked()));
        }
        TextView sizeLabel=label("",14,cText,false);sizeLabel.setPadding(0,dp(12),0,0);pets.addView(sizeLabel);
        size=slider(pets,80,prefs.getInt("size",88)-56);sizeLabel.setText(getString(R.string.pet_size,size.getProgress()+56));
        size.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){public void onStartTrackingTouch(SeekBar b){} public void onStopTrackingTouch(SeekBar b){save();} public void onProgressChanged(SeekBar b,int value,boolean user){sizeLabel.setText(getString(R.string.pet_size,value+56));}});
        walking=new Switch(this);walking.setChecked(prefs.getBoolean("walking",true));walking.setOnCheckedChangeListener((v,on)->{save();refreshAll();}); // 保存用的老开关（不显示），和下面的像素开关同步
        PixelUi.PixelSwitch walk=switchRow(pets,"让它们自己散步",null,null,walking.isChecked(),on->walking.setChecked(on));
        chips(pets,new String[]{"应用选择和大小","试试贴贴 ♡"},new Runnable[]{()->startPets("start"),()->startPets("hug")});
        chips(pets,new String[]{"住在哪里","百变猫猫","宠物生日"},new Runnable[]{this::chooseHomes,this::chooseCatLock,this::chooseBirthday});
        info(pets,"「住在屏幕边」的伙伴平时贴在左边或右边探头，只露出头和爪子，时不时沿着边爬到别的高度，偶尔掉下来换到另一边；不挡状态栏、灵动岛和底部导航条，键盘弹出时会避开。摸它会缩回去再探出来，拖着放到边上能换高度，拖回地面就变回住在地面。住在边上的不参加贴贴和叠叠乐，灵动岛来通知时照样去挂着，挂完回原来的边上。默认都住在地面。\n\n贴贴沿用电脑版的搭配规则，选两只有对应动画的伙伴就能试。百变猫猫会自动轮换，双击换下一只，也能锁定一只。\n\n哥哥狗狗和电脑版一样会照顾大家：有伙伴摔趴趴，它会走过去扶起来；晚上 11 点到早上 6 点，千千猫猫睡着时，它会过去盖被子（一晚一次），盖好后两只一起睡，摸一下才醒。演示会自动把千千猫猫和哥哥狗狗放出来。\n\n和电脑版一样会闹：千千猫猫离哥哥狗狗近时偶尔挑衅它，梨梨兔兔也会挑衅梨梨哥哥，10 分钟里被挑衅超过 3 次哥哥直接投降；长按千千猫猫或梨梨兔兔也能叫它去挑衅。哥哥狗狗和梨梨哥哥贴贴完会打一架，冷静大约 3 分钟后再碰到先和好再贴贴。拖动、摸摸随时能打断。\n\n平时还会：千千猫猫和梨梨兔兔互相送零食；煤球猫猫突然冲过去追着玩；一只打哈欠，旁边的跟着打；g老师偶尔看书，有伙伴挨过来就一起看（哥哥狗狗来是批改作业），看着看着会打瞌睡被围观，摔倒时旁边的伙伴帮忙接眼镜，偶尔和哥哥狗狗换眼镜；沙漠狐玩自己的小爱好，和 99狐狐 比尾巴，晚上两只一起睡时用尾巴当被子。");
        // ---- 陪你用手机 ----
        LinearLayout phone=card("phone","move","陪你用手机",()->onList(new String[]{"companion","应用联动","interface","界面互动","motion","摇晃","climb","爬墙"}));
        LinearLayout companionSub=toggle(phone,"companion","应用联动","全手机陪打字：检测到实际输入就一起打字，不用逐个设置应用，停下约 1.6 秒后停下。需要开启界面互动；密码框和不提供输入事件的页面无法联动。\n\n浏览器、便签、搜索框等也会尝试陪打字；某个应用设为「不联动」时会尊重这个设置。网易云等在后台放歌时也会一起跳舞（需要通知使用权）。",P_USAGE,on->updateUsageStatus());
        usageStatus=note(companionSub,"");
        chips(companionSub,new String[]{"设置每个应用的动作"},new Runnable[]{this::chooseApp});
        LinearLayout uiSub=toggle(phone,"interface","界面互动 · 输入与键盘避让","键盘弹出时站到键盘上沿，收起后落回屏幕。消息气泡、按钮、输入框、列表图片和卡片上沿都能尝试当小台阶，自己跳上去再逐级往下跳。不限 QQ；滑动后台阶消失会播放掉落和落地动画，落稳后再继续陪打字。应用提供的边界不同，识别不到就继续散步。\n\n需要你单独开启无障碍服务。只使用输入变化事件与控件边界，不获取聊天文字、输入内容或截图，不代点按钮，不联网。",P_ACCESS,on->{InterfaceCompanion.clear();updateUsageStatus();});
        toggle(uiSub,"perching","自动跳上页面台阶（测试）",null,null,null);
        interfaceStatus=note(uiSub,"");
        toggle(phone,"motion","重力与摇晃互动","轻轻连续晃动会让宠物像弹力球一样摇晃着蹦几秒，落地后吐出一道彩虹；飞起来时倾斜手机可改变方向。无需用力摇。熄屏或收起宠物时停止摇晃检测。",null,null);
        LinearLayout climbSub=toggle(phone,"climb","歪手机爬墙","手机往左或往右歪一会儿，一只伙伴走到那一边，沿屏幕边爬到上半部分，然后藏在边外只露出头和爪子。不管它就一直趴着，拖出来才会掉回地上。同一时间只有一只去爬；贴贴、剧情、挂灵动岛时不爬。",null,null);
        TextView speedLabel=label("",14,cText,false);climbSub.addView(speedLabel);
        int speedNow=Math.max(ClimbRules.SPEED_MIN,Math.min(ClimbRules.SPEED_MAX,prefs.getInt("climbSpeed",100)));
        speedLabel.setText("沿屏幕边爬的速度："+speedNow+"%");
        SeekBar climbSpeed=slider(climbSub,(ClimbRules.SPEED_MAX-ClimbRules.SPEED_MIN)/ClimbRules.SPEED_STEP,(speedNow-ClimbRules.SPEED_MIN)/ClimbRules.SPEED_STEP);
        climbSpeed.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){public void onStartTrackingTouch(SeekBar b){} public void onStopTrackingTouch(SeekBar b){}
            public void onProgressChanged(SeekBar b,int value,boolean user){int percent=ClimbRules.SPEED_MIN+value*ClimbRules.SPEED_STEP;speedLabel.setText("沿屏幕边爬的速度："+percent+"%");if(user)prefs.edit().putInt("climbSpeed",percent).apply();}}); // 马上生效
        // ---- 灵动岛 ----
        LinearLayout island=card("island","play","灵动岛",()->onList(new String[]{"island","提示条","islandMedia","音乐","islandLyrics","歌词","delivery","外卖","islandBattery","充电","islandHang","挂着"}));
        toggle(island,"island","顶部灵动提示条","提示条出现时（通知、充电、计时都算；听音乐、看视频、打字时不挂，照常陪你），选好的伙伴会跑到提示条下面挂着，提示条消失后再落回地面。点提示条可打开通知，长按展开灵动面板。提示条可以点一下隐藏。计时器不是系统闹钟，桌宠被强制关闭后不能保证准时提醒。",null,null);
        toggle(island,"islandMedia","音乐状态与播放控制","音乐与通知来源需要通知使用权；通知仅显示你选中应用的标题。",P_NOTIFY,null);
        toggle(island,"islandLyrics","滚动歌词","打开后放歌时灵动岛显示正在唱的那句，长句子会像跑马灯一样滚过去，换句时滑到下一句；暂停就停住，切歌重新找。先读音乐 App 的「状态栏歌词」；读不到就把歌名和歌手发给网易云音乐网页接口查带时间轴的歌词，别的信息都不发。查不到或纯音乐就照旧只显示歌名。歌词只放在内存里，最多记最近 6 首，不存文件、不上传。有外卖、通知、计时这些提示时提示优先。",P_NOTIFY,null);
        toggle(island,"delivery","外卖提示","灵动岛显示预计送达倒计时。只在本机内存里读美团 / 饿了么的通知，或标题、正文里带送达、骑手、取餐、配送、商家的通知；读到「预计 HH:mm 送达」才显示倒计时，不保存、不上传、不写日志。仅转述通知，不能查询订单或保证外卖真的送达。",P_NOTIFY,null);
        toggle(island,"islandBattery","充电与电量",null,null,null);
        LinearLayout hangSub=toggle(island,"islandHang","伙伴挂在提示条下面",null,null,null);
        chips(hangSub,new String[]{"选择挂着的伙伴"},new Runnable[]{this::chooseIslandPet});
        chips(island,new String[]{"位置与大小","通知来源","计时器"},new Runnable[]{()->IslandSettings.open(this,false,()->startPets("island-preview")),this::chooseNoticeApps,this::chooseTimer});
        // ---- 天气与日常 ----
        LinearLayout daily=card("daily","timer","天气与日常",()->(prefs.getBoolean("weather",false)?shortPlace():"天气关")+" · 小窝"+(prefs.getBoolean("nest",false)?"开":"关")+" · 提醒"+(prefs.getBoolean("timeRemind",false)?"开":"关"));
        LinearLayout weatherSub=toggle(daily,"weather","天气与季节换装","和电脑版一样：下雨、下雪、起雾、打雷、很热、降温时换成对应的待机，平时按春夏秋冬换装，晚上晴天是晴夜。不申请定位权限：地点自己选省、市、区县，只把那里的经纬度发给天气服务 open-meteo，开着桌宠时最多 30 分钟查一次；查不到就用普通待机。只换平时的待机，不打断摸摸、拖动、贴贴和陪打字。",null,on->updateWeatherStatus());
        weatherStatus=note(weatherSub,"");
        chips(weatherSub,new String[]{"选择天气地点"},new Runnable[]{this::chooseWeatherPlace});
        LinearLayout celebrateSub=toggle(daily,"celebrate","过节、生日、在一起的纪念日","国庆、万圣节、圣诞、春节当天伙伴换上节日动画，时不时庆祝一下；设好生日的伙伴那天会过生日；从第一次打开算起，第 7、30、100、200 天和每满一年大家一起庆祝。",null,null);
        note(celebrateSub,"和千千在一起第 "+CalendarRules.daysTogether(prefs.getLong("firstDay",today),today)+" 天");
        chips(celebrateSub,new String[]{"宠物生日"},new Runnable[]{this::chooseBirthday});
        toggle(daily,"timeRemind","时间提醒","0～5 点每 20 分钟催你睡觉，12 点、18 点左右提醒吃饭，话写在顶部提示条上。",null,null);
        toggle(daily,"nest","小窝","小窝放在屏幕左下角，晚上 11 点后困了的伙伴走回窝里挤着睡，早上 7 点后或者被摸醒就出来。",null,null);
        note(daily,"番茄钟：专注时伙伴安静陪着（g老师看书），25 分钟后提醒休息 5 分钟，休息完问要不要继续；也能从通知栏的「🍅 专注」开始。长按伙伴可以「分享这个表情」。");
        chips(daily,new String[]{"🍅 开始专注 25 分钟","结束专注"},new Runnable[]{()->startPets("focus-start"),()->startPets("focus-stop")});
        // ---- 美化主题 ----
        LinearLayout looks=card("theme","heart","美化主题",()->theme==null?"千千猫猫":theme.name);
        buildThemeCard(looks);
        // ---- 权限 ----
        LinearLayout perms=card("perms","hide","权限",()->{int on=0;for(String p:new String[]{P_OVERLAY,P_ACCESS,P_NOTIFY,P_USAGE})if(granted(p))on++;return "4 项里开了 "+on+" 项";});
        for(String p:new String[]{P_OVERLAY,P_ACCESS,P_NOTIFY,P_USAGE})permissionRow(perms,p);
        info(perms,"第一次需要你允许“显示在其他应用上层”。通知栏可收起或关闭；熄屏时暂停。若后台被手机清理，可在系统的应用电池设置中允许后台运行。\n\n联网的只有：检查更新（只连 GitHub 上桌宠的发布页）、打开天气后查天气（只发所选地点的经纬度）、打开滚动歌词后查歌词（只发歌名和歌手）。界面互动只看控件位置和输入变化，不读取聊天文字或按键内容。");
        // ---- 测试与更新 ----
        LinearLayout more=card("more","next","测试与更新",()->{String s=prefs.getString("updateStatus","");return s.isEmpty()?"当前 "+UpdateChecker.current(this):s.length()>24?s.substring(0,24)+"…":s;});
        chips(more,new String[]{"测试动作 / 功能展示"},new Runnable[]{this::openTests});
        toggle(more,"autoUpdate","自动检查更新","打开后立即检查；设置页打开或桌宠在屏幕上运行时定时检查。检查成功后间隔 12 小时，失败后约 15 分钟重试；服务器限流时按提示等待。手动检查不受 12 小时间隔限制。安装仍需你确认。\n\n发现新版本会问你要不要下载；下载好后打开系统安装界面，由你点「安装」。第一次需要允许「安装未知应用」。只接受 GitHub 上桌宠发布页的安装包。",null,on->{if(on)checkUpdate(false);});
        updateStatus=note(more,prefs.getString("updateStatus","还没有检查更新"));
        chips(more,new String[]{"检查更新"},new Runnable[]{()->checkUpdate(true)});
        refreshAll();
    }
    private void openTests(){
        new AlertDialog.Builder(this).setTitle("让伙伴演给你看")
            .setItems(new String[]{"陪我打字", "一起看视频", "一起跳舞", "蹦起来", "气泡台阶跳跃演示", "打字中掉落 → 落稳继续打字", "窄台阶站稳测试", "摇晃与彩虹演示", "灵动提示演示", "吐彩虹", "挂灵动岛", "天气演示（所有天气和四季）", "哥哥扶起来", "哥哥盖被子", "通知检查（外卖 / 音乐歌词，看通知里能读到什么）", "挑衅哥哥（千千猫猫 / 梨梨兔兔轮流）", "两个哥哥打架和好", "送零食（千千猫猫 / 梨梨兔兔轮流）", "煤球猫猫追着玩", "打哈欠会传染", "g老师看书 + 哥哥批改作业", "g老师看书睡着被围观", "g老师摔倒接眼镜", "哥哥和g老师换眼镜", "沙漠狐的小爱好", "两只狐狸比尾巴", "两只狐狸尾巴被子", "叠叠乐（拖一只放到另一只头上）", "百变猫猫换一只", "过节（国庆 / 万圣节 / 圣诞 / 春节）", "过生日", "在一起的纪念日", "时间提醒（睡觉、吃饭）", "回小窝睡觉 → 早上出来", "番茄钟专注", "爬左边", "爬右边", "住到左边", "住到右边", "歌词演示", "切换美化预览", "功能展示：从摇晃到小窝、番茄钟、爬墙、住在屏幕边、歌词、美化全部演一遍"},(d,which)->startPets(new String[]{"test-type","test-video","test-music","test-jump","test-perch","test-drop","test-narrow","test-shake","test-island","test-rainbow","test-hang","test-weather","test-helpup","test-blanket","test-inspect","test-tease","test-fight","test-snack","test-chase","test-yawn","test-read","test-watch","test-catch","test-swap","test-hobby","test-tails","test-tailquilt","test-stack","test-cat","test-festival","test-birthday","test-anniversary","test-remind","test-nest","test-focus","test-climb-left","test-climb-right","test-edge-left","test-edge-right","test-lyrics","test-theme","test-show"}[which])).show();
    }
    private void chooseTimer(){
        new AlertDialog.Builder(this).setTitle("桌宠运行期间的计时器")
            .setItems(new String[]{"1 分钟", "5 分钟", "15 分钟", "25 分钟", "取消计时"},(d,i)->{
                long minutes=new long[]{1,5,15,25,0}[i];prefs.edit().putLong("timerEnd",minutes==0?0:System.currentTimeMillis()+minutes*60000).apply();startPets("start");}).show();
    }
    private void updateUsageStatus(){if(interfaceStatus!=null)interfaceStatus.setText(!prefs.getBoolean("interface",false)?"界面互动已关闭":InterfaceCompanion.connected?"界面互动已连接 · 回聊天应用输入，或到其他页面看它跳台阶":"等待你在无障碍设置中开启「界面互动 · 梨间雪桌宠」");if(usageStatus!=null)usageStatus.setText(!prefs.getBoolean("companion",false)?"联动已关闭":(UsageCompanion.allowed(this)||InterfaceCompanion.connected&&prefs.getBoolean("interface",false))?"联动已开启 · 回到其他应用，约 2 秒切换动作":"联动等待授权 · 请允许使用情况访问权限");}
    private void chooseApp(){
        Intent query=new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        java.util.List<android.content.pm.ResolveInfo> installed=getPackageManager().queryIntentActivities(query,0);
        Map<String,String> unique=new java.util.TreeMap<>();
        for(android.content.pm.ResolveInfo r:installed)if(!r.activityInfo.packageName.equals(getPackageName()))unique.put(r.activityInfo.packageName,r.loadLabel(getPackageManager()).toString());
        java.util.List<String> packages=new ArrayList<>(unique.keySet());
        packages.sort((a,b)->unique.get(a).compareToIgnoreCase(unique.get(b)));
        String[] labels=new String[packages.size()];for(int i=0;i<labels.length;i++)labels[i]=unique.get(packages.get(i));
        if(labels.length==0){toast("没有找到可选择的应用");return;}
        new AlertDialog.Builder(this).setTitle("选择一个应用").setItems(labels,(dialog,index)->{
            String pkg=packages.get(index);String saved=prefs.getString("app:"+pkg,"auto");int current=0;
            for(int i=0;i<AppCompanion.MODES.length;i++)if(AppCompanion.MODES[i].equals(saved))current=i;
            new AlertDialog.Builder(this).setTitle(labels[index]).setSingleChoiceItems(AppCompanion.LABELS,current,(d,which)->{
                prefs.edit().putString("app:"+pkg,AppCompanion.MODES[which]).apply();d.dismiss();toast("动作已保存");
            }).setNegativeButton("返回",null).show();
        }).setNegativeButton("取消",null).show();
    }
    private void chooseNoticeApps(){
        java.util.List<android.content.pm.ResolveInfo> installed=getPackageManager().queryIntentActivities(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER),0);
        Map<String,String> names=new java.util.TreeMap<>();for(android.content.pm.ResolveInfo r:installed)if(!r.activityInfo.packageName.equals(getPackageName()))names.put(r.activityInfo.packageName,r.loadLabel(getPackageManager()).toString());
        java.util.List<String> packages=new ArrayList<>(names.keySet());String[] labels=new String[packages.size()];boolean[] selected=new boolean[packages.size()];
        for(int i=0;i<labels.length;i++){labels[i]=names.get(packages.get(i));selected[i]=prefs.getBoolean("notify:"+packages.get(i),false);}
        new AlertDialog.Builder(this).setTitle("只显示选中应用的通知标题").setMultiChoiceItems(labels,selected,(d,i,on)->prefs.edit().putBoolean("notify:"+packages.get(i),on).apply()).setPositiveButton("完成",null).show();
    }
    // ---- 天气地点（Claude）：复用电脑版的省 → 市 → 区县，不申请定位权限 ----
    private void updateWeatherStatus(){
        if(weatherStatus==null)return;
        String place=WeatherCompanion.place(prefs);
        weatherStatus.setText(!prefs.getBoolean("weather",false)?"已关闭 · 地点："+place:"地点："+place+"\n现在："+prefs.getString("weatherNow","让桌宠出来后会去查天气")+" · 季节："+Weather.label(WeatherCompanion.season()));
    }
    private void chooseWeatherPlace(){
        try{
            org.json.JSONArray provinces=WeatherCompanion.regions(this);
            String[] names=new String[provinces.length()];for(int i=0;i<names.length;i++)names[i]=provinces.getJSONArray(i).getString(0);
            new AlertDialog.Builder(this).setTitle("选择省份").setItems(names,(d,pi)->{try{
                org.json.JSONArray cities=provinces.getJSONArray(pi).getJSONArray(1);
                String[] cityNames=new String[cities.length()];for(int i=0;i<cityNames.length;i++)cityNames[i]=cities.getJSONArray(i).getString(0);
                new AlertDialog.Builder(this).setTitle(names[pi]).setItems(cityNames,(d2,ci)->{try{
                    org.json.JSONArray counties=cities.getJSONArray(ci).getJSONArray(1);
                    String[] countyNames=new String[counties.length()];for(int i=0;i<countyNames.length;i++)countyNames[i]=counties.getJSONArray(i).getString(0);
                    new AlertDialog.Builder(this).setTitle(cityNames[ci]).setItems(countyNames,(d3,ki)->{try{
                        org.json.JSONArray c=counties.getJSONArray(ki);
                        String label=names[pi].equals(cityNames[ci])?names[pi]+" · "+countyNames[ki]:names[pi]+" · "+cityNames[ci]+" · "+countyNames[ki];
                        prefs.edit().putString("weatherPlace",label).putFloat("weatherLat",(float)c.getDouble(1)).putFloat("weatherLon",(float)c.getDouble(2)).remove("weatherNow").apply();
                        updateWeatherStatus();toast("地点已保存，桌宠出来时会重新查天气");
                    }catch(org.json.JSONException e){toast("这个地点读不出来");}}).setNegativeButton("返回",null).show();
                }catch(org.json.JSONException e){toast("这个城市读不出来");}}).setNegativeButton("返回",null).show();
            }catch(org.json.JSONException e){toast("这个省读不出来");}}).setNeutralButton("恢复默认（长沙市中心）",(d,i)->{
                prefs.edit().remove("weatherPlace").remove("weatherLat").remove("weatherLon").remove("weatherNow").apply();updateWeatherStatus();
            }).setNegativeButton("取消",null).show();
        }catch(Exception e){toast("地点列表没有加载成功");}
    }
    private void chooseCatLock(){
        try{
            Catalog catalog=new Catalog(this);
            java.util.List<String> skins=new ArrayList<>();java.util.List<String> labels=new ArrayList<>();
            skins.add("");labels.add("自动轮换（2～4 分钟换一只）");
            for(Catalog.Pet pet:catalog.cats()){skins.add(pet.skin);labels.add("只要"+pet.skin);}
            int current=Math.max(0,skins.indexOf(prefs.getString("catLock","")));
            new AlertDialog.Builder(this).setTitle("百变猫猫").setSingleChoiceItems(labels.toArray(new String[0]),current,(d,i)->{
                prefs.edit().putString("catLock",skins.get(i)).apply();d.dismiss();toast(i==0?"会自动换小猫啦，双击也能换":"锁定好啦，只出来"+skins.get(i));
            }).setNegativeButton("返回",null).show();
        }catch(Exception e){toast("素材没有加载成功");}
    }
    /** 宠物生日（Claude）：选一只，填「3-14」「3/14」「3月14日」都行，空着就是清除。 */
    private void chooseBirthday(){
        try{
            Catalog catalog=new Catalog(this);
            java.util.List<String> names=new ArrayList<>();
            for(Catalog.Pet pet:catalog.pets)if(!names.contains(pet.name))names.add(pet.name);
            String[] labels=new String[names.size()];
            for(int i=0;i<names.size();i++){String b=prefs.getString("birthday:"+names.get(i),"");labels[i]=names.get(i)+(b.isEmpty()?"（没设）":"（"+b+"）");}
            new AlertDialog.Builder(this).setTitle("宠物生日").setItems(labels,(d,i)->{
                String name=names.get(i);android.widget.EditText input=new android.widget.EditText(this);
                input.setHint("比如 3-14");input.setText(prefs.getString("birthday:"+name,""));input.setSingleLine(true);
                new AlertDialog.Builder(this).setTitle(name+"的生日").setView(input).setPositiveButton("保存",(d2,w)->{
                    String raw=input.getText().toString().trim();
                    if(raw.isEmpty()){prefs.edit().remove("birthday:"+name).apply();toast("清除好啦");return;}
                    String md=CalendarRules.normalizeBirthday(raw);
                    if(md.isEmpty()){toast("没看懂这个日期，写成 3-14 试试");return;}
                    prefs.edit().putString("birthday:"+name,md).apply();toast(name+"的生日是 "+md+" 🎂");
                }).setNegativeButton("取消",null).show();
            }).setNegativeButton("返回",null).show();
        }catch(Exception e){toast("素材没有加载成功");}
    }
    /** 住在地面 / 住在屏幕边（Claude）：每只伙伴选一个，默认住在地面。 */
    private void chooseHomes(){
        try{
            Catalog catalog=new Catalog(this);
            java.util.List<String> names=new ArrayList<>();
            for(Catalog.Pet pet:catalog.pets)if(!names.contains(pet.name))names.add(pet.name);
            Set<String> homes=new HashSet<>(prefs.getStringSet("edgePets",new HashSet<>()));
            String[] labels=new String[names.size()];
            for(int i=0;i<names.size();i++)labels[i]=names.get(i)+"："+(homes.contains(names.get(i))?"住在屏幕边":"住在地面");
            new AlertDialog.Builder(this).setTitle("住在哪里").setItems(labels,(d,i)->{
                String name=names.get(i);
                new AlertDialog.Builder(this).setTitle(name).setSingleChoiceItems(new String[]{"住在地面","住在屏幕边"},homes.contains(name)?1:0,(d2,w)->{
                    if(w==1)homes.add(name);else homes.remove(name);
                    prefs.edit().putStringSet("edgePets",new HashSet<>(homes)).apply();d2.dismiss();
                    toast(name+(w==1?"搬到屏幕边啦，点「应用选择和大小」就能看到":"回到地面啦"));
                }).setNegativeButton("返回",null).show();
            }).setNegativeButton("返回",null).show();
        }catch(Exception e){toast("素材没有加载成功");}
    }
    private void chooseIslandPet(){
        try{
            Catalog catalog=new Catalog(this);
            java.util.List<String> ids=new ArrayList<>();java.util.List<String> labels=new ArrayList<>();
            ids.add("");labels.add("第一只出来的伙伴");
            for(Catalog.Pet pet:catalog.pets){ids.add(pet.id);labels.add(pet.label);}
            int current=Math.max(0,ids.indexOf(prefs.getString("islandPet","")));
            new AlertDialog.Builder(this).setTitle("谁挂在提示条下面").setSingleChoiceItems(labels.toArray(new String[0]),current,(d,i)->{
                prefs.edit().putString("islandPet",ids.get(i)).apply();d.dismiss();toast(i==0?"默认第一只出来的伙伴":"没出来的话会换成第一只出来的伙伴");
            }).setNegativeButton("返回",null).show();
        }catch(Exception e){toast("素材没有加载成功");}
    }
    private Set<String> selected(){Set<String> ids=new HashSet<>();for(Map.Entry<String,CheckBox> c:choices.entrySet())if(c.getValue().isChecked())ids.add(c.getKey());return ids;}
    private void save(){android.content.SharedPreferences.Editor e=prefs.edit().putStringSet("selected",selected());if(size!=null)e.putInt("size",size.getProgress()+56);if(walking!=null)e.putBoolean("walking",walking.isChecked());e.apply();}
    // ---- 设置页的小零件（Claude）：都用美化主题的颜色和像素台阶边角 ----
    private TextView label(String s,float sp,int color,boolean bold){TextView v=new TextView(this);v.setText(s);v.setTextSize(sp);v.setTextColor(color);if(bold)v.setTypeface(null,android.graphics.Typeface.BOLD);return v;}
    private LinearLayout.LayoutParams top(int margin){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.topMargin=margin;return p;}
    private LinearLayout.LayoutParams weight(int left,int right){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,dp(48),1);p.leftMargin=left;p.rightMargin=right;return p;}
    /** 11×11 像素图标按整数倍放大；主题自带的优先，没有就用默认图标按主题颜色着色。 */
    private ImageView pixelIcon(String name,float targetDp,int tint){
        int res=IslandPanel.res(name);
        android.graphics.Bitmap bmp=theme==null?android.graphics.BitmapFactory.decodeResource(getResources(),res):theme.icon(this,name,res);
        android.graphics.drawable.BitmapDrawable d=new android.graphics.drawable.BitmapDrawable(getResources(),bmp);d.setFilterBitmap(false);
        if(tint!=0)d.setColorFilter(new android.graphics.PorterDuffColorFilter(tint,android.graphics.PorterDuff.Mode.SRC_IN));
        ImageView v=new ImageView(this);v.setImageDrawable(d);v.setScaleType(ImageView.ScaleType.FIT_XY);
        int k=Math.max(1,Math.round(targetDp*getResources().getDisplayMetrics().density/11f));v.setLayoutParams(new LinearLayout.LayoutParams(11*k,11*k));
        return v;
    }
    private TextView bigButton(String text,Runnable action){
        TextView b=label(text,19,cAccentText,true);b.setGravity(Gravity.CENTER);b.setMinHeight(dp(60));
        b.setBackground(new IslandPanel.PixelBox(cAccent,PixelUi.light(cBg)?cRim:0,block,2));b.setOnClickListener(v->action.run());return b;
    }
    private TextView outlineButton(String text,Runnable action){
        TextView b=label(text,15,cPageText,true);b.setGravity(Gravity.CENTER);
        b.setBackground(new IslandPanel.PixelBox(cPanel,cRim,block,2));b.setOnClickListener(v->action.run());return b;
    }
    /** 可折叠卡片：标题下面一行写摘要，点标题展开 / 收起，一次只展开一张，记住上次展开的是哪张。返回放内容的地方。 */
    private LinearLayout card(String key,String icon,String title,java.util.function.Supplier<String> summary){
        LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setBackground(new IslandPanel.PixelBox(cPanel,cRim,block,2));box.setPadding(dp(14),dp(12),dp(14),dp(12));
        page.addView(box,top(dp(12)));
        LinearLayout header=new LinearLayout(this);header.setGravity(Gravity.CENTER_VERTICAL);box.addView(header);
        FrameLayout iconBox=new FrameLayout(this);iconBox.setBackground(new IslandPanel.PixelBox(cCard,0,block,1));
        ImageView i=pixelIcon(icon,22,0);int k=i.getLayoutParams().width;FrameLayout.LayoutParams at=new FrameLayout.LayoutParams(k,k);at.gravity=Gravity.CENTER;iconBox.addView(i,at);
        header.addView(iconBox,new LinearLayout.LayoutParams(dp(40),dp(40)));
        LinearLayout words=new LinearLayout(this);words.setOrientation(LinearLayout.VERTICAL);words.setPadding(dp(12),0,0,0);header.addView(words,new LinearLayout.LayoutParams(0,-2,1));
        words.addView(label(title,18,cText,true));
        TextView sum=label("",12,cSub,false);sum.setSingleLine(true);sum.setEllipsize(android.text.TextUtils.TruncateAt.END);words.addView(sum); // 摘要只占一行，太长就省略号
        View arrow=new View(this);LinearLayout.LayoutParams ap=new LinearLayout.LayoutParams(block*6,block*5);ap.leftMargin=dp(8);header.addView(arrow,ap);
        LinearLayout body=new LinearLayout(this);body.setOrientation(LinearLayout.VERTICAL);body.setPadding(0,dp(8),0,0);box.addView(body);
        cards.put(key,new View[]{body,arrow,sum});
        header.setOnClickListener(v->{boolean open=body.getVisibility()!=View.VISIBLE;prefs.edit().putString("settingsOpen",open?key:"").apply();applyCards();});
        refreshers.add(()->sum.setText(summary.get()));
        applyCards();
        return body;
    }
    private void applyCards(){
        String open=prefs.getString("settingsOpen","");
        for(Map.Entry<String,View[]> e:cards.entrySet()){
            boolean on=e.getKey().equals(open);View[] v=e.getValue();
            v[0].setVisibility(on?View.VISIBLE:View.GONE);v[2].setVisibility(on?View.GONE:View.VISIBLE);
            v[1].setBackground(on?new PixelUi.PixelDown(cSub,block):new IslandPanel.PixelChevron(cSub,block));
        }
    }
    /** 一行说明（一直显示）。 */
    private TextView note(LinearLayout parent,String s){TextView t=label(s,13,cSub,false);t.setPadding(0,dp(6),0,dp(4));parent.addView(t);return t;}
    /** 「ⓘ 说明」默认收起，点开才显示。 */
    private void info(LinearLayout parent,String s){
        TextView open=label("ⓘ 说明",13,cSub,false);open.setPadding(0,dp(8),0,dp(4));parent.addView(open);
        TextView t=label(s,13,cSub,false);t.setVisibility(View.GONE);parent.addView(t);
        open.setOnClickListener(v->t.setVisibility(t.getVisibility()==View.VISIBLE?View.GONE:View.VISIBLE));
    }
    /** 一排按钮（最多三个一排）。 */
    private void chips(LinearLayout parent,String[] labels,Runnable[] actions){
        LinearLayout row=null;
        for(int i=0;i<labels.length;i++){
            if(i%3==0){row=new LinearLayout(this);parent.addView(row,top(dp(8)));}
            TextView b=label(labels[i],14,cText,true);b.setGravity(Gravity.CENTER);b.setPadding(dp(6),0,dp(6),0);
            b.setSingleLine(true);b.setEllipsize(android.text.TextUtils.TruncateAt.END); // 一排按钮都一样高：字太长就缩小，不换行
            if(Build.VERSION.SDK_INT>=26)b.setAutoSizeTextTypeUniformWithConfiguration(10,14,1,android.util.TypedValue.COMPLEX_UNIT_SP);b.setBackground(new IslandPanel.PixelBox(cCard,0,block,1));
            Runnable a=actions[i];b.setOnClickListener(v->a.run());
            LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,dp(44),1);p.leftMargin=i%3==0?0:dp(6);row.addView(b,p);
        }
    }
    private SeekBar slider(LinearLayout parent,int max,int progress){
        SeekBar s=new SeekBar(this);s.setMax(max);s.setProgress(progress);
        s.setProgressTintList(android.content.res.ColorStateList.valueOf(cAccent));s.setThumbTintList(android.content.res.ColorStateList.valueOf(cAccent));s.setProgressBackgroundTintList(android.content.res.ColorStateList.valueOf(cTrack));
        parent.addView(s,top(dp(4)));return s;
    }
    /** 开关一行：文字、可选的「ⓘ」、像素开关；下面是收起的说明和「需要先开启 xx →」。 */
    private PixelUi.PixelSwitch switchRow(LinearLayout parent,String title,String infoText,String perm,boolean initial,PixelUi.PixelSwitch.Listener listener){
        View line=new View(this);line.setBackgroundColor(cCard);LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,Math.max(1,block/2));lp.topMargin=dp(6);parent.addView(line,lp);
        LinearLayout row=new LinearLayout(this);row.setGravity(Gravity.CENTER_VERTICAL);row.setMinimumHeight(dp(48));parent.addView(row);
        row.addView(label(title,15,cText,false),new LinearLayout.LayoutParams(0,-2,1));
        TextView more=null;
        if(infoText!=null){more=label("ⓘ",17,cSub,false);more.setPadding(dp(10),dp(6),dp(12),dp(6));row.addView(more);}
        PixelUi.PixelSwitch sw=new PixelUi.PixelSwitch(this,cAccent,cTrack,0xFFFFFFFF,cRim,block);sw.set(initial,false);sw.listen(listener);
        row.addView(sw,new LinearLayout.LayoutParams(dp(54),dp(28)));
        if(infoText!=null){TextView t=label(infoText,13,cSub,false);t.setVisibility(View.GONE);t.setPadding(0,0,0,dp(6));parent.addView(t);more.setOnClickListener(v->t.setVisibility(t.getVisibility()==View.VISIBLE?View.GONE:View.VISIBLE));}
        if(perm!=null){
            TextView need=label("需要先开启"+permName(perm)+" →",13,cAccent,false);need.setPadding(0,0,0,dp(6));parent.addView(need);
            need.setOnClickListener(v->openPermission(perm));
            refreshers.add(()->need.setVisibility(granted(perm)?View.GONE:View.VISIBLE));
        }
        return sw;
    }
    /** 存在 prefs 里的开关；返回它的子设置区（只在打开时显示，稍微缩进）。 */
    private LinearLayout toggle(LinearLayout parent,String key,String title,String infoText,String perm,java.util.function.Consumer<Boolean> after){
        LinearLayout sub=new LinearLayout(this);sub.setOrientation(LinearLayout.VERTICAL);sub.setPadding(dp(16),0,0,dp(4));
        boolean on=prefs.getBoolean(key,false);
        switchRow(parent,title,infoText,perm,on,value->{prefs.edit().putBoolean(key,value).apply();sub.setVisibility(value?View.VISIBLE:View.GONE);if(after!=null)after.accept(value);refreshAll();});
        parent.addView(sub);sub.setVisibility(on?View.VISIBLE:View.GONE);
        return sub;
    }
    /** 摘要：列出开着的几项（「应用联动开 · 爬墙开」）。 */
    private String onList(String[] pairs){
        StringBuilder b=new StringBuilder();
        for(int i=0;i<pairs.length;i+=2)if(prefs.getBoolean(pairs[i],false)){if(b.length()>0)b.append(" · ");b.append(pairs[i+1]).append("开");}
        return b.length()==0?"都没开":b.toString();
    }
    private String shortPlace(){String p=WeatherCompanion.place(prefs);int i=p.lastIndexOf(" · ");return i>=0?p.substring(i+3):p;}
    private String mascotClip(Catalog catalog){
        if(catalog==null)return null;
        String want=theme==null?"千千猫猫":theme.mascot;
        for(Catalog.Pet p:catalog.pets)if(p.name.equals(want))return p.clip("待机");
        Set<String> ids=prefs.getStringSet("selected",new HashSet<>(Arrays.asList("pet0","pet2")));
        for(Catalog.Pet p:catalog.pets)if(ids.contains(p.id))return p.clip("待机");
        return catalog.pets.isEmpty()?null:catalog.pets.get(0).clip("待机");
    }
    private void refreshAll(){for(Runnable r:refreshers)r.run();}
    // ---- 权限（Claude）：集中在「权限」卡片，每项显示已开启 / 未开启 ----
    private String permName(String p){switch(p){case P_OVERLAY:return "悬浮窗";case P_ACCESS:return "无障碍（界面互动）";case P_NOTIFY:return "通知使用权（音乐、歌词、外卖）";default:return "使用情况访问（应用联动）";}}
    private boolean granted(String p){
        switch(p){
            case P_OVERLAY:return Settings.canDrawOverlays(this);
            case P_ACCESS:{String s=Settings.Secure.getString(getContentResolver(),Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);return s!=null&&s.contains(getPackageName()+"/");}
            case P_NOTIFY:{String s=Settings.Secure.getString(getContentResolver(),"enabled_notification_listeners");return s!=null&&s.contains(getPackageName()+"/");}
            default:return UsageCompanion.allowed(this);
        }
    }
    /** 和原来各个「允许 xx」按钮一样跳到系统授权页。 */
    private void openPermission(String p){
        switch(p){
            case P_OVERLAY:try{startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,Uri.parse("package:"+getPackageName())));}catch(ActivityNotFoundException e){toast("请在系统设置中允许桌宠显示悬浮窗");}break;
            case P_ACCESS:stopService(new Intent(this,PetService.class));pendingStart=true;
                try{startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));}catch(ActivityNotFoundException e){toast("请在系统无障碍设置中开启「界面互动 · 梨间雪桌宠」");}break;
            case P_NOTIFY:stopService(new Intent(this,PetService.class));pendingStart=true;
                try{startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS));}catch(ActivityNotFoundException e){toast("请在系统设置中搜索通知使用权");}break;
            default:stopService(new Intent(this,PetService.class));pendingStart=true;
                try{startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS,Uri.parse("package:"+getPackageName())));}
                catch(ActivityNotFoundException e){try{startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS));}catch(ActivityNotFoundException ignored){toast("请在系统设置中搜索使用情况访问权限");}}
        }
    }
    private void permissionRow(LinearLayout parent,String p){
        LinearLayout row=new LinearLayout(this);row.setGravity(Gravity.CENTER_VERTICAL);row.setMinimumHeight(dp(52));parent.addView(row);
        LinearLayout words=new LinearLayout(this);words.setOrientation(LinearLayout.VERTICAL);row.addView(words,new LinearLayout.LayoutParams(0,-2,1));
        words.addView(label(permName(p),15,cText,false));
        TextView state=label("",12,cSub,false);words.addView(state);
        TextView go=label("去开启",14,cText,true);go.setGravity(Gravity.CENTER);go.setPadding(dp(14),0,dp(14),0);go.setBackground(new IslandPanel.PixelBox(cCard,0,block,1));
        row.addView(go,new LinearLayout.LayoutParams(-2,dp(38)));go.setOnClickListener(v->openPermission(p));
        refreshers.add(()->{boolean on=granted(p);state.setText(on?"已开启":"未开启");state.setTextColor(on?cAccent:cSub);go.setText(on?"去设置":"去开启");});
    }
    private void updatePermissionBar(){
        List<String> missing=new ArrayList<>();
        for(String p:new String[]{P_OVERLAY,P_ACCESS,P_NOTIFY,P_USAGE})if(!granted(p))missing.add(permName(p));
        permissionBar.setVisibility(missing.isEmpty()?View.GONE:View.VISIBLE);
        permissionText.setText("⚠ 还有 "+missing.size()+" 项权限没开："+String.join("、",missing));
    }
    // ---- 美化主题（Claude）：下拉框 + 灵动岛小样 + 导入 / 导出 / 删除 ----
    private void buildThemeCard(LinearLayout body){
        List<ThemeStore.Theme> all=ThemeStore.list(this);
        String[] names=new String[all.size()];int current=0;
        for(int i=0;i<all.size();i++){ThemeStore.Theme t=all.get(i);names[i]=t.name+(t.builtIn?"（内置）":"（导入）");if(theme!=null&&t.id.equals(theme.id))current=i;}
        LinearLayout row=new LinearLayout(this);row.setGravity(Gravity.CENTER_VERTICAL);body.addView(row,top(dp(4)));
        Spinner pick=new Spinner(this,Spinner.MODE_DROPDOWN);pick.setBackground(new IslandPanel.PixelBox(cCard,0,block,1));pick.setPopupBackgroundDrawable(new IslandPanel.PixelBox(cPanel,cRim,block,1));
        pick.setAdapter(new ArrayAdapter<String>(this,android.R.layout.simple_spinner_item,names){
            @Override public View getView(int pos,View convert,ViewGroup parent){TextView v=(TextView)super.getView(pos,convert,parent);v.setTextColor(cText);v.setPadding(dp(12),dp(8),dp(12),dp(8));return v;}
            @Override public View getDropDownView(int pos,View convert,ViewGroup parent){TextView v=(TextView)super.getView(pos,convert,parent);v.setTextColor(cText);v.setPadding(dp(14),dp(12),dp(14),dp(12));return v;}
        });
        pick.setSelection(current,false);
        pick.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener(){
            public void onItemSelected(AdapterView<?> p,View v,int pos,long id){ThemeStore.Theme t=all.get(pos);if(theme!=null&&t.id.equals(theme.id))return;ThemeStore.choose(MainActivity.this,t.id);toast("换成「"+t.name+"」啦");recreate();} // 选中马上生效
            public void onNothingSelected(AdapterView<?> p){}
        });
        row.addView(pick,new LinearLayout.LayoutParams(0,dp(46),1));
        // 灵动岛小样
        float density=getResources().getDisplayMetrics().density;int islandBlock=IslandHang.block(density);
        TextView preview=label("♫ 梨间雪",13,theme==null?Color.WHITE:theme.color("text"),false);preview.setGravity(Gravity.CENTER);preview.setSingleLine(true);
        IslandBackground art=IslandBackground.load(theme,islandBlock);
        if(art!=null){preview.setBackground(art);preview.setPadding(art.capWidth(),0,art.capWidth(),0);}
        LinearLayout.LayoutParams pp=new LinearLayout.LayoutParams(dp(140),IslandHang.height(islandBlock));pp.leftMargin=dp(10);row.addView(preview,pp);
        chips(body,new String[]{"导入美化","导出当前","删除"},new Runnable[]{this::importTheme,this::exportTheme,this::deleteTheme});
        note(body,"美化包是一个 .zip：theme.json 加三段灵动岛像素图（还可以放面板图标），只换颜色和图片，不会执行任何代码。格式说明在仓库 docs/美化包格式说明.md。");
    }
    private void importTheme(){
        Intent pick=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
            .putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"application/zip","application/x-zip-compressed","application/octet-stream"});
        try{startActivityForResult(pick,IMPORT_THEME);}catch(ActivityNotFoundException e){toast("这台手机打不开文件选择器");}
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(request!=IMPORT_THEME||result!=RESULT_OK||data==null||data.getData()==null)return;
        try{
            ThemeStore.Theme t=ThemeStore.importZip(this,data.getData());
            if(t==null){toast("导入失败：保存后读不出来");return;}
            ThemeStore.choose(this,t.id);toast("导入好啦，换成「"+t.name+"」");recreate();
        }catch(ThemeStore.ThemeError e){new AlertDialog.Builder(this).setTitle("导入失败").setMessage(e.getMessage()).setPositiveButton("知道了",null).show();}
    }
    private void exportTheme(){
        if(theme==null){toast("现在的主题读不出来");return;}
        try{
            java.io.File f=ThemeStore.export(this,theme);Uri uri=ShareProvider.uriFor(f);
            Intent send=new Intent(Intent.ACTION_SEND).setType("application/zip").putExtra(Intent.EXTRA_STREAM,uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            send.setClipData(ClipData.newRawUri(theme.name,uri));
            startActivity(Intent.createChooser(send,"导出美化包（可以选「保存到文件」）").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));
        }catch(java.io.IOException|RuntimeException e){toast("导出没成功，再试一次吧");}
    }
    private void deleteTheme(){
        if(theme==null||theme.builtIn){toast("内置的主题不能删");return;}
        String name=theme.name,id=theme.id;
        new AlertDialog.Builder(this).setTitle("删除「"+name+"」？").setMessage("删掉后会换回千千猫猫。").setPositiveButton("删除",(d,i)->{ThemeStore.delete(this,id);toast("删好啦");recreate();}).setNegativeButton("取消",null).show();
    }
    private void startPets(String action){
        if(selected().isEmpty()){toast("先选一只伙伴吧");return;} save();
        if(!Settings.canDrawOverlays(this)){
            pendingStart=true;
            try{startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,Uri.parse("package:"+getPackageName())));}catch(ActivityNotFoundException e){pendingStart=false;toast("请在系统设置中允许桌宠显示悬浮窗");}return;
        }
        if(Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},3);
        try{startForegroundService(new Intent(this,PetService.class).setAction(action));toast(action.equals("hug")?"让伙伴们试试贴贴":action.equals("focus-start")?"开始专注啦 🍅":action.equals("focus-stop")?"专注结束啦":"可以回到桌面看伙伴啦");}catch(RuntimeException e){toast("暂时无法开启，请回到应用再试一次");}
    }
    // ---- 更新（Claude）：查 GitHub 上的安卓发布页，有新版就问要不要下载，下载好打开系统安装界面 ----
    private String pendingVersion,pendingUrl;
    private boolean updateChecking;
    // 停在设置页时每 2 秒看一下下载好了没有（不注册系统广播）
    private final Handler poll=new Handler(Looper.getMainLooper());
    private final Runnable watchUpdates=new Runnable(){public void run(){
        if(UpdateChecker.due(prefs))checkUpdate(false);
        poll.postDelayed(this,60000);
    }};
    private final Runnable watchDownload=new Runnable(){public void run(){
        long id=prefs.getLong("updateDownload",-1);if(id==-1)return;
        int status=UpdateChecker.status(MainActivity.this,id);
        if(status==DownloadManager.STATUS_SUCCESSFUL)UpdateChecker.install(MainActivity.this,id);
        else if(status==DownloadManager.STATUS_FAILED||status==-1){prefs.edit().remove("updateDownload").apply();toast("下载没有成功，可以再点一次检查更新");}
        else poll.postDelayed(this,2000);
    }};
    private void checkUpdate(boolean manual){
        if(updateChecking){if(manual)toast("正在检查更新，请稍等…");return;}
        updateChecking=true;if(updateStatus!=null)updateStatus.setText("正在连接 GitHub 检查更新…");
        UpdateChecker.check(this,result->{
            updateChecking=false;if(isFinishing()||isDestroyed())return;
            if(updateStatus!=null)updateStatus.setText(prefs.getString("updateStatus",""));
            if(result.error!=null){
                if(manual)new AlertDialog.Builder(this).setTitle("未能检查更新").setMessage(result.error+"\n当前安装："+UpdateChecker.current(this))
                    .setPositiveButton("重试",(d,i)->checkUpdate(true)).setNeutralButton("打开发布页",(d,i)->openReleasePage()).setNegativeButton("关闭",null).show();
                return;
            }
            if(result.version==null){if(manual)toast("已检查，当前是最新版 "+UpdateChecker.current(this));return;}
            TextView details=new TextView(this);details.setPadding(dp(20),dp(12),dp(20),dp(12));
            details.setText("现在是 "+UpdateChecker.current(this)+"。下载并安装后设置会保留。\n\n"+(result.notes.isEmpty()?"本次发布未附更新说明。":result.notes));
            ScrollView notes=new ScrollView(this);notes.addView(details);
            new AlertDialog.Builder(this).setTitle("发现新版本 "+result.version).setView(notes)
                .setPositiveButton("下载",(d,i)->startDownload(result.version,result.url)).setNegativeButton("以后再说",null).show();
        });
    }
    private void openReleasePage(){try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(UpdateChecker.RELEASES)));}catch(ActivityNotFoundException e){toast("请用浏览器打开 github.com/Lumi729/desk-pets/releases");}}
    private void startDownload(String version,String url){
        if(Build.VERSION.SDK_INT>=26&&!getPackageManager().canRequestPackageInstalls()){
            pendingVersion=version;pendingUrl=url;
            try{startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+getPackageName())));toast("允许「安装未知应用」后回来就会开始下载");}
            catch(ActivityNotFoundException e){toast("请在系统设置里允许桌宠安装未知应用");}
            return;
        }
        UpdateChecker.download(this,version,url);toast("开始下载，好了会打开安装界面");poll.removeCallbacks(watchDownload);poll.postDelayed(watchDownload,2000);
    }
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);if("update".equals(intent.getAction())){intent.setAction(null);checkUpdate(true);}}
    @Override protected void onPause(){super.onPause();poll.removeCallbacks(watchDownload);poll.removeCallbacks(watchUpdates);}
    @Override protected void onResume(){super.onResume();updateWeatherStatus();
        if(pendingUrl!=null&&(Build.VERSION.SDK_INT<26||getPackageManager().canRequestPackageInstalls())){String v=pendingVersion,u=pendingUrl;pendingVersion=pendingUrl=null;startDownload(v,u);}
        poll.removeCallbacks(watchDownload);poll.post(watchDownload);
        if("update".equals(getIntent().getAction())){getIntent().setAction(null);checkUpdate(true);}
        else if(UpdateChecker.due(prefs))checkUpdate(false);
        poll.removeCallbacks(watchUpdates);poll.postDelayed(watchUpdates,60000);
        if(updateStatus!=null&&!updateChecking)updateStatus.setText(prefs.getString("updateStatus","还没有检查更新"));
        updateUsageStatus();refreshAll();if(pendingStart && Settings.canDrawOverlays(this)){pendingStart=false;startPets("start");}}
    private void toast(String s){Toast.makeText(this,s,Toast.LENGTH_SHORT).show();}
}

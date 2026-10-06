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
    private TextView permission;
    private SeekBar size;
    private Switch walking;
    private TextView usageStatus,interfaceStatus;
    private boolean pendingStart;
    int dp(int value) { return Math.round(value*getResources().getDisplayMetrics().density); }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state); prefs=getSharedPreferences("pets",MODE_PRIVATE);
        ScrollView scroll=new ScrollView(this); scroll.setFillViewport(true); scroll.setBackgroundColor(Color.rgb(255,248,251));
        page=new LinearLayout(this); page.setOrientation(LinearLayout.VERTICAL); page.setPadding(dp(24),dp(20),dp(24),dp(28)); scroll.addView(page); setContentView(scroll);
        if(Build.VERSION.SDK_INT>=30) scroll.setOnApplyWindowInsetsListener((v,insets)->{ android.graphics.Insets bars=insets.getInsets(android.view.WindowInsets.Type.systemBars()|android.view.WindowInsets.Type.displayCutout()); v.setPadding(bars.left,bars.top,bars.right,bars.bottom); return insets; });
        // Keep safe content padding on both gesture and three-button navigation.
        else scroll.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
        text("✦  梨间雪",32,true); text("把小小的陪伴，装进口袋。",16,false);
        text("安卓尝鲜版 · 0.2-preview · 输入联动与页面跳跃",13,false);
        permission=text("",14,false);
        button("让桌宠出来玩",()->startPets("start"));
        LinearLayout controls=new LinearLayout(this); page.addView(controls);
        smallButton(controls,"收起 / 继续",()->startPets("toggle"));
        smallButton(controls,"全部回家",()->{stopService(new Intent(this,PetService.class));toast("小动物回家啦");});
        text("陪你用手机",21,true);
        Switch companion=new Switch(this);companion.setText("应用联动");companion.setChecked(prefs.getBoolean("companion",false));page.addView(companion);
        companion.setOnCheckedChangeListener((v,on)->{prefs.edit().putBoolean("companion",on).apply();updateUsageStatus();});
        usageStatus=text("",14,false);
        text("全手机陪打字：检测到实际输入就一起打字，不用逐个设置应用，停下约 1.6 秒后停下。需要开启界面互动；密码框和不提供输入事件的页面无法联动。",13,false);
        button("允许识别当前应用",()->{
            stopService(new Intent(this,PetService.class));pendingStart=true;
            try{startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS,Uri.parse("package:"+getPackageName())));}
            catch(ActivityNotFoundException e){try{startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS));}catch(ActivityNotFoundException ignored){toast("请在系统设置中搜索使用情况访问权限");}}
        });
        button("设置每个应用的动作",()->chooseApp());
        text("浏览器、便签、搜索框等也会尝试陪打字；某个应用设为「不联动」时会尊重这个设置。",13,false);
        text("站到界面上",21,true);
        Switch ui=new Switch(this);ui.setText("界面互动 · 输入与键盘避让");ui.setChecked(prefs.getBoolean("interface",false));page.addView(ui);
        ui.setOnCheckedChangeListener((v,on)->{prefs.edit().putBoolean("interface",on).apply();InterfaceCompanion.clear();updateUsageStatus();});
        Switch perch=new Switch(this);perch.setText("自动跳上页面台阶（测试）");perch.setChecked(prefs.getBoolean("perching",false));page.addView(perch);
        perch.setOnCheckedChangeListener((v,on)->prefs.edit().putBoolean("perching",on).apply());
        interfaceStatus=text("",14,false);
        text("键盘弹出时站到键盘上沿，收起后落回屏幕。消息气泡、按钮、输入框、列表图片和卡片上沿都能尝试当小台阶，自己跳上去再逐级往下跳。不限 QQ；滑动后台阶消失会播放掉落和落地动画，落稳后再继续陪打字。应用提供的边界不同，识别不到就继续散步。",13,false);
        text("需要你单独开启无障碍服务。只使用输入变化事件与控件边界，不获取聊天文字、输入内容或截图，不代点按钮，不联网。",13,false);
        button("允许界面互动（无障碍）",()->{
            stopService(new Intent(this,PetService.class));pendingStart=true;
            try{startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));}
            catch(ActivityNotFoundException e){toast("请在系统无障碍设置中开启「界面互动 · 梨间雪桌宠」");}
        });
        text("摇一摇和灵动提示",21,true);
        option("motion","重力与摇晃互动");
        text("轻轻连续晃动会让宠物像弹力球一样蹦几秒，然后出现晕乎乎的彩虹效果；飞起来时倾斜手机可改变方向。无需用力摇。",13,false);
        option("island","顶部灵动提示条");
        option("islandMedia","音乐状态与播放控制");
        option("islandBattery","充电与电量提示");
        button("选择灵动岛通知来源",()->chooseNoticeApps());
        button("开始灵动岛计时器",()->new AlertDialog.Builder(this).setTitle("桌宠运行期间的计时器")
            .setItems(new String[]{"1 分钟", "5 分钟", "15 分钟", "25 分钟", "取消计时"},(d,i)->{
                long minutes=new long[]{1,5,15,25,0}[i];prefs.edit().putLong("timerEnd",minutes==0?0:System.currentTimeMillis()+minutes*60000).apply();startPets("start");}).show());
        text("点顶部提示条可展开音乐控制和计时器。音乐与通知来源需要下方的通知访问授权；通知仅显示你选中应用的标题。计时器不是系统闹钟，桌宠被强制关闭后不能保证准时提醒。",13,false);
        option("delivery","外卖通知提示");
        text("外卖提示需单独授予通知访问权限。只在本机临时匹配美团/美团外卖/饿了么的取餐通知标题和正文，不保存或上传，不读取其他应用通知。仅转述通知，不能查询订单或保证外卖真的送达。",13,false);
        button("允许音乐与通知访问",()->{
            stopService(new Intent(this,PetService.class));pendingStart=true;
            try{startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS));}catch(ActivityNotFoundException e){toast("请在系统设置中搜索通知使用权");}
        });
        text("提示条可以点一下隐藏；熄屏或收起宠物时停止摇晃检测。",13,false);
        text("选择陪你的伙伴",21,true);
        text("最多同时 3 只；点一下摸摸，双击跳起来，拖动放手会落下，长按回到这里。",14,false);
        Set<String> selected=prefs.getStringSet("selected",new HashSet<>(Arrays.asList("pet0","pet2")));
        try {
            Catalog catalog=new Catalog(this);
            for(Catalog.Pet pet:catalog.pets) {
                LinearLayout row=new LinearLayout(this); row.setGravity(Gravity.CENTER_VERTICAL); row.setPadding(dp(10),dp(4),dp(10),dp(4));
                GradientDrawable bg=new GradientDrawable();bg.setColor(Color.WHITE);bg.setCornerRadius(dp(18)); row.setBackground(bg);
                LinearLayout.LayoutParams rp=new LinearLayout.LayoutParams(-1,dp(82));rp.topMargin=dp(8);page.addView(row,rp);
                PetView view=new PetView(this);view.show(pet.clip("待机"));row.addView(view,new LinearLayout.LayoutParams(dp(70),dp(70)));
                CheckBox check=new CheckBox(this);check.setText(pet.label);check.setTextSize(15);check.setChecked(selected.contains(pet.id));row.addView(check,new LinearLayout.LayoutParams(0,-2,1)); choices.put(pet.id,check);
                check.setOnCheckedChangeListener((b,on)->{if(on && selected().size()>3){b.setChecked(false);toast("手机上先让 3 只一起玩哦");} save();});
                row.setOnClickListener(v->check.setChecked(!check.isChecked()));
            }
        } catch(Exception error) { text("素材没有加载成功，请重新安装完整安装包。",16,true); }
        text("舒舒服服地陪着你",21,true);
        TextView sizeLabel=text("宠物大小",15,false);
        size=new SeekBar(this);size.setMax(80);size.setProgress(prefs.getInt("size",88)-56);page.addView(size);
        size.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){public void onStartTrackingTouch(SeekBar b){} public void onStopTrackingTouch(SeekBar b){save();} public void onProgressChanged(SeekBar b,int value,boolean user){sizeLabel.setText(getString(R.string.pet_size,value+56));}});
        walking=new Switch(this);walking.setText("让它们自己散步");walking.setChecked(prefs.getBoolean("walking",true));page.addView(walking);walking.setOnCheckedChangeListener((v,on)->save());
        button("应用选择和大小",()->startPets("start"));
        button("试试贴贴 ♡",()->startPets("hug"));
        button("测试动作 / 功能展示",()->new AlertDialog.Builder(this).setTitle("让伙伴演给你看")
            .setItems(new String[]{"陪我打字", "一起看视频", "一起跳舞", "蹦起来", "气泡台阶跳跃演示", "打字中掉落 → 落稳继续打字", "窄台阶站稳测试", "摇晃与彩虹演示", "灵动提示演示"},(d,which)->startPets(new String[]{"test-type","test-video","test-music","test-jump","test-perch","test-drop","test-narrow","test-shake","test-island"}[which])).show());
        text("贴贴沿用电脑版的搭配规则，选两只有对应动画的伙伴就能试。百变猫猫这一版先手动选花色。",13,false);
        text("第一次需要你允许“显示在其他应用上层”。通知栏可收起或关闭；熄屏时暂停。若后台被手机清理，可在系统的应用电池设置中允许后台运行。",13,false);
        text("这一版不联网。界面互动只看控件位置和输入变化，不读取聊天文字或按键内容。",13,false);
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
    private void option(String key,String title){Switch s=new Switch(this);s.setText(title);s.setChecked(prefs.getBoolean(key,false));page.addView(s);s.setOnCheckedChangeListener((v,on)->prefs.edit().putBoolean(key,on).apply());}
    private TextView text(String s,int sp,boolean bold){TextView v=new TextView(this);v.setText(s);v.setTextSize(sp);v.setTextColor(Color.rgb(102,66,84));if(bold)v.setTypeface(null,android.graphics.Typeface.BOLD);v.setPadding(0,dp(10),0,dp(8));page.addView(v);return v;}
    private void button(String name,Runnable action){Button b=new Button(this);b.setText(name);b.setAllCaps(false);page.addView(b,new LinearLayout.LayoutParams(-1,dp(54)));b.setOnClickListener(v->action.run());}
    private void smallButton(LinearLayout row,String name,Runnable action){Button b=new Button(this);b.setText(name);row.addView(b,new LinearLayout.LayoutParams(0,dp(52),1));b.setOnClickListener(v->action.run());}
    private Set<String> selected(){Set<String> ids=new HashSet<>();for(Map.Entry<String,CheckBox> c:choices.entrySet())if(c.getValue().isChecked())ids.add(c.getKey());return ids;}
    private void save(){android.content.SharedPreferences.Editor e=prefs.edit().putStringSet("selected",selected());if(size!=null)e.putInt("size",size.getProgress()+56);if(walking!=null)e.putBoolean("walking",walking.isChecked());e.apply();}
    private void startPets(String action){
        if(selected().isEmpty()){toast("先选一只伙伴吧");return;} save();
        if(!Settings.canDrawOverlays(this)){
            pendingStart=true;
            try{startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,Uri.parse("package:"+getPackageName())));}catch(ActivityNotFoundException e){pendingStart=false;toast("请在系统设置中允许桌宠显示悬浮窗");}return;
        }
        if(Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},3);
        try{startForegroundService(new Intent(this,PetService.class).setAction(action));toast(action.equals("hug")?"让伙伴们试试贴贴":"可以回到桌面看伙伴啦");}catch(RuntimeException e){toast("暂时无法开启，请回到应用再试一次");}
    }
    @Override protected void onResume(){super.onResume();updateUsageStatus();if(permission!=null)permission.setText(Settings.canDrawOverlays(this)?"✧ 悬浮窗已允许":"✧ 初次开启需允许悬浮窗");if(pendingStart && Settings.canDrawOverlays(this)){pendingStart=false;startPets("start");}}
    private void toast(String s){Toast.makeText(this,s,Toast.LENGTH_SHORT).show();}
}

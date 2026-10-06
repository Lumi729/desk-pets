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
        text("安卓尝鲜版 · 先接两三只回家",13,false);
        permission=text("",14,false);
        button("让桌宠出来玩",()->startPets("start"));
        LinearLayout controls=new LinearLayout(this); page.addView(controls);
        smallButton(controls,"收起 / 继续",()->startPets("toggle"));
        smallButton(controls,"全部回家",()->{stopService(new Intent(this,PetService.class));toast("小动物回家啦");});
        text("选择陪你的伙伴",21,true);
        text("最多同时 3 只；点一下摸摸，拖动放手会落下，长按回到这里。",14,false);
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
        text("贴贴沿用电脑版的搭配规则，选两只有对应动画的伙伴就能试。百变猫猫这一版先手动选花色。",13,false);
        text("第一次需要你允许“显示在其他应用上层”。通知栏可收起或关闭；熄屏时暂停。若后台被手机清理，可在系统的应用电池设置中允许后台运行。",13,false);
        text("这一版不联网，不读取屏幕、聊天和按键。",13,false);
    }
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
    @Override protected void onResume(){super.onResume();if(permission!=null)permission.setText(Settings.canDrawOverlays(this)?"✧ 悬浮窗已允许":"✧ 初次开启需允许悬浮窗");if(pendingStart && Settings.canDrawOverlays(this)){pendingStart=false;startPets("start");}}
    private void toast(String s){Toast.makeText(this,s,Toast.LENGTH_SHORT).show();}
}

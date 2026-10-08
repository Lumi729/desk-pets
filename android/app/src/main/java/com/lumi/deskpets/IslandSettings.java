package com.lumi.deskpets;

import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.view.WindowManager;
import android.widget.*;

/** Shared controls for the app settings page and the floating island menu. */
final class IslandSettings {
    static AlertDialog open(Context context, boolean overlay, Runnable preview) {
        SharedPreferences prefs = context.getSharedPreferences("pets", Context.MODE_PRIVATE);
        LinearLayout box = new LinearLayout(context); box.setOrientation(LinearLayout.VERTICAL);
        int pad = Math.round(20 * context.getResources().getDisplayMetrics().density);
        box.setPadding(pad, pad / 2, pad, pad / 2);
        TextView hint = new TextView(context);
        hint.setText("调好会自动记住，重启后也保留。开启拖动后，按住提示条移动；轻点仍打开通知，长按不动打开面板。"); box.addView(hint);
        SeekBar scale = slider(context, box, "大小", 60, 140, IslandHang.percent(prefs.getInt("islandScale", 100)), value -> prefs.edit().putInt("islandScale", value).apply());
        SeekBar x = slider(context, box, "左右位置（左 → 右）", 0, 100, Math.round(prefs.getFloat("islandX", .5f) * 100), value -> prefs.edit().putFloat("islandX", value / 100f).apply());
        SeekBar y = slider(context, box, "上下位置（上 → 下）", 0, 100, Math.round(Math.max(0, prefs.getFloat("islandY", -1)) * 100), value -> prefs.edit().putFloat("islandY", value / 100f).apply());
        CheckBox drag = new CheckBox(context); drag.setText("允许拖动灵动岛"); drag.setChecked(prefs.getBoolean("islandDrag", false)); box.addView(drag);
        drag.setOnCheckedChangeListener((button, enabled) -> prefs.edit().putBoolean("islandDrag", enabled).apply());
        Button reset = new Button(context); reset.setText("恢复默认大小和顶部居中"); box.addView(reset);
        reset.setOnClickListener(v -> { prefs.edit().remove("islandScale").remove("islandX").remove("islandY").apply(); scale.setProgress(40); x.setProgress(50); y.setProgress(0); });
        ScrollView scroll = new ScrollView(context); scroll.addView(box);
        AlertDialog dialog = new AlertDialog.Builder(context).setTitle("灵动岛 · 位置与大小").setView(scroll)
            .setNeutralButton("显示预览 / 试拖动", (d, which) -> preview.run()).setPositiveButton("完成", null).create();
        if (overlay) dialog.getWindow().setType(WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY);
        dialog.show(); return dialog;
    }
    private interface Change { void set(int value); }
    private static SeekBar slider(Context context, LinearLayout box, String title, int min, int max, int value, Change change) {
        TextView label = new TextView(context); box.addView(label);
        SeekBar bar = new SeekBar(context); bar.setMax(max - min); box.addView(bar);
        bar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            public void onStartTrackingTouch(SeekBar b) {}
            public void onStopTrackingTouch(SeekBar b) {}
            public void onProgressChanged(SeekBar b, int progress, boolean user) { label.setText(title + "：" + (progress + min) + "%"); if (user) change.set(progress + min); }
        });
        bar.setProgress(Math.max(0, Math.min(max - min, value - min))); label.setText(title + "：" + (bar.getProgress() + min) + "%"); return bar;
    }
}

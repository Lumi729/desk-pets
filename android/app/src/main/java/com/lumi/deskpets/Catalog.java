package com.lumi.deskpets;

import android.content.Context;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

final class Catalog {
    static final class Pet {
        final String id, label, name;
        final JSONObject clips;
        Pet(JSONObject o) throws JSONException { id=o.getString("id"); label=o.getString("label"); name=o.optString("name",label); clips=o.getJSONObject("clips"); }
        String clip(String action) { return clips.optString(action, clips.optString("待机")); }
    }
    final List<Pet> pets = new ArrayList<>();
    final JSONObject hugs;
    final JSONObject island; // 灵动岛三段像素图（旧素材包没有就是 null）
    final JSONObject stories; // 特别剧情：helpup / blanket → 宠物 id → { file, dogLeft }
    Catalog(Context context) throws IOException, JSONException {
        try (InputStream in=context.getAssets().open("catalog.json")) {
            ByteArrayOutputStream bytes=new ByteArrayOutputStream();
            byte[] buffer=new byte[4096]; int n;
            while ((n=in.read(buffer))!=-1) bytes.write(buffer,0,n);
            JSONObject root=new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
            JSONArray items=root.getJSONArray("pets");
            for(int i=0;i<items.length();i++) pets.add(new Pet(items.getJSONObject(i)));
            hugs=root.getJSONObject("hugs");
            island=root.optJSONObject("island");
            JSONObject st=root.optJSONObject("stories");stories=st==null?new JSONObject():st;
        }
    }
    /** 特别剧情的动画（没有就是 null）。 */
    JSONObject story(String kind, Pet pet) { JSONObject k=stories.optJSONObject(kind); return k==null?null:k.optJSONObject(pet.id); }
    String hug(Pet a, Pet b) { return hugs.optString(a.id+":"+b.id, hugs.optString(b.id+":"+a.id, "")); }
}

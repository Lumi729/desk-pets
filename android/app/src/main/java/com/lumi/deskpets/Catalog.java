package com.lumi.deskpets;

import android.content.Context;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

final class Catalog {
    static final class Pet {
        final String id, label, name, skin; // skin：百变猫猫的哪只小猫（别的宠物是空字符串）
        final JSONObject clips;
        Pet(JSONObject o) throws JSONException { id=o.getString("id"); label=o.getString("label"); name=o.optString("name",label); skin=o.isNull("skin")?"":o.optString("skin",""); clips=o.getJSONObject("clips"); }
        String clip(String action) { return clips.optString(action, clips.optString("待机")); }
    }
    final List<Pet> pets = new ArrayList<>();
    final JSONObject hugs;
    final JSONObject island; // 灵动岛三段像素图（旧素材包没有就是 null）
    final JSONObject nest; // 小窝前后两层（Claude）
    final JSONObject stacks; // 叠叠乐：「下>中>上」的 id → 文件
    final JSONObject stories; // 特别剧情：helpup / blanket → 宠物 id → { file, dogLeft }；fight / makeup → 「id:id」→ 文件
    // 挑衅（从电脑版 teases.js 生成）：挑衅的那只 → 被挑衅的哥哥和每种挑衅的回应步骤
    static final class Tease { String target; final Map<String,List<String>> replies=new LinkedHashMap<>(); }
    final Map<String,Tease> teases=new LinkedHashMap<>();
    long teaseWindow=600_000; int teaseLimit=3;
    Catalog(Context context) throws IOException, JSONException {
        try (InputStream in=context.getAssets().open("catalog.json")) {
            ByteArrayOutputStream bytes=new ByteArrayOutputStream();
            byte[] buffer=new byte[4096]; int n;
            while ((n=in.read(buffer))!=-1) bytes.write(buffer,0,n);
            JSONObject root=new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
            JSONArray items=root.getJSONArray("pets");
            for(int i=0;i<items.length();i++) pets.add(new Pet(items.getJSONObject(i)));
            hugs=root.getJSONObject("hugs");
            island=root.optJSONObject("island");nest=root.optJSONObject("nest");
            JSONObject sk=root.optJSONObject("stacks");stacks=sk==null?new JSONObject():sk;
            JSONObject st=root.optJSONObject("stories");stories=st==null?new JSONObject():st;
            JSONObject t=root.optJSONObject("teases");
            if(t!=null){
                teaseWindow=t.optLong("window",teaseWindow);teaseLimit=t.optInt("limit",teaseLimit);
                JSONObject pairs=t.optJSONObject("pairs");
                for(Iterator<String> it=pairs==null?Collections.<String>emptyIterator():pairs.keys();it.hasNext();){
                    String teaser=it.next();JSONObject o=pairs.getJSONObject(teaser);Tease tz=new Tease();tz.target=o.getString("target");
                    JSONObject r=o.getJSONObject("replies");
                    for(Iterator<String> k=r.keys();k.hasNext();){String name=k.next();JSONArray steps=r.getJSONArray(name);List<String> list=new ArrayList<>();for(int i=0;i<steps.length();i++)list.add(steps.getString(i));tz.replies.put(name,list);}
                    teases.put(teaser,tz);
                }
            }
        }
    }
    /** 特别剧情的动画（没有就是 null）。 */
    JSONObject story(String kind, Pet pet) { JSONObject k=stories.optJSONObject(kind); return k==null?null:k.optJSONObject(pet.id); }
    /** 两只一起的特别剧情（打架 / 和好），没有就是空字符串。 */
    String pairStory(String kind, Pet a, Pet b) { JSONObject k=stories.optJSONObject(kind); return k==null?"":k.optString(a.id+":"+b.id, k.optString(b.id+":"+a.id, "")); }
    /** 叠叠乐动画（从下到上），没有就是空字符串。 */
    String stack(List<Pet> bottomToTop) { StringBuilder k=new StringBuilder(); for(Pet p:bottomToTop){ if(k.length()>0)k.append('>'); k.append(p.id); } return stacks.optString(k.toString(), ""); }
    /** 百变猫猫的五只小猫（按顺序）。 */
    List<Pet> cats() { List<Pet> list=new ArrayList<>(); for(Pet p:pets) if(!p.skin.isEmpty()) list.add(p); return list; }
    String hug(Pet a, Pet b) { return hugs.optString(a.id+":"+b.id, hugs.optString(b.id+":"+a.id, "")); }
}

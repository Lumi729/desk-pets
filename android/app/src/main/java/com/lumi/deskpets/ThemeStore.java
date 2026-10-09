package com.lumi.deskpets;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;
import org.json.JSONObject;

/**
 * 美化主题（Claude，照「美化包格式说明.md」v1）：内置的两个包在 assets/themes/，导入的放在 app 私有目录 files/themes/<id>.zip。
 * 导入时只留白名单里的文件、检查路径和大小、PNG 必须能解码，再重新打包保存；美化包里不会有、也不会执行任何代码。
 */
final class ThemeStore {
    private ThemeStore(){}
    static final String[] BUILT_IN={"qianqian","lili-bunny"};
    /** 导入 / 读取失败的原因（一句中文）。 */
    static final class ThemeError extends Exception{ThemeError(String m){super(m);}}

    static final class Theme{
        final String id,name,mascot;final boolean builtIn;final int[] colors;
        final Map<String,byte[]> files; // 只有白名单里的文件
        private final Map<String,Bitmap> bitmaps=new LinkedHashMap<>();
        Theme(String id,String name,String mascot,boolean builtIn,int[] colors,Map<String,byte[]> files){this.id=id;this.name=name;this.mascot=mascot;this.builtIn=builtIn;this.colors=colors;this.files=files;}
        int color(String key){return colors[ThemeRules.index(key)];}
        boolean hasPatch(){return color("patch")!=0;}
        synchronized Bitmap bitmap(String file){
            if(bitmaps.containsKey(file))return bitmaps.get(file);
            byte[] b=files.get(file);Bitmap bmp=b==null?null:BitmapFactory.decodeByteArray(b,0,b.length);
            bitmaps.put(file,bmp);return bmp;
        }
        /** 面板图标：主题里有 icons/<name>.png 就用它，没有就用默认图标按 colors.icon 着色（粉色部分不变）。 */
        synchronized Bitmap icon(Context c,String name,int res){
            String key="@icon:"+name;if(bitmaps.containsKey(key))return bitmaps.get(key);
            Bitmap own=bitmap("icons/"+name+".png");
            if(own==null){
                BitmapFactory.Options o=new BitmapFactory.Options();o.inScaled=false;o.inMutable=true;
                own=BitmapFactory.decodeResource(c.getResources(),res,o);
                if(own!=null){int ic=color("icon");int[] px=new int[own.getWidth()*own.getHeight()];own.getPixels(px,0,own.getWidth(),0,0,own.getWidth(),own.getHeight());
                    for(int i=0;i<px.length;i++)px[i]=ThemeRules.recolor(px[i],ic);own.setPixels(px,0,own.getWidth(),0,0,own.getWidth(),own.getHeight());}
            }
            bitmaps.put(key,own);return own;
        }
    }

    private static Theme cached;
    /** 现在用的主题（prefs "theme"，默认千千猫猫）；读不出来就退回千千猫猫。 */
    static synchronized Theme current(Context c){
        String id=c.getSharedPreferences("pets",Context.MODE_PRIVATE).getString("theme",ThemeRules.DEFAULT_ID);
        if(cached!=null&&cached.id.equals(id))return cached;
        Theme t=load(c,id);if(t==null)t=load(c,ThemeRules.DEFAULT_ID);
        cached=t;return t;
    }
    static synchronized void forget(){cached=null;}
    static void choose(Context c,String id){c.getSharedPreferences("pets",Context.MODE_PRIVATE).edit().putString("theme",id).apply();forget();}
    static boolean isBuiltIn(String id){return Arrays.asList(BUILT_IN).contains(id);}
    private static File dir(Context c){File d=new File(c.getFilesDir(),"themes");if(!d.isDirectory())d.mkdirs();return d;}
    /** 内置在前，导入的按名字排。 */
    static List<Theme> list(Context c){
        List<Theme> all=new ArrayList<>();
        for(String id:BUILT_IN){Theme t=load(c,id);if(t!=null)all.add(t);}
        File[] files=dir(c).listFiles((d,n)->n.endsWith(".zip"));
        List<Theme> imported=new ArrayList<>();
        if(files!=null)for(File f:files){Theme t=load(c,f.getName().substring(0,f.getName().length()-4));if(t!=null&&!t.builtIn)imported.add(t);}
        imported.sort((a,b)->a.name.compareTo(b.name));all.addAll(imported);
        return all;
    }
    static Theme load(Context c,String id){
        if(!ThemeRules.validId(id))return null;
        try{
            byte[] zip;boolean builtIn=isBuiltIn(id);
            if(builtIn)try(InputStream in=c.getAssets().open("themes/"+id+".zip")){zip=read(in,ThemeRules.MAX_PACK);}
            else{File f=new File(dir(c),id+".zip");if(!f.isFile())return null;try(InputStream in=new java.io.FileInputStream(f)){zip=read(in,ThemeRules.MAX_PACK);}}
            return parse(zip,builtIn);
        }catch(IOException|ThemeError e){return null;}
    }
    /** 用系统文件选择器选好的 .zip 导入：检查通过才保存，返回新主题；不通过抛出一句中文原因。 */
    static Theme importZip(Context c,Uri uri) throws ThemeError {
        String name=displayName(c,uri);
        if(name!=null&&!name.toLowerCase(java.util.Locale.ROOT).endsWith(".zip"))throw new ThemeError("只能导入 .zip 美化包");
        byte[] zip;
        try(InputStream in=c.getContentResolver().openInputStream(uri)){if(in==null)throw new ThemeError("打不开这个文件");zip=read(in,ThemeRules.MAX_PACK);}
        catch(IOException e){throw new ThemeError(e.getMessage()!=null&&e.getMessage().startsWith("太大")?"美化包超过 2 MB 了":"读不了这个文件");}
        Theme t=parse(zip,false);
        if(isBuiltIn(t.id))throw new ThemeError("id「"+t.id+"」和内置主题重名了，请换一个 id");
        try(OutputStream out=new FileOutputStream(new File(dir(c),t.id+".zip"))){write(t,out);}
        catch(IOException e){throw new ThemeError("保存美化包失败");}
        return load(c,t.id);
    }
    /** 把当前主题打包成 .zip（只有白名单里的文件），放到缓存里给系统分享。 */
    static File export(Context c,Theme t) throws IOException {
        File d=new File(c.getCacheDir(),"share");if(!d.isDirectory()&&!d.mkdirs())throw new IOException("no dir");
        File[] old=d.listFiles();if(old!=null)for(File f:old)if(!f.delete())f.deleteOnExit();
        File f=new File(d,"梨间雪美化-"+t.id+".zip");
        try(OutputStream out=new FileOutputStream(f)){write(t,out);}
        return f;
    }
    /** 只能删导入的；删掉正在用的就切回千千猫猫。 */
    static boolean delete(Context c,String id){
        if(isBuiltIn(id)||!ThemeRules.validId(id))return false;
        boolean ok=new File(dir(c),id+".zip").delete();
        String now=c.getSharedPreferences("pets",Context.MODE_PRIVATE).getString("theme",ThemeRules.DEFAULT_ID);
        if(id.equals(now))choose(c,ThemeRules.DEFAULT_ID);
        forget();return ok;
    }
    // ---- 解析和安全检查 ----
    static Theme parse(byte[] zip,boolean builtIn) throws ThemeError {
        if(zip.length>ThemeRules.MAX_PACK)throw new ThemeError("美化包超过 2 MB 了");
        Map<String,byte[]> files=new LinkedHashMap<>();
        try(ZipInputStream in=new ZipInputStream(new java.io.ByteArrayInputStream(zip))){
            ZipEntry e;long total=0;
            while((e=in.getNextEntry())!=null){
                String n=e.getName();
                if(ThemeRules.unsafe(n))throw new ThemeError("美化包里有不安全的路径（"+n+"），没有导入");
                if(e.isDirectory())continue;
                String keep=ThemeRules.allowed(n);
                byte[] data=read(in,n.endsWith(".png")?ThemeRules.MAX_IMAGE:ThemeRules.MAX_PACK);
                total+=data.length;if(total>ThemeRules.MAX_PACK)throw new ThemeError("美化包解压后超过 2 MB 了");
                if(keep!=null)files.put(keep,data); // 其他文件忽略
            }
        }catch(IOException e){
            String m=e.getMessage();
            throw new ThemeError(m!=null&&m.startsWith("太大")?"有一张图片超过 512 KB 了":"这个 .zip 打不开，可能已经损坏");
        }
        byte[] json=files.get("theme.json");
        if(json==null)throw new ThemeError("没有找到 theme.json（要放在压缩包最外层）");
        for(String part:ThemeRules.ISLAND)if(!files.containsKey(part))throw new ThemeError("缺少灵动岛图片 "+part);
        int height=-1;
        for(Map.Entry<String,byte[]> f:files.entrySet()){
            if(!f.getKey().endsWith(".png"))continue;
            BitmapFactory.Options o=new BitmapFactory.Options();o.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(f.getValue(),0,f.getValue().length,o);
            if(o.outWidth<=0||o.outHeight<=0||!"image/png".equals(o.outMimeType))throw new ThemeError(f.getKey()+" 不是能读的 PNG 图片");
            if(ThemeRules.ISLAND.contains(f.getKey())){if(height<0)height=o.outHeight;else if(height!=o.outHeight)throw new ThemeError("灵动岛三张图要一样高");}
        }
        try{
            JSONObject root=new JSONObject(new String(json,"UTF-8"));
            String id=root.optString("id","");
            if(!ThemeRules.validId(id))throw new ThemeError("theme.json 里的 id 只能用小写字母、数字和 -");
            if(root.optInt("version",0)!=ThemeRules.VERSION)throw new ThemeError("这个美化包的格式版本不认识（目前只认 1）");
            String name=root.optString("name",id).trim();if(name.isEmpty())name=id;if(name.length()>20)name=name.substring(0,20);
            int[] colors=ThemeRules.DEFAULT_COLORS.clone();
            JSONObject cs=root.optJSONObject("colors");
            if(cs!=null)for(int i=0;i<ThemeRules.COLOR_KEYS.length;i++){
                String key=ThemeRules.COLOR_KEYS[i];if(!cs.has(key))continue;
                Integer v=ThemeRules.color(cs.optString(key));
                if(v==null)throw new ThemeError("颜色 "+key+" 要写成 #RRGGBB 或 #AARRGGBB");
                colors[i]=v;
            }
            return new Theme(id,name,root.optString("mascot",""),builtIn,colors,files);
        }catch(org.json.JSONException|java.io.UnsupportedEncodingException e){throw new ThemeError("theme.json 写得不对，读不出来");}
    }
    private static void write(Theme t,OutputStream out) throws IOException {
        try(ZipOutputStream zip=new ZipOutputStream(out)){
            for(Map.Entry<String,byte[]> f:t.files.entrySet()){zip.putNextEntry(new ZipEntry(f.getKey()));zip.write(f.getValue());zip.closeEntry();}
        }
    }
    private static byte[] read(InputStream in,int limit) throws IOException {
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();byte[] buf=new byte[8192];int n;
        while((n=in.read(buf))!=-1){if(bytes.size()+n>limit)throw new IOException("太大");bytes.write(buf,0,n);}
        return bytes.toByteArray();
    }
    private static String displayName(Context c,Uri uri){
        try(android.database.Cursor cur=c.getContentResolver().query(uri,new String[]{android.provider.OpenableColumns.DISPLAY_NAME},null,null,null)){
            if(cur!=null&&cur.moveToFirst())return cur.getString(0);
        }catch(RuntimeException ignored){}
        return null;
    }
}

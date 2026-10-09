package com.lumi.deskpets;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/** 分享表情（Claude）：把当前 GIF 拷到缓存里的 share/ 文件夹，只读地交给用户选的应用（临时授权，不对外开放）。 */
public final class ShareProvider extends ContentProvider {
    static final String AUTHORITY="com.lumi.deskpets.share";
    /** 拷一份 GIF，返回分享用的地址；每次覆盖同一个文件，不攒文件。 */
    static Uri copy(Context context,String asset,String name) throws IOException {
        File dir=new File(context.getCacheDir(),"share");
        if(!dir.isDirectory()&&!dir.mkdirs())throw new IOException("no share dir");
        File[] old=dir.listFiles();if(old!=null)for(File f:old)if(!f.delete())f.deleteOnExit();
        File file=new File(dir,name.replaceAll("[\\\\/:*?\"<>|]","_")+".gif");
        try(InputStream in=context.getAssets().open(asset);OutputStream out=new FileOutputStream(file)){
            byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))!=-1)out.write(buffer,0,n);
        }
        return new Uri.Builder().scheme("content").authority(AUTHORITY).appendPath(file.getName()).build();
    }
    /** 已经放在缓存 share/ 里的文件（导出美化包用）。 */
    static Uri uriFor(File file){return new Uri.Builder().scheme("content").authority(AUTHORITY).appendPath(file.getName()).build();}
    private File file(Uri uri) throws FileNotFoundException {
        Context context=getContext();String name=uri.getLastPathSegment();
        if(context==null||name==null||name.contains("/")||name.startsWith("."))throw new FileNotFoundException();
        File file=new File(new File(context.getCacheDir(),"share"),name);
        if(!file.isFile())throw new FileNotFoundException();
        return file;
    }
    @Override public boolean onCreate(){return true;}
    @Override public String getType(Uri uri){String n=uri.getLastPathSegment();return n!=null&&n.endsWith(".zip")?"application/zip":"image/gif";} // 导出的美化包是 .zip
    @Override public ParcelFileDescriptor openFile(Uri uri,String mode) throws FileNotFoundException {
        if(!"r".equals(mode))throw new FileNotFoundException("read only");
        return ParcelFileDescriptor.open(file(uri),ParcelFileDescriptor.MODE_READ_ONLY);
    }
    @Override public Cursor query(Uri uri,String[] projection,String selection,String[] args,String sort){
        File file;try{file=file(uri);}catch(FileNotFoundException e){return null;}
        MatrixCursor cursor=new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE});
        cursor.addRow(new Object[]{file.getName(),file.length()});
        return cursor;
    }
    @Override public Uri insert(Uri uri,ContentValues values){throw new UnsupportedOperationException();}
    @Override public int delete(Uri uri,String selection,String[] args){throw new UnsupportedOperationException();}
    @Override public int update(Uri uri,ContentValues values,String selection,String[] args){throw new UnsupportedOperationException();}
}

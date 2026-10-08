package com.lumi.deskpets;
import android.content.*;
import android.media.MediaMetadata;
import android.media.session.*;
import java.util.List;

/** Only used after the user's notification-access grant and media toggle. */
final class IslandMedia {
    private final Context context;
    private MediaController selected;
    String title="";
    boolean playing;
    // 滚动歌词要用（Claude）：歌手、时长、哪个 App、播放进度（position 是 lastUpdate 那一刻的位置，lastUpdate 是 elapsedRealtime）
    String artist="",pkg="";
    long duration,position,lastUpdate;
    float speed=1;
    IslandMedia(Context c){context=c;}
    void refresh(){
        selected=null;title="";playing=false;artist="";pkg="";duration=position=lastUpdate=0;speed=1;
        try{
            List<MediaController> sessions=context.getSystemService(MediaSessionManager.class).getActiveSessions(new ComponentName(context,DeliveryCompanion.class));
            for(MediaController c:sessions){PlaybackState p=c.getPlaybackState();if(p==null)continue;
                if(selected==null||p.getState()==PlaybackState.STATE_PLAYING){selected=c;if(p.getState()==PlaybackState.STATE_PLAYING)break;}}
            if(selected!=null){PlaybackState p=selected.getPlaybackState();playing=p!=null&&p.getState()==PlaybackState.STATE_PLAYING;
                MediaMetadata m=selected.getMetadata();CharSequence t=m==null?null:m.getText(MediaMetadata.METADATA_KEY_TITLE);title=t==null?"媒体播放":t.toString();
                CharSequence ar=m==null?null:m.getText(MediaMetadata.METADATA_KEY_ARTIST);artist=ar==null?"":ar.toString();
                duration=m==null?0:Math.max(0,m.getLong(MediaMetadata.METADATA_KEY_DURATION));pkg=selected.getPackageName();
                if(p!=null){position=p.getPosition();lastUpdate=p.getLastPositionUpdateTime();speed=p.getPlaybackSpeed();}}
        }catch(SecurityException e){clear();}
    }
    void clear(){selected=null;title="";playing=false;artist="";pkg="";duration=position=lastUpdate=0;speed=1;}
    /** 现在播到哪（毫秒）：按媒体会话最后报的位置和时间往后推，暂停就停住。 */
    long now(){return LyricRules.position(position,lastUpdate,android.os.SystemClock.elapsedRealtime(),speed,playing);}
    void control(int action){
        refresh();if(selected==null)return;
        PlaybackState p=selected.getPlaybackState();long actions=p==null?0:p.getActions();MediaController.TransportControls c=selected.getTransportControls();
        if(action==0 && (actions&PlaybackState.ACTION_SKIP_TO_PREVIOUS)!=0)c.skipToPrevious();
        if(action==2 && (actions&PlaybackState.ACTION_SKIP_TO_NEXT)!=0)c.skipToNext();
        if(action==1){if(playing&&(actions&(PlaybackState.ACTION_PAUSE|PlaybackState.ACTION_PLAY_PAUSE))!=0)c.pause();else if(!playing&&(actions&(PlaybackState.ACTION_PLAY|PlaybackState.ACTION_PLAY_PAUSE))!=0)c.play();}
    }
}

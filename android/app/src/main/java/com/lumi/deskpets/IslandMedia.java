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
    IslandMedia(Context c){context=c;}
    void refresh(){
        selected=null;title="";playing=false;
        try{
            List<MediaController> sessions=context.getSystemService(MediaSessionManager.class).getActiveSessions(new ComponentName(context,DeliveryCompanion.class));
            for(MediaController c:sessions){PlaybackState p=c.getPlaybackState();if(p==null)continue;
                if(selected==null||p.getState()==PlaybackState.STATE_PLAYING){selected=c;if(p.getState()==PlaybackState.STATE_PLAYING)break;}}
            if(selected!=null){PlaybackState p=selected.getPlaybackState();playing=p!=null&&p.getState()==PlaybackState.STATE_PLAYING;
                MediaMetadata m=selected.getMetadata();CharSequence t=m==null?null:m.getText(MediaMetadata.METADATA_KEY_TITLE);title=t==null?"媒体播放":t.toString();}
        }catch(SecurityException e){clear();}
    }
    void clear(){selected=null;title="";playing=false;}
    void control(int action){
        refresh();if(selected==null)return;
        PlaybackState p=selected.getPlaybackState();long actions=p==null?0:p.getActions();MediaController.TransportControls c=selected.getTransportControls();
        if(action==0 && (actions&PlaybackState.ACTION_SKIP_TO_PREVIOUS)!=0)c.skipToPrevious();
        if(action==2 && (actions&PlaybackState.ACTION_SKIP_TO_NEXT)!=0)c.skipToNext();
        if(action==1){if(playing&&(actions&(PlaybackState.ACTION_PAUSE|PlaybackState.ACTION_PLAY_PAUSE))!=0)c.pause();else if(!playing&&(actions&(PlaybackState.ACTION_PLAY|PlaybackState.ACTION_PLAY_PAUSE))!=0)c.play();}
    }
}

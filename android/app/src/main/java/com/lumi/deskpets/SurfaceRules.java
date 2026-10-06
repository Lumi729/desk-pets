package com.lumi.deskpets;

/** App-independent candidate rules. Only roles, resource IDs and geometry enter here. */
final class SurfaceRules {
    static final int NONE=0, CONTROL=1, CONTENT=2, CARD=3;
    static int kind(String cls,String id,boolean scrolling,boolean editable,boolean clickable,
                    float left,float width,float height,float windowWidth) {
        if(width<40 || height<18 || width>windowWidth || windowWidth<=0)return NONE;
        if(editable || cls.endsWith("Button"))return CONTROL;
        if(clickable && (cls.endsWith("TextView")||cls.endsWith("ImageView")||cls.equals("android.view.View")))return CONTROL;
        if(cls.endsWith("CardView") || scrolling && (cls.endsWith("ImageView")||id.contains("card"))) {
            if(width>=windowWidth*.28f && height>=40)return CARD;
        }
        boolean message=id.contains("chat_item_content")||id.contains("message_content")||id.contains("msg_content");
        if(scrolling && (message || cls.endsWith("TextView")&&!clickable)) {
            // Small centred list labels are usually dates/timestamps, not a bubble or card.
            if(!message && width<windowWidth*.4f && Math.abs(left+width/2-windowWidth/2)<windowWidth*.08f)return NONE;
            if(width<windowWidth*.92f)return CONTENT;
        }
        return NONE;
    }
}

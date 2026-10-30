package com.hop.captain;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle state) {
        registerPlugin(HopTrackingPlugin.class);
        registerPlugin(HopPushGuardPlugin.class);
        super.onCreate(state);
        try {
            Class<?> cls = Class.forName("com.google.firebase.FirebaseApp");
            cls.getMethod("initializeApp", android.content.Context.class).invoke(null, this);
        } catch (Throwable t) {
            android.util.Log.w("HopCaptain", "Firebase auto-init skipped or failed: " + t.getMessage());
        }
    }
}

package com.hop.captain;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle state) {
        registerPlugin(HopTrackingPlugin.class);
        super.onCreate(state);
        try {
            com.google.firebase.FirebaseApp.initializeApp(this);
        } catch (Throwable t) {
            android.util.Log.w("HopCaptain", "Firebase auto-init skipped or failed: " + t.getMessage());
        }
    }
}

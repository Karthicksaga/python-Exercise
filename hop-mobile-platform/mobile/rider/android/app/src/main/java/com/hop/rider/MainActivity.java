package com.hop.rider;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HopPushGuardPlugin.class);
        super.onCreate(savedInstanceState);
        try {
            Class<?> cls = Class.forName("com.google.firebase.FirebaseApp");
            cls.getMethod("initializeApp", android.content.Context.class).invoke(null, this);
        } catch (Throwable t) {
            android.util.Log.w("HopRider", "Firebase auto-init skipped or failed: " + t.getMessage());
        }
    }
}

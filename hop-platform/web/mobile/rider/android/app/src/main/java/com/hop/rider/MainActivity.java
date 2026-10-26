package com.hop.rider;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            com.google.firebase.FirebaseApp.initializeApp(this);
        } catch (Throwable t) {
            android.util.Log.w("HopRider", "Firebase auto-init skipped or failed: " + t.getMessage());
        }
    }
}

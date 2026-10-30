package com.hop.rider;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Check Firebase before entering the push plugin's unguarded native register call. */
@CapacitorPlugin(name = "HopPushGuard")
public class HopPushGuardPlugin extends Plugin {
    @PluginMethod
    public void prepare(PluginCall call) {
        try {
            Class<?> firebase = Class.forName("com.google.firebase.FirebaseApp");
            Object app = firebase.getMethod("initializeApp", android.content.Context.class).invoke(null, getContext());
            if (app == null) {
                call.reject("Device notifications are unavailable in this build. Firebase configuration must be included when rebuilding the app.");
                return;
            }
            firebase.getMethod("getInstance").invoke(null);
            call.resolve();
        } catch (ReflectiveOperationException | RuntimeException | LinkageError error) {
            android.util.Log.e("HopPush", "Firebase is unavailable; push registration was not attempted", error);
            call.reject("Could not initialize device notifications. Check this app's Firebase configuration and rebuild.");
        }
    }
}

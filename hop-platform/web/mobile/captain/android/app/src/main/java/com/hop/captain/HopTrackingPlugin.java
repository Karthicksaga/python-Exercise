package com.hop.captain;
import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import androidx.core.content.ContextCompat;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
@CapacitorPlugin(name="HopTracking")
public class HopTrackingPlugin extends Plugin {
    @PluginMethod public void start(PluginCall call) {
        String origin = getConfig().getString("apiOrigin");
        if (origin == null || !origin.equals(call.getString("url")) || !"captain".equals(call.getString("app")) || call.getString("csrf", "").isEmpty()) {
            call.reject("Invalid captain tracking configuration"); return;
        }
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            call.reject("Precise location permission is required to receive rides"); return;
        }
        try {
            Intent intent = new Intent(getContext(), CaptainLocationService.class);
            intent.putExtra("url", origin); intent.putExtra("csrf", call.getString("csrf"));
            ContextCompat.startForegroundService(getContext(), intent);
            call.resolve();
        } catch (Exception e) { call.reject("Could not start driver tracking. Open the app and go online again."); }
    }
    @PluginMethod public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), CaptainLocationService.class)); call.resolve();
    }
}

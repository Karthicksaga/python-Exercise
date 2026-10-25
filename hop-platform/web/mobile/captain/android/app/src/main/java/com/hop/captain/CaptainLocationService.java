package com.hop.captain;

import android.app.*;
import android.content.*;
import android.location.*;
import android.os.*;
import android.webkit.CookieManager;
import androidx.core.app.NotificationCompat;
import org.json.JSONObject;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

/** Tracking is user-started, visibly ongoing, non-sticky, and stops when the captain signs out. */
public class CaptainLocationService extends Service implements LocationListener {
    private final ScheduledExecutorService worker = Executors.newSingleThreadScheduledExecutor();
    private ScheduledFuture<?> availabilityCheck;
    private final AtomicBoolean sending = new AtomicBoolean();
    private LocationManager locations;
    private volatile String origin, csrf;
    private volatile boolean stopped;
    @Override public IBinder onBind(Intent intent) { return null; }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) { stopSelf(); return START_NOT_STICKY; }
        origin = intent.getStringExtra("url"); csrf = intent.getStringExtra("csrf");
        if (origin == null || csrf == null) { stopSelf(); return START_NOT_STICKY; }
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(new NotificationChannel("hop-tracking", "Captain online location", NotificationManager.IMPORTANCE_LOW));
        }
        Intent launch = new Intent(this, MainActivity.class);
        PendingIntent open = PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification notification = new NotificationCompat.Builder(this, "hop-tracking")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation).setContentTitle("Hop Captain · Online")
            .setContentText("Location is shared for ride matching. Open Hop to go offline.")
            .setContentIntent(open).setOngoing(true).setCategory(NotificationCompat.CATEGORY_SERVICE).build();
        try {
            startForeground(4101, notification);
            if (availabilityCheck == null) availabilityCheck = worker.scheduleWithFixedDelay(this::checkAvailability, 0, 10, TimeUnit.SECONDS);
            locations = (LocationManager)getSystemService(LOCATION_SERVICE);
            if (locations.isProviderEnabled(LocationManager.GPS_PROVIDER)) locations.requestLocationUpdates(LocationManager.GPS_PROVIDER, 5000, 5, this);
            if (locations.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) locations.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 5000, 5, this);
            if (!locations.isProviderEnabled(LocationManager.GPS_PROVIDER) && !locations.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) stopSelf();
        } catch (SecurityException | IllegalStateException e) { stopSelf(); }
        return START_NOT_STICKY;
    }
    // Check even while stationary, when LocationManager may emit no fixes.
    private void checkAvailability() {
        HttpURLConnection connection = null;
        try {
            if (stopped) return;
            connection = (HttpURLConnection)new URL(origin+"/api/drivers/availability").openConnection();
            connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(8000);connection.setReadTimeout(8000);
            connection.setRequestProperty("Origin",origin);connection.setRequestProperty("X-Hop-App","captain");
            String cookies = CookieManager.getInstance().getCookie(origin);
            if (cookies != null) connection.setRequestProperty("Cookie",cookies);
            int status = connection.getResponseCode();
            if (status == 401 || status == 403) { stopSelf(); return; }
            if (status == 200) {
                try (java.io.InputStream input = connection.getInputStream(); java.io.ByteArrayOutputStream data = new java.io.ByteArrayOutputStream()) {
                    byte[] bytes = new byte[256]; int count;
                    while ((count = input.read(bytes)) != -1 && data.size() < 2048) data.write(bytes, 0, count);
                    if (!new JSONObject(data.toString("UTF-8")).getBoolean("online")) stopSelf();
                }
            }
        } catch (Exception ignored) {
            // Retry after reconnecting; outages never extend server location freshness.
        } finally { if (connection != null) connection.disconnect(); }
    }
    @Override public void onLocationChanged(Location fix) {
        if (stopped || !fix.hasAccuracy() || fix.getAccuracy() > 150 || SystemClock.elapsedRealtimeNanos()-fix.getElapsedRealtimeNanos() > 20000000000L || !sending.compareAndSet(false,true)) return;
        try {
            JSONObject body = new JSONObject();
            body.put("lat",fix.getLatitude());body.put("lng",fix.getLongitude());body.put("accuracy",Math.max(1,fix.getAccuracy()));
            worker.execute(() -> {
                HttpURLConnection connection = null;
                try {
                    if (stopped) return;
                    URL url = new URL(origin+"/api/drivers/location");
                    connection = (HttpURLConnection)url.openConnection();
                    connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(8000);connection.setReadTimeout(8000);
                    connection.setRequestMethod("POST");connection.setDoOutput(true);
                    connection.setRequestProperty("Content-Type","application/json");connection.setRequestProperty("Origin",origin);
                    connection.setRequestProperty("X-Hop-App","captain");connection.setRequestProperty("X-CSRF-Token",csrf);
                    String cookies = CookieManager.getInstance().getCookie(origin);
                    if (cookies != null) connection.setRequestProperty("Cookie",cookies);
                    byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                    connection.setFixedLengthStreamingMode(bytes.length);
                    try (java.io.OutputStream output = connection.getOutputStream()) { output.write(bytes); }
                    int status = connection.getResponseCode();
                    if (status == 401 || status == 403) stopSelf();
                } catch (Exception ignored) {
                    // A network outage never extends the server's location freshness window.
                } finally { if (connection != null) connection.disconnect(); sending.set(false); }
            });
        } catch (Exception ignored) { sending.set(false); }
    }
    @Override public void onProviderDisabled(String provider) { }
    @Override public void onProviderEnabled(String provider) { }
    @Override public void onStatusChanged(String provider,int status,Bundle extras) { }
    @Override public void onDestroy() {
        stopped = true;
        if (locations != null) locations.removeUpdates(this);
        worker.shutdownNow();
        stopForeground(STOP_FOREGROUND_REMOVE);super.onDestroy();
    }
}

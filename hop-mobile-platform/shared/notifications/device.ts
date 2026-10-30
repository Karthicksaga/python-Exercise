import { Capacitor, registerPlugin } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { api } from "../services/client";
const pushGuard = registerPlugin<{ prepare(): Promise<void> }>("HopPushGuard");
let nativeToken = "";
export async function enableNotifications(): Promise<void> {
  await api.session();
  if (Capacitor.isNativePlatform()) {
    await pushGuard.prepare();
    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== "granted")
      throw new Error(
        "Allow notifications in device settings to receive trip alerts.",
      );
    await PushNotifications.createChannel({
      id: "hop-rides",
      name: "Hop rides",
      importance: 4,
      sound: "hop_rides.wav",
      vibration: true,
    });
    await new Promise<void>((resolve, reject) => {
      const handles: { remove: () => Promise<void> }[] = [];
      const finish = (error?: unknown) => {
        clearTimeout(timer);
        handles.forEach((h) => void h.remove());
        error ? reject(error) : resolve();
      };
      const timer = setTimeout(
        () =>
          finish(
            new Error(
              "Push registration timed out. Check the device’s Firebase configuration.",
            ),
          ),
        15000,
      );
      void (async () => {
        handles.push(
          await PushNotifications.addListener("registration", (token) => {
            nativeToken = token.value;
            void api
              .request("/api/android/push/subscribe", { token: token.value })
              .then(() => finish(), finish);
          }),
        );
        handles.push(
          await PushNotifications.addListener("registrationError", () =>
            finish(new Error("Native push registration failed.")),
          ),
        );
        await PushNotifications.register();
      })().catch(finish);
    });
    return;
  }
  if (
    !("Notification" in window) ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  )
    throw new Error(
      "Device push is unavailable here. In-app notifications still work.",
    );
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error(
      "Notification permission was not granted. In-app updates remain available.",
    );
  const { key } = await api.request<{ key: string }>("/api/push/key");
  if (!key) throw new Error("Push delivery is not configured on this backend.");
  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const bytes = Uint8Array.from(
    atob(
      key
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(key.length / 4) * 4, "="),
    ),
    (c) => c.charCodeAt(0),
  );
  const subscription =
    (await registration.pushManager.getSubscription()) ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: bytes,
    }));
  try {
    await api.request("/api/push/subscribe", subscription.toJSON());
  } catch (error) {
    await subscription.unsubscribe();
    throw error;
  }
}
export async function disableNotifications() {
  if (Capacitor.isNativePlatform()) {
    await pushGuard.prepare();
    if (nativeToken)
      await api.request("/api/android/push/unsubscribe", {
        token: nativeToken,
      });
    nativeToken = "";
    await PushNotifications.unregister();
    return;
  }
  const subscription = await (
    await navigator.serviceWorker?.getRegistration("/sw.js")
  )?.pushManager.getSubscription();
  if (subscription) {
    await api.request("/api/push/unsubscribe", {
      endpoint: subscription.endpoint,
    });
    await subscription.unsubscribe();
  }
}

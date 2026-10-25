import { isAndroid } from "./platform";
import { PushNotifications } from "@capacitor/push-notifications";
import { useEffect, useRef, useState } from "react";
import { api } from "./api";

let nativeToken = "";
type Push = { kind: string; title: string; body: string };

function chime() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    // Audio is optional.
  }
}

function keyBytes(base64Url: string) {
  const padded = base64Url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64Url.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

// Registers this device for background Web Push (works when the tab is closed). Silently does nothing
// when the browser or the server does not support it.
async function registerWebPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  try {
    const { key } = await api<{ key: string }>("/api/push/key");
    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
    await api("/api/push/subscribe", subscription.toJSON());
  } catch {
    // Push is an enhancement; the live stream still works.
  }
}

// Detaches this device from the signed-in account so a shared browser stops receiving their alerts. Must run before sign-out.
export async function unregisterWebPush() {
  if (isAndroid) {
    if (nativeToken) await api('/api/android/push/unsubscribe', { token: nativeToken }).catch(() => undefined);
    nativeToken = '';
    await PushNotifications.unregister().catch(() => undefined);
    return;
  }
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration("/sw.js");
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    await api("/api/push/unsubscribe", { endpoint: subscription.endpoint });
    await subscription.unsubscribe();
  } catch {
    // Never block sign-out.
  }
}

// Subscribes to the server push stream. Each message refreshes app state, shows an in-app notice
// and, when permitted, a system notification so riders and drivers are alerted even in another tab.
export function usePush(enabled: boolean, onPush: (message: Push) => void) {
  const handler = useRef(onPush);
  handler.current = onPush;
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    isAndroid ? "default" : typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (!isAndroid || !enabled) return;
    let cancelled = false;
    const handles: { remove: () => Promise<void> }[] = [];
    void (async () => {
      const received = await PushNotifications.addListener('pushNotificationReceived', n => {
        handler.current({ kind: 'ride', title: n.title || 'Hop', body: n.body || '' });
      });
      handles.push(received);
      const registration = await PushNotifications.addListener('registration', async token => {
        nativeToken = token.value;
        try { await api('/api/android/push/subscribe', { token: token.value }); }
        catch (e) { window.dispatchEvent(new CustomEvent('hop-native-error', { detail: (e as Error).message })); }
      });
      handles.push(registration);
      const errors = await PushNotifications.addListener('registrationError', () => {
        window.dispatchEvent(new CustomEvent('hop-native-error', { detail: 'Android push needs this app’s Firebase configuration. In-app updates remain available.' }));
      });
      handles.push(errors);
      const status = await PushNotifications.checkPermissions();
      if (!cancelled) {
        setPermission(status.receive === 'granted' ? 'granted' : status.receive === 'denied' ? 'denied' : 'default');
        if (status.receive === 'granted') {
          await PushNotifications.createChannel({ id: 'hop-rides', name: 'Hop rides', importance: 4 });
          await PushNotifications.register();
        }
      }
      if (cancelled) await Promise.all(handles.map(h => h.remove()));
    })().catch(() => undefined);
    return () => { cancelled = true; void Promise.all(handles.map(h => h.remove())); };
  }, [enabled]);
  useEffect(() => {
    if (!isAndroid && enabled && permission === "granted") void registerWebPush();
  }, [enabled, permission]);
  useEffect(() => {
    if (isAndroid || !enabled || typeof EventSource === "undefined") return;
    const source = new EventSource("/api/stream");
    source.onopen = () => setLive(true);
    source.onerror = () => setLive(false);
    source.addEventListener("push", (event) => {
      const message = JSON.parse((event as MessageEvent<string>).data) as Push;
      handler.current(message);
      chime();
      if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.visibilityState !== "visible") {
        new Notification(message.title, { body: message.body, tag: message.kind });
      }
    });
    return () => {
      source.close();
      setLive(false);
    };
  }, [enabled]);
  async function requestPermission() {
    if (isAndroid) {
      const status = await PushNotifications.requestPermissions();
      setPermission(status.receive === 'granted' ? 'granted' : 'denied');
      if (status.receive === 'granted') {
        await PushNotifications.createChannel({ id: 'hop-rides', name: 'Hop rides', importance: 4 });
        await PushNotifications.register().catch(() => undefined);
      }
      return;
    }
    if (typeof Notification === "undefined") return;
    setPermission(await Notification.requestPermission());
  }
  return { permission, requestPermission, live: isAndroid ? enabled : live };
}

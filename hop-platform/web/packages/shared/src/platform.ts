import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Geolocation } from '@capacitor/geolocation';

export const isAndroid = Capacitor.getPlatform() === 'android';
export const mobileApp = import.meta.env.VITE_MOBILE_APP as 'rider' | 'captain' | undefined;
export function mobileOrigin() {
  const url = new URL(import.meta.env.VITE_MOBILE_API_URL || location.origin);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid Android API origin');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '10.0.2.2'].includes(url.hostname))) throw new Error('Android API requires HTTPS');
  return url.origin;
}
export const serverURL = (path: string) => isAndroid ? new URL(path, mobileOrigin()).href : path;
export async function serverFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!isAndroid) return fetch(path, init);
  if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const result = await CapacitorHttp.request({
    url: serverURL(path), method: init.method || 'GET',
    headers: { ...Object.fromEntries(new Headers(init.headers)), 'X-Hop-App': mobileApp || '', Origin: mobileOrigin() },
    ...(init.body ? { data: JSON.parse(String(init.body)) } : {}),
    responseType: 'json', connectTimeout: 10000, readTimeout: 15000,
  });
  if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  return new Response(JSON.stringify(result.data), { status: result.status, headers: { 'Content-Type': 'application/json' } });
}
interface TrackingPlugin {
  start(options: { url: string; csrf: string; app: string }): Promise<void>;
  stop(): Promise<void>;
}
const Tracking = registerPlugin<TrackingPlugin>('HopTracking');
export async function startTracking(csrf: string) {
  if (!isAndroid || mobileApp !== 'captain') return;
  await Geolocation.requestPermissions();
  await Tracking.start({ url: mobileOrigin(), csrf, app: 'captain' });
}
export async function stopTracking() {
  if (isAndroid && mobileApp === 'captain') await Tracking.stop();
}

// Native geolocation adapter preserves the browser-facing interface used by both UIs.
export async function initAndroid() {
  if (!isAndroid) return;
  let serial = 0;
  const watches = new Map<number, Promise<string>>();
  const error = (e: unknown) => ({ code: 1, message: (e as Error).message, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }) as GeolocationPositionError;
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
    getCurrentPosition(ok: PositionCallback, bad?: PositionErrorCallback, options?: PositionOptions) {
      void Geolocation.getCurrentPosition(options).then(p => ok(p as unknown as GeolocationPosition)).catch(e => bad?.(error(e)));
    },
    watchPosition(ok: PositionCallback, bad?: PositionErrorCallback, options?: PositionOptions) {
      const id = ++serial;
      const watch = Geolocation.watchPosition(options || {}, (p, e) => {
        if (!watches.has(id)) return;
        if (p) ok(p as unknown as GeolocationPosition); else if (e) bad?.(error(e));
      });
      watches.set(id, watch); void watch.catch(e => bad?.(error(e))); return id;
    },
    clearWatch(id: number) {
      const watch = watches.get(id); watches.delete(id);
      void watch?.then(id => Geolocation.clearWatch({ id })).catch(() => undefined);
    },
  } });
  document.documentElement.classList.add('native-android');
  // Authenticate in a system browser. Only a one-time, PKCE-bound grant returns via the app link.
  document.addEventListener('click', event => {
    const link = (event.target as Element)?.closest<HTMLAnchorElement>('a[href="/auth/login"]');
    if (!link) return;
    event.preventDefault(); event.stopImmediatePropagation();
    void beginAndroidLogin().catch(e => { window.dispatchEvent(new CustomEvent('hop-native-error', { detail: (e as Error).message })); });
  }, true);
  const complete = async (url: string) => {
    const callback = new URL(url);
    if (callback.protocol !== `com.hop.${mobileApp}:` || callback.host !== 'auth' || callback.pathname !== '/callback') return;
    const verifier = sessionStorage.getItem('hop.mobile.verifier');
    sessionStorage.removeItem('hop.mobile.verifier');
    if (!verifier) return;
    try {
      const res = await serverFetch('/auth/mobile/exchange', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: callback.searchParams.get('code'), verifier }) });
      if (!res.ok) throw new Error((await res.json()).error || 'Sign-in failed');
      await Browser.close().catch(() => undefined); location.reload();
    } catch (e) { window.dispatchEvent(new CustomEvent('hop-native-error', { detail: (e as Error).message })); }
  };
  await App.addListener('appUrlOpen', ({ url }) => { void complete(url); });
  const launch = await App.getLaunchUrl(); if (launch) await complete(launch.url);
  await App.addListener('backButton', ({ canGoBack }) => { if (canGoBack) history.back(); else void App.minimizeApp(); });
}
async function beginAndroidLogin() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const encode = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const verifier = encode(bytes);
  const challenge = encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  sessionStorage.setItem('hop.mobile.verifier', verifier);
  await Browser.open({ url: serverURL(`/auth/login?mobile_app=${mobileApp}&mobile_challenge=${challenge}`) });
}

export async function nativeExport(data: unknown) {
  const file = await Filesystem.writeFile({ path: 'hop-my-data.json', data: JSON.stringify(data, null, 2), directory: Directory.Cache, encoding: Encoding.UTF8 });
  await Share.share({ title: 'Hop account data', url: file.uri, dialogTitle: 'Save or share your account data' });
}
export async function shareTrip(url: string) {
  if (isAndroid) { await Share.share({ title: 'Follow my Hop trip', url }); return; }
  if (navigator.share) await navigator.share({ title: 'Follow my Hop trip', url });
  else await navigator.clipboard?.writeText(url);
}

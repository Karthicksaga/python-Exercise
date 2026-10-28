import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
export async function transport(path: string, init: RequestInit): Promise<Response> {
  if (!Capacitor.isNativePlatform()) return fetch(path, { ...init, credentials: 'same-origin' });
  const origin = import.meta.env.VITE_MOBILE_API_URL;
  if (!origin) throw new Error('Set VITE_MOBILE_API_URL to this app’s backend origin before building for a device.');
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('Native backend must be an explicit HTTPS origin.');
  const result = await CapacitorHttp.request({ url: new URL(path, url).href, method: init.method || 'GET',
    headers: { ...Object.fromEntries(new Headers(init.headers)), 'X-Hop-App': import.meta.env.VITE_HOP_ROLE, Origin: url.origin },
    ...(init.body ? { data: JSON.parse(String(init.body)) } : {}), responseType: 'json', connectTimeout: 10000, readTimeout: 15000 });
  return new Response(JSON.stringify(result.data), { status: result.status });
}
export async function currentLocation() {
  if (Capacitor.isNativePlatform()) {
    const permission = await Geolocation.requestPermissions();
    if (permission.location === 'denied') throw new Error('Allow location access in device settings to use your location.');
    return (await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 12000 })).coords;
  }
  return new Promise<GeolocationCoordinates>((resolve, reject) => navigator.geolocation.getCurrentPosition(p => resolve(p.coords), reject, { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 }));
}

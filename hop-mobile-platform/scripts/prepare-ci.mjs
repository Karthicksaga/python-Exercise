import { writeFileSync } from 'node:fs';
import path from 'node:path';

const { APP, BUILD_TYPE, VITE_MOBILE_API_URL, RUNNER_TEMP } = process.env;
if (!['rider', 'captain'].includes(APP) || !['debug', 'release'].includes(BUILD_TYPE)) throw new Error('Invalid app/build type');
let api;
try { api = new URL(VITE_MOBILE_API_URL); } catch { throw new Error('Set HOP_RIDER_API_URL / HOP_CAPTAIN_API_URL (or HOP_API_URL for a shared API) to the phone-accessible HTTPS origin'); }
if (api.protocol !== 'https:' || api.pathname !== '/' || api.search || api.hash || api.username || api.password || ['localhost', '127.0.0.1', '[::1]', '10.0.2.2'].includes(api.hostname)) throw new Error('The mobile API URL must be a device-accessible HTTPS origin, without path or credentials');
if (!process.env.VITE_GOOGLE_MAPS_API_KEY) console.warn('Google Maps key absent: this build will use the OpenStreetMap fallback.');
const firebase = process.env[`${APP.toUpperCase()}_GOOGLE_SERVICES`];
if (firebase) {
  const data = Buffer.from(firebase, 'base64');
  const config = JSON.parse(data.toString('utf8'));
  if (!config.client?.some(client => client.client_info?.android_client_info?.package_name === `com.hop.${APP}`)) throw new Error('Firebase configuration does not match this application ID');
  writeFileSync(`mobile/${APP}/android/app/google-services.json`, data, { mode: 0o600 });
} else console.warn('Firebase configuration absent: native push delivery is unavailable in this build.');
if (BUILD_TYPE === 'release') {
  for (const name of ['KEYSTORE_BASE64', 'HOP_ANDROID_STORE_PASSWORD', 'HOP_ANDROID_KEY_ALIAS', 'HOP_ANDROID_KEY_PASSWORD']) {
    if (!process.env[name]) throw new Error(`Missing release signing secret: ${name}`);
  }
  writeFileSync(path.join(RUNNER_TEMP, 'hop-signing.jks'), Buffer.from(process.env.KEYSTORE_BASE64, 'base64'), { mode: 0o600 });
}

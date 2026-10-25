import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadEnv } from 'vite';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = process.argv[2];
const release = process.argv.includes('--release') || process.env.HOP_ANDROID_RELEASE === '1';
if (release) process.env.HOP_ANDROID_RELEASE = '1';
if (!['rider', 'captain'].includes(app)) throw new Error('Choose rider or captain');
const mobile = path.join(root, 'mobile', app);
const env = loadEnv('android', path.join(root, 'apps', app), 'VITE_');
const mapProvider = process.env.VITE_MAP_PROVIDER || (process.env.VITE_GOOGLE_MAPS_API_KEY || env.VITE_GOOGLE_MAPS_API_KEY ? env.VITE_MAP_PROVIDER || 'google' : 'osm');
process.env.VITE_MAP_PROVIDER = mapProvider;
if (mapProvider === 'google' && !(process.env.VITE_GOOGLE_MAPS_API_KEY || env.VITE_GOOGLE_MAPS_API_KEY)) throw new Error('Google Maps needs VITE_GOOGLE_MAPS_API_KEY in this app\'s private .env.android.local');
const endpoint = new URL(process.env.VITE_MOBILE_API_URL || env.VITE_MOBILE_API_URL);
const local = ['localhost', '127.0.0.1', '10.0.2.2'].includes(endpoint.hostname);
if (endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash || (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && local && process.env.HOP_ANDROID_RELEASE !== '1'))) throw new Error('Use an HTTPS app origin, or loopback for debug only');
function run(cmd, args, cwd = root) {
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run('npm', ['run', 'build', '-w', `@hop/${app}`, '--', '--mode', 'android']);
const cap = path.join(root, 'node_modules', '.bin', 'cap');
if (!existsSync(path.join(mobile, 'android'))) run(cap, ['add', 'android'], mobile);
run(cap, ['sync', 'android'], mobile);
if (release) run('./gradlew', ['bundleRelease'], path.join(mobile, 'android'));
else if (process.argv.includes('--apk')) run('./gradlew', ['assembleDebug'], path.join(mobile, 'android'));

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadEnv } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = process.argv[2];
const release = process.argv.includes('--release') || process.env.HOP_ANDROID_RELEASE === '1';
if (release) process.env.HOP_ANDROID_RELEASE = '1';

if (!['rider', 'captain'].includes(app)) {
  console.error('Usage: node scripts/android.mjs <rider|captain> [--release] [--apk]');
  process.exit(1);
}

const mobile = path.join(root, 'mobile', app);
const env = loadEnv('android', path.join(root, 'apps', app), 'VITE_');
const apiUrl = process.env.VITE_MOBILE_API_URL || env.VITE_MOBILE_API_URL || 'http://10.0.2.2:8080';
process.env.VITE_MOBILE_API_URL = apiUrl;

function run(cmd, args, cwd = root) {
  console.log(`> [${cwd}] ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// 1. Build the web dist for the app
run('npm', ['run', `build:${app}`]);

// 2. Sync with Capacitor Android wrapper
const cap = path.join(root, 'node_modules', '.bin', 'cap');
if (!existsSync(path.join(mobile, 'android'))) {
  run(cap, ['add', 'android'], mobile);
}
run(cap, ['sync', 'android'], mobile);

// 3. Optional Gradle compilation
if (release) {
  run('./gradlew', process.argv.includes('--apk') ? ['assembleRelease', 'bundleRelease'] : ['bundleRelease'], path.join(mobile, 'android'));
} else if (process.argv.includes('--apk')) {
  run('./gradlew', ['assembleDebug'], path.join(mobile, 'android'));
}

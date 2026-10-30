import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const scripts = path.dirname(fileURLToPath(import.meta.url));
const firebase = Buffer.from(JSON.stringify({project_info:{project_id:'fixture',project_number:'123'},client:[{client_info:{mobilesdk_app_id:'1:123:android:fixture',android_client_info:{package_name:'com.hop.rider'}},api_key:[{current_key:'fixture-key'}]}]})).toString('base64');
function fixture(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'hop-ci-'));
  try { fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
function run(script, dir, env) {
  return spawnSync(process.execPath, [path.join(scripts, script)], {
    cwd: dir, env: { PATH: process.env.PATH, APP: 'rider', BUILD_TYPE: 'debug', RUNNER_TEMP: dir, RIDER_GOOGLE_SERVICES: firebase, ...env }, encoding: 'utf8',
  });
}
test('phone builds reject missing, emulator, insecure and path-based backend URLs', () => fixture(dir => {
  for (const url of ['', 'http://example.com', 'https://localhost', 'https://10.0.2.2', 'https://api.example.com/api', 'https://user:pass@example.com']) {
    assert.notEqual(run('prepare-ci.mjs', dir, { VITE_MOBILE_API_URL: url }).status, 0, url);
  }
  assert.equal(run('prepare-ci.mjs', dir, { VITE_MOBILE_API_URL: 'https://api.example.com' }).status, 0);
}));
test('release builds fail instead of silently producing unsigned artifacts', () => fixture(dir => {
  const result = run('prepare-ci.mjs', dir, { VITE_MOBILE_API_URL: 'https://api.example.com', BUILD_TYPE: 'release' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing release signing secret/);
}));
test('Firebase configuration must match the selected Android application', () => fixture(dir => {
  const result = run('prepare-ci.mjs', dir, { VITE_MOBILE_API_URL: 'https://api.example.com', RIDER_GOOGLE_SERVICES: Buffer.from(JSON.stringify({ client: [{ client_info: { android_client_info: { package_name: 'com.hop.captain' } } }] })).toString('base64') });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not match/);
}));
test('release staging requires both APK and AAB and hashes their exact bytes', () => fixture(dir => {
  const outputs = path.join(dir, 'mobile/rider/android/app/build/outputs');
  for (const file of ['apk/release/app-release.apk', 'bundle/release/app-release.aab']) {
    mkdirSync(path.dirname(path.join(outputs, file)), { recursive: true });
    writeFileSync(path.join(outputs, file), `fixture:${file}`);
  }
  const env = { BUILD_TYPE: 'release', HOP_BUILD_ID: '7-1-abc', GITHUB_SHA: 'abc' };
  assert.equal(run('stage-android.mjs', dir, env).status, 0);
  const sums = readFileSync(path.join(dir, 'hop-artifacts/SHA256SUMS'), 'utf8');
  for (const extension of ['apk', 'aab']) {
    const name = `hop-rider-release-7-1-abc.${extension}`;
    const bytes = readFileSync(path.join(dir, 'hop-artifacts', name));
    assert.ok(sums.includes(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`));
  }
  rmSync(path.join(outputs, 'bundle/release/app-release.aab'));
  assert.notEqual(run('stage-android.mjs', dir, env).status, 0);
}));
test('local phone APK builds stop before compilation for an emulator backend', () => fixture(dir => {
  for (const app of ['rider', 'captain']) {
    const result = spawnSync(process.execPath, [path.join(scripts, 'android.mjs'), app, '--apk'], {
      cwd: dir, env: { PATH: process.env.PATH, VITE_MOBILE_API_URL: 'http://10.0.2.2:8080' }, encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /phone-accessible HTTPS backend origin/);
    assert.doesNotMatch(result.stdout, /build:rider|build:captain/);
  }
}));

test('Android CI fails before building when Firebase secret is absent', () => fixture(dir => {
  for (const app of ['rider', 'captain']) {
    const result = run('prepare-ci.mjs', dir, {APP:app, VITE_MOBILE_API_URL:'https://api.example.com', RIDER_GOOGLE_SERVICES:'', CAPTAIN_GOOGLE_SERVICES:''});
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /refusing to publish an Android app without Firebase/);
  }
}));
test('Android CI writes the validated Firebase configuration', () => fixture(dir => {
  const result=run('prepare-ci.mjs',dir,{VITE_MOBILE_API_URL:'https://api.example.com'});
  assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(readFileSync(path.join(dir,'mobile/rider/android/app/google-services.json'),'utf8')).project_info.project_id,'fixture');
}));

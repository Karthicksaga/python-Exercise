// Adds an "onMapLoaded" event to @capacitor/google-maps on Android.
// The Maps SDK never reports a rejected API key to the app: the map still becomes "ready" but
// stays blank. It does report when the visible tiles have finished loading, and that never
// happens with a rejected key, so shared/maps/native.ts waits for this event and switches to
// OpenStreetMap if it doesn't arrive. Safe to run more than once.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'node_modules/@capacitor/google-maps/android/src/main/java/com/capacitorjs/plugins/googlemaps/CapacitorGoogleMap.kt');
const marker = '// hop: onMapLoaded';
const anchor = 'delegate.notify("onMapReady", data)';
const addition = `${anchor}
            ${marker}
            map.setOnMapLoadedCallback {
                val loaded = JSObject()
                loaded.put("mapId", this@CapacitorGoogleMap.id)
                delegate.notify("onMapLoaded", loaded)
            }`;

if (!existsSync(file)) {
  console.log('patch-google-maps: plugin not installed, skipped');
  process.exit(0);
}
const source = readFileSync(file, 'utf8');
if (source.includes(marker)) process.exit(0);
if (!source.includes(anchor)) {
  console.error('patch-google-maps: onMapReady not found; the plugin changed, so update this patch');
  process.exit(1);
}
writeFileSync(file, source.replace(anchor, addition));
console.log('patch-google-maps: added onMapLoaded event');

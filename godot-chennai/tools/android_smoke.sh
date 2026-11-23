#!/usr/bin/env bash
# Android smoke test (CI job `android-smoke`): installs an APK on a running emulator, launches
# it and checks, from the device log, that the game reached the test world ("[boot] play",
# printed by src/app/main.gd) and is still running 10 s later. Fails on "[boot] failed", a
# crash or a timeout. The smoke preset passes `--start=play`; if the game shows the title menu
# instead, ENTER presses the focused PLAY button, as a player with a keyboard would.
#
#   tools/android_smoke.sh <app.apk> [out-dir]
#
# Needs adb on the PATH. Writes the device log to <out-dir>/logcat.txt (default android-smoke/).
set -uo pipefail
APK="${1:?usage: android_smoke.sh <app.apk> [out-dir]}"
OUT="${2:-android-smoke}"
PACKAGE=com.chennaiopenworld.godot
TIMEOUT=240
mkdir -p "$OUT"
log() { echo "[smoke $(date +%H:%M:%S)] $*"; }
save() { adb logcat -d > "$OUT/logcat.txt" 2>/dev/null; log "device log in $OUT/logcat.txt"; }
fail() {
  log "FAIL: $*"
  echo "---- the app's log (tag godot, last 150 lines) ----"
  boot_log | tail -150
  echo "---- crash buffer ----"
  adb logcat -d -b crash 2>/dev/null | tail -60
  save
  exit 1
}
boot_log() { adb logcat -d -s godot:V 2>/dev/null; }
# Crashes of this app only (the crash buffer; native crashes name the process, truncated).
crashed() { adb logcat -d -b crash 2>/dev/null | grep -qE "chennaiopenworld|openworld\.godot"; }

log "installing $APK"
adb install -r "$APK" || fail "adb install failed"
adb logcat -c -b all
adb shell am force-stop "$PACKAGE"
log "launching $PACKAGE"
adb shell monkey -p "$PACKAGE" -c android.intent.category.LAUNCHER 1 > /dev/null || fail "could not launch"
start=$(date +%s)
pressed=0
while true; do
  sleep 3
  now=$(date +%s)
  lines=$(boot_log | grep -F "[boot]" || true)
  [ -n "$lines" ] && log "last: $(echo "$lines" | tail -1 | sed 's/.*\[boot\]/[boot]/')"
  if echo "$lines" | grep -qF "[boot] failed"; then fail "the game reported a loading failure"; fi
  if crashed; then fail "the app crashed"; fi
  if echo "$lines" | grep -qF "[boot] play"; then break; fi
  if echo "$lines" | grep -qF "[boot] title" && [ $((now - pressed)) -gt 10 ]; then
    log "title menu shown: pressing ENTER on PLAY"
    adb shell input keyevent KEYCODE_ENTER
    pressed=$now
  fi
  [ $((now - start)) -gt $TIMEOUT ] && fail "no \"[boot] play\" after ${TIMEOUT} s"
done
log "reached the test world after $(( $(date +%s) - start )) s; checking it keeps running"
sleep 10
pid=$(adb shell pidof "$PACKAGE" | tr -d '\r')
[ -z "$pid" ] && fail "the app is not running 10 s after reaching the test world"
if crashed; then fail "the app crashed after reaching the test world"; fi
boot_log | grep -F "[boot]" | sed 's/.*\[boot\]/  [boot]/'
save
log "pass (pid $pid)"

#!/usr/bin/env bash
# Android smoke test (CI job `android-smoke`): installs an APK on a running emulator, launches
# it and checks, from the device log, that the game reached the test world ("[boot] play",
# printed by src/app/main.gd) and that the same process is still running 10 s later. Fails on
# "[boot] failed", a crash, the app's process going away, or a timeout. The smoke preset passes
# `--start=play`; if the game shows the title menu instead, ENTER presses the focused PLAY
# button, as a player with a keyboard would.
#
#   tools/android_smoke.sh <app.apk> [out-dir]
#
# Before installing it waits until the emulator has settled (SMOKE_SETTLE=0 skips this, to
# reproduce the old behaviour): boot finished, package manager and activity manager answering,
# the screen unlocked, the display rotation fixed to landscape, and the global configuration
# unchanged for a while. Every wait is bounded and says what it waited for.
#
# Needs adb on the PATH. Writes the device log to <out-dir>/logcat.txt (default android-smoke/).
set -uo pipefail
APK="${1:?usage: android_smoke.sh <app.apk> [out-dir]}"
OUT="${2:-android-smoke}"
PACKAGE=com.chennaiopenworld.godot
TIMEOUT=240
SETTLE="${SMOKE_SETTLE:-1}"
mkdir -p "$OUT"
log() { echo "[smoke $(date +%H:%M:%S)] $*"; }
dev() { adb shell "$@" 2>/dev/null | tr -d '\r'; }
boot_log() { adb logcat -d -s godot:V 2>/dev/null; }
# Crashes of this app only (the crash buffer; native crashes name the process, truncated).
crashed() { adb logcat -d -b crash 2>/dev/null | grep -qE "chennaiopenworld|openworld\.godot"; }
# The whole global configuration line, including its sequence numbers (" as.N s.N"), which
# change with every configuration change (rotation, overlays, SIM country, fonts...).
config() { dev dumpsys window | grep -m1 -E "mGlobalConfiguration" | sed 's/^ *//'; }

diagnose() {
  echo "---- the app's log (tag godot) ----"
  boot_log | tail -120
  echo "---- why the app's process ended (ApplicationExitInfo) ----"
  dev dumpsys activity exit-info "$PACKAGE" | head -40
  echo "---- configuration changes and activity relaunches (events log) ----"
  adb logcat -d -b events 2>/dev/null | grep -E "configuration_changed|handleRelaunchActivity|wm_relaunch" | head -40
  echo "---- system events (activity and window lifecycle, configuration, kills), last 120 ----"
  adb logcat -d -b events 2>/dev/null | grep -E "am_|wm_|configuration_changed" \
    | grep -vE "am_pss|am_mem_factor|am_freeze|am_unfreeze|am_compact" | tail -120
  echo "---- system and main log, last 200 lines (without package-filter noise) ----"
  adb logcat -d -b main,system 2>/dev/null | grep -vE "AppsFilter|BlockstoreStorage| godot   :" | tail -200
  echo "---- crash buffer ----"
  adb logcat -d -b crash 2>/dev/null | tail -60
  echo "---- global configuration now ----"
  config
}
save() { adb logcat -d > "$OUT/logcat.txt" 2>/dev/null; adb logcat -d -b events > "$OUT/events.txt" 2>/dev/null; log "device log in $OUT/"; }
fail() { log "FAIL: $*"; diagnose; save; exit 1; }

# wait_for <seconds> <what> <command...>: runs the command every 2 s until it succeeds.
wait_for() {
  local limit="$1" what="$2"; shift 2
  local start; start=$(date +%s)
  until "$@" > /dev/null 2>&1; do
    [ $(( $(date +%s) - start )) -ge "$limit" ] && fail "emulator not ready after ${limit} s: $what"
    sleep 2
  done
  log "ready: $what ($(( $(date +%s) - start )) s)"
}
# wait_soft <seconds> <command...>: like wait_for, but returns 1 instead of failing.
wait_soft() {
  local limit="$1"; shift
  local start; start=$(date +%s)
  until "$@" > /dev/null 2>&1; do
    [ $(( $(date +%s) - start )) -ge "$limit" ] && return 1
    sleep 2
  done
}
booted() { [ "$(dev getprop sys.boot_completed)" = 1 ] && [ "$(dev getprop init.svc.bootanim)" = stopped ]; }
services() { dev pm path android | grep -q package: && dev cmd activity get-config > /dev/null && dev dumpsys window | grep -q mCurrentFocus; }
unlocked() { ! dev dumpsys window | grep -qE "mDreamingLockscreen=true|isKeyguardShowing=true|mShowingLockscreen=true"; }
landscape() { { dev dumpsys input; dev dumpsys window displays; } | grep -qE "SurfaceOrientation: (1|3)|mRotation=(1|3)|ROTATION_(90|270)"; }

# The global configuration unchanged for 15 s. Root cause of the flaky runs: launched while the
# emulator was still finishing its boot (boot-completed receivers running), the game's activity
# was relaunched by a configuration change ("handleRelaunchActivity" in the events log); Godot
# cannot start twice in one process, so it ends its own process (exit reason SIGNALED, signal 9,
# no crash) about a second later. Godot's manifest handles rotation, but not every change
# (overlay asset paths, SIM country, fonts), so the launch waits for a steady configuration.
config_steady() {
  local limit=120 start last now stable_since
  start=$(date +%s); last=$(config); stable_since=$start
  while true; do
    sleep 3
    now=$(config)
    if [ "$now" != "$last" ]; then
      log "configuration changed: $now"
      last=$now; stable_since=$(date +%s)
    elif [ $(( $(date +%s) - stable_since )) -ge 15 ]; then
      log "ready: configuration steady for 15 s"
      return
    fi
    [ $(( $(date +%s) - start )) -ge "$limit" ] && fail "configuration still changing after ${limit} s"
  done
}

if [ "$SETTLE" = 1 ]; then
  wait_for 300 "boot completed" booted
  wait_for 120 "package and activity managers answer" services
  dev input keyevent KEYCODE_WAKEUP; dev wm dismiss-keyguard; dev input keyevent KEYCODE_MENU
  wait_for 60 "screen unlocked" unlocked
  # The game asks for landscape; turning the display first means no rotation while it starts.
  dev settings put system accelerometer_rotation 0
  dev settings put system user_rotation 1
  # Only reported: dumpsys wording differs between Android versions; the steady configuration
  # below is what the launch waits on.
  if wait_soft 30 landscape; then log "ready: display in landscape"; else log "note: could not confirm landscape from dumpsys"; fi
  config_steady
fi

log "installing $APK"
adb install -r "$APK" || fail "adb install failed"
wait_for 60 "package installed" dev pm path "$PACKAGE"
ACTIVITY=$(dev cmd package resolve-activity --brief -c android.intent.category.LAUNCHER "$PACKAGE" | tail -1)
case "$ACTIVITY" in */*) ;; *) fail "no launcher activity for $PACKAGE: $ACTIVITY";; esac
adb logcat -c -b all
dev am force-stop "$PACKAGE"
log "configuration at launch: $(config)"
log "launching $ACTIVITY"
dev am start -W -n "$ACTIVITY" | grep -E "Status|LaunchState|TotalTime" | sed 's/^/  /'
start=$(date +%s)
pid=""
pressed=0
while true; do
  sleep 2
  now=$(date +%s)
  current=$(dev pidof "$PACKAGE")
  if [ -n "$current" ] && [ -z "$pid" ]; then pid=$current; log "app process $pid"; fi
  if [ -n "$pid" ] && [ "$current" != "$pid" ]; then fail "the app's process $pid ended (now: '${current:-none}')"; fi
  lines=$(boot_log | grep -F "[boot]" || true)
  if echo "$lines" | grep -qF "[boot] failed"; then fail "the game reported a loading failure"; fi
  if crashed; then fail "the app crashed"; fi
  if echo "$lines" | grep -qF "[boot] play"; then break; fi
  if echo "$lines" | grep -qF "[boot] title" && [ $((now - pressed)) -gt 10 ]; then
    log "title menu shown: pressing ENTER on PLAY"
    dev input keyevent KEYCODE_ENTER
    pressed=$now
  fi
  [ -z "$pid" ] && [ $((now - start)) -gt 30 ] && fail "the app's process never started"
  [ $((now - start)) -gt $TIMEOUT ] && fail "no \"[boot] play\" after ${TIMEOUT} s (last: $(echo "$lines" | tail -1))"
done
log "reached the test world after $(( $(date +%s) - start )) s; checking the same process keeps running"
sleep 10
current=$(dev pidof "$PACKAGE")
[ "$current" != "$pid" ] && fail "the app's process $pid is gone 10 s after reaching the test world (now: '${current:-none}')"
if crashed; then fail "the app crashed after reaching the test world"; fi
boot_log | grep -F "[boot]" | sed 's/.*\[boot\]/  [boot]/'
save
log "pass (pid $pid)"

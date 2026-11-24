#!/usr/bin/env bash
# What is inside an APK, biggest first (docs/app-size.md, decision G-243).
#   tools/apk_size_report.sh [apk] [top-N]     # default: build/android/chennai-open-world.apk, 25
# Prints the file size, the compressed bytes per group (native libraries, dex, each folder of the
# game's files) and the N biggest entries, all in MB of what the APK stores (compressed sizes, the
# number that counts for the Play Store and the download). Needs unzip and awk only.
set -euo pipefail
APK="${1:-build/android/chennai-open-world.apk}"
TOP="${2:-25}"
[ -f "$APK" ] || { echo "no such file: $APK" >&2; exit 1; }
BYTES=$(stat -c %s "$APK")
awk -v b="$BYTES" 'BEGIN { printf "APK file: %.2f MB (%d bytes)\n", b / 1e6, b }'
LIST=$(unzip -lv "$APK" | awk '$NF ~ /\// || $NF ~ /\./ { if ($1 ~ /^[0-9]+$/ && $3 ~ /^[0-9]+$/ && NF >= 8) print $1, $3, $NF }')
echo
echo "== by group (stored MB, unpacked MB, files)"
echo "$LIST" | awk '{
  n = $3; g = n
  if (n ~ /^lib\//) { split(n, p, "/"); g = "lib/" p[2] }
  else if (n ~ /^assets\/\.godot\/imported\//) { t = n; sub(/-[0-9a-f]+\.[a-z0-9.]*$/, "", t); sub(/.*\./, "", t); g = "imported from ." t "" }
  else if (n ~ /^assets\/assets\//) { split(n, p, "/"); g = "res://assets/" p[3] }
  else if (n ~ /^assets\//) { split(n, p, "/"); g = "res://" p[2] }
  else if (n ~ /\.dex$/) g = "dex"
  else g = "other"
  s[g] += $2; u[g] += $1; c[g]++
} END { for (k in s) printf "%9.2f %9.2f %6d  %s\n", s[k] / 1e6, u[k] / 1e6, c[k], k }' | sort -rn
echo
echo "== $TOP biggest entries (stored MB, unpacked MB)"
{ echo "$LIST" | sort -k2,2 -rn 2>/dev/null | head -n "$TOP" || true; } | awk '{ printf "%9.2f %9.2f  %s\n", $2 / 1e6, $1 / 1e6, $3 }'

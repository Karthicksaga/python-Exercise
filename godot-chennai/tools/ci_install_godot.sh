#!/usr/bin/env bash
# Installs Godot 4.7.2 stable (and with --android its Android export templates) into
# $GODOT_HOME (default ~/godot-4.7.2), checking the official SHA-512 sums. Used by CI
# (.github/workflows/godot-chennai.yml), whose cache keeps $GODOT_HOME between runs.
# Prints nothing it does not need to; puts `godot` on the PATH through $GITHUB_PATH when set.
set -euo pipefail
VERSION=4.7.2
BASE="https://github.com/godotengine/godot-builds/releases/download/${VERSION}-stable"
GODOT_HOME="${GODOT_HOME:-$HOME/godot-$VERSION}"
TEMPLATES="$HOME/.local/share/godot/export_templates/${VERSION}.stable"
mkdir -p "$GODOT_HOME"
cd "$GODOT_HOME"
sums() { [ -f SHA512-SUMS.txt ] || curl -fsSL -o SHA512-SUMS.txt "$BASE/SHA512-SUMS.txt"; }
fetch() {  # fetch <file>: download once and check its sum
  local file="$1"
  if [ ! -f "$file.ok" ]; then
    sums
    curl -fsSL --retry 3 -o "$file" "$BASE/$file"
    grep " $file\$" SHA512-SUMS.txt | sha512sum -c - > /dev/null
    touch "$file.ok"
  fi
}
if [ ! -x godot ]; then
  fetch "Godot_v${VERSION}-stable_linux.x86_64.zip"
  unzip -oq "Godot_v${VERSION}-stable_linux.x86_64.zip"
  mv "Godot_v${VERSION}-stable_linux.x86_64" godot
  rm "Godot_v${VERSION}-stable_linux.x86_64.zip"
fi
if [ "${1:-}" = "--android" ]; then
  # Only the Android templates (about 0.1 GB of the 1.3 GB archive) are kept in the cache.
  if [ ! -d android-templates ]; then
    fetch "Godot_v${VERSION}-stable_export_templates.tpz"
    unzip -oq "Godot_v${VERSION}-stable_export_templates.tpz" 'templates/android_*' 'templates/version.txt' -d tpz
    mv tpz/templates android-templates
    rm -rf tpz "Godot_v${VERSION}-stable_export_templates.tpz"
  fi
  mkdir -p "$TEMPLATES"
  cp -n android-templates/* "$TEMPLATES/"
fi
[ -n "${GITHUB_PATH:-}" ] && echo "$GODOT_HOME" >> "$GITHUB_PATH"
"$GODOT_HOME/godot" --headless --version

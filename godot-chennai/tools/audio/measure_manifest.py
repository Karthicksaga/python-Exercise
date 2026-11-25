#!/usr/bin/env python3
"""Measures every recorded and synthesised sound file in `assets/audio/manifest.json` and stores
the numbers the tests hold to their limits (decision G-371): `metrics` = {channels, sha256, bytes,
rms_db, peak_db, lufs, loop_jump}, measured on the decoded file (so the Ogg encode is included).

    python3 tools/audio/measure_manifest.py [--all]

By default only files under `assets/audio/rec/` and `assets/audio/synthetic/`; --all adds the
stand-ins. Run again whenever a sound file changes (the tests check the file's hash).
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import audio_dsp as dsp  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MANIFEST = os.path.join(ROOT, "assets", "audio", "manifest.json")


def main():
    manifest = json.load(open(MANIFEST))
    n = 0
    for pid, row in manifest["files"].items():
        path = row["path"].replace("res://", "")
        if "--all" not in sys.argv and "/rec/" not in path and "/synthetic/" not in path:
            continue
        row["metrics"] = dsp.measure(os.path.join(ROOT, path))
        n += 1
    with open(MANIFEST, "w") as f:
        f.write(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print("measured %d files" % n)


if __name__ == "__main__":
    main()

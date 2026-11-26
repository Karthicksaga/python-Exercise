#!/usr/bin/env python3
"""
Import settings of the cast (docs/characters.md): every `assets/people/<id>.glb.import` gets
the five clips set to loop (glTF has no loop flag), so the game never has to, and the clips
imported at 60 fps (Godot re-bakes glTF animation at `animation/fps`, 30 by default, which
undid the run's 60 fps keys and sank a sole 2.5 cm at its landings; decision G-103). The
player's clip rig `assets/animations/locomotion.glb` gets the same fps. Godot writes the
`.import` files on its first import; run this after it, then import again:

    godot --headless --path godot-chennai --import
    python3 tools/blender/people_import.py
    godot --headless --path godot-chennai --import

`tools/build_people.sh` does all three. Files in assets/people/legacy/ (Foundation's copy of the
Three.js cast) are left alone.
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PEOPLE = os.path.abspath(os.path.join(HERE, "..", "..", "assets", "people"))
LOCOMOTION = os.path.abspath(os.path.join(HERE, "..", "..", "assets", "animations", "locomotion.glb.import"))
CLIPS = ("idle", "walk", "run", "sit", "talk")
IMPORT_FPS = 60
SUBRESOURCES = "_subresources={\n\"animations\": {\n" + ",\n".join(
    f"\"{c}\": {{\n\"settings/loop_mode\": 1\n}}" for c in CLIPS) + "\n}\n}"


def set_fps(text):
    return re.sub(r"^animation/fps=.*$", f"animation/fps={IMPORT_FPS}", text, flags=re.M)


def main():
    missing, changed = [], 0
    for name in sorted(os.listdir(PEOPLE)):
        if not name.endswith(".glb"):
            continue
        path = os.path.join(PEOPLE, name + ".import")
        if not os.path.exists(path):
            missing.append(name)
            continue
        text = open(path).read()
        new = re.sub(r"_subresources=\{.*?\n\}(?=\n[a-z_]+/|\Z|\n\n)", SUBRESOURCES, text, flags=re.S) if "_subresources={}" not in text \
            else text.replace("_subresources={}", SUBRESOURCES)
        new = set_fps(new)
        if new != text:
            open(path, "w").write(new)
            changed += 1
    if os.path.exists(LOCOMOTION):
        text = open(LOCOMOTION).read()
        if set_fps(text) != text:
            open(LOCOMOTION, "w").write(set_fps(text))
            changed += 1
    print(f"people_import: {changed} .import files updated, {len(missing)} without one")
    if missing:
        sys.exit("import the project first: " + ", ".join(missing[:5]))


if __name__ == "__main__":
    main()

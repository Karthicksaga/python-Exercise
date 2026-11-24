#!/usr/bin/env python3
"""
Import settings of the cast (docs/characters.md): every `assets/people/<id>.glb.import` gets
the five clips set to loop (glTF has no loop flag), so the game never has to. Godot writes the
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
CLIPS = ("idle", "walk", "run", "sit", "talk")
SUBRESOURCES = "_subresources={\n\"animations\": {\n" + ",\n".join(
    f"\"{c}\": {{\n\"settings/loop_mode\": 1\n}}" for c in CLIPS) + "\n}\n}"


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
        if new != text:
            open(path, "w").write(new)
            changed += 1
    print(f"people_import: {changed} .import files updated, {len(missing)} without one")
    if missing:
        sys.exit("import the project first: " + ", ".join(missing[:5]))


if __name__ == "__main__":
    main()

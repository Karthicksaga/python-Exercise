#!/usr/bin/env python3
"""
Blender's GLBs (PNG textures, every animation channel sampled) -> the game's GLBs in
`godot-chennai/assets/people/`.

Steps per file, with glTF Transform's command line (MIT; fetched by npx, nothing committed):
dedup, prune (unused vertex attributes such as MPFB's second UV set; leaf nodes kept: the
bone ends), resample (drops repeated keyframes, lossless) and WebP textures (quality 85,
512 px stay 512 px). Godot 4.7 imports EXT_texture_webp, but NOT EXT_meshopt_compression or
KHR_mesh_quantization, so geometry stays plain float glTF (checked headless, see
docs/characters.md).

    python3 tools/blender/optimize_people.py <raw dir> [<out dir>]
"""
import os
import shutil
import subprocess
import sys
import tempfile

CLI = ["npx", "--yes", "@gltf-transform/cli@4.5.0"]
HERE = os.path.dirname(os.path.abspath(__file__))


def run(*args):
    subprocess.run(CLI + list(args), check=True, stdout=subprocess.DEVNULL)


def optimise(src, dst):
    with tempfile.TemporaryDirectory() as tmp:
        a, b, c = (os.path.join(tmp, n) for n in ("a.glb", "b.glb", "c.glb"))
        run("dedup", src, a)
        run("prune", "--keep-leaves", "true", "--keep-attributes", "false", a, b)
        run("resample", b, c)
        run("webp", "--quality", "85", c, dst)


def main():
    raw = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), "chennai-people-raw"))
    out = os.path.abspath(sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "..", "..", "assets", "people"))
    os.makedirs(out, exist_ok=True)
    before = after = 0
    for name in sorted(os.listdir(raw)):
        if not name.endswith(".glb"):
            continue
        src, dst = os.path.join(raw, name), os.path.join(out, name)
        optimise(src, dst)
        before += os.path.getsize(src)
        after += os.path.getsize(dst)
        print(f"{name}: {os.path.getsize(src) // 1024} KB -> {os.path.getsize(dst) // 1024} KB")
    print(f"total {before / 1e6:.1f} MB -> {after / 1e6:.1f} MB")
    if shutil.which("npx") is None:
        sys.exit("npx (Node.js) is needed")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Adds the "Android Compatibility" export preset at build time (decision G-255).

The A/B APK for weak phones: the same game as the "Android" preset, started on the
Compatibility renderer (OpenGL ES 3) instead of Mobile (Vulkan), under its own package name so
both install side by side. It is derived from preset "Android" every time, so its include and
exclude filters always match the main APK's (those filters belong to the size work); nothing
is committed to export_presets.cfg.

    python3 tools/compat_preset.py            # appends the preset to export_presets.cfg
    python3 tools/compat_preset.py --check    # prints it, changes nothing
"""
import re
import sys
from pathlib import Path

CFG = Path(__file__).resolve().parent.parent / "export_presets.cfg"
NAME = "Android Compatibility"
PACKAGE_SUFFIX = ".compat"
LABEL = "Chennai Open World (GL)"
ARGS = "--rendering-method gl_compatibility --rendering-driver opengl3"


def sections(text: str) -> list[tuple[str, str]]:
    """[(header, body)] in file order; the text before the first header has header ''."""
    out: list[tuple[str, str]] = []
    header = ""
    body: list[str] = []
    for line in text.splitlines(keepends=True):
        if re.match(r"^\[preset\.\d+(\.options)?\]\s*$", line):
            out.append((header, "".join(body)))
            header = line.strip()
            body = []
        else:
            body.append(line)
    out.append((header, "".join(body)))
    return out


def derive(text: str) -> str:
    parts = sections(text)
    names = {}
    for header, body in parts:
        m = re.match(r"^\[preset\.(\d+)\]$", header)
        if m:
            n = re.search(r'^name="([^"]*)"', body, re.M)
            names[n.group(1) if n else ""] = int(m.group(1))
    if NAME in names:
        raise SystemExit(f"{NAME} is already in {CFG.name}")
    if "Android" not in names:
        raise SystemExit(f'no "Android" preset in {CFG.name}')
    src = names["Android"]
    new = max(names.values()) + 1
    main = dict(parts)[f"[preset.{src}]"]
    options = dict(parts)[f"[preset.{src}.options]"]
    main = re.sub(r'^name="[^"]*"', f'name="{NAME}"', main, flags=re.M)
    main = re.sub(r'^runnable=\w+', "runnable=false", main, flags=re.M)
    main = re.sub(r'^export_path="[^"]*"', 'export_path="build/android/chennai-open-world-compat.apk"', main, flags=re.M)

    def suffix(m: re.Match) -> str:
        return f'package/unique_name="{m.group(1)}{PACKAGE_SUFFIX}"'

    options = re.sub(r'^package/unique_name="([^"]*)"', suffix, options, flags=re.M)
    options = re.sub(r'^package/name="[^"]*"', f'package/name="{LABEL}"', options, flags=re.M)
    if re.search(r"^command_line/extra_args=", options, re.M):
        options = re.sub(r'^command_line/extra_args="[^"]*"', f'command_line/extra_args="{ARGS}"', options, flags=re.M)
    else:
        options += f'command_line/extra_args="{ARGS}"\n'
    block = f"\n[preset.{new}]\n{main.rstrip()}\n\n[preset.{new}.options]\n{options.rstrip()}\n"
    return block


def main() -> None:
    text = CFG.read_text()
    block = derive(text)
    if "--check" in sys.argv:
        print(block)
        return
    CFG.write_text(text.rstrip() + "\n" + block)
    print(f"added {NAME} to {CFG.name}")


if __name__ == "__main__":
    main()

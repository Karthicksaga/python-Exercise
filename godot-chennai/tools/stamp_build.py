#!/usr/bin/env python3
"""Stamps the build's commit into project.godot at CI time (decision G-404).

The benchmark card and benchmark.txt print it (`BenchmarkDevice.commit()` reads the project
setting `application/config/build_commit`), so a screenshot from the owner's phone names the
exact build. Run before exporting; nothing is committed.

    python3 tools/stamp_build.py abc1234      # writes the setting (replaces an earlier stamp)
    python3 tools/stamp_build.py --check abc  # prints the [application] section it would write
"""
import re
import sys
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent / "project.godot"
KEY = "config/build_commit"


def stamp(text: str, commit: str) -> str:
    if not re.fullmatch(r"[0-9A-Za-z._-]{1,64}", commit):
        raise SystemExit(f"stamp_build: not a commit: {commit!r}")
    text = re.sub(rf"^{re.escape(KEY)}=.*\n", "", text, flags=re.M)
    if "\n[application]\n" not in text:
        raise SystemExit("stamp_build: no [application] section in project.godot")
    return text.replace("\n[application]\n", f'\n[application]\n\n{KEY}="{commit}"\n', 1)


def main(argv: list[str]) -> int:
    check = "--check" in argv
    args = [a for a in argv if a != "--check"]
    if len(args) != 1:
        print(__doc__)
        return 2
    out = stamp(PROJECT.read_text(), args[0][:12])
    if check:
        print(out.split("\n[", 2)[1])
    else:
        PROJECT.write_text(out)
        print(f"stamp_build: {KEY}={args[0][:12]}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

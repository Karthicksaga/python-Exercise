#!/usr/bin/env python3
"""The translatable strings of the mission content (G-442).

`src/missions/content/*.json` keep their English text. Every string under a TEXT key (title,
brief, label, ending, name, meaning, detail, where, and each value of `briefIf`) has the key
`c.<file path>`: array elements with an `id` are named by it, others by their index, so
`c.missions.morning-walk.objectives.0.label`. `src/i18n/content_keys.gd` derives the same keys
(the unit test fails if they differ).

    python3 tools/i18n/content_keys.py            # list the keys and English as TSV
    python3 tools/i18n/content_keys.py --check    # exit 1 if en.csv's `c.` rows differ
    python3 tools/i18n/content_keys.py --write    # rewrite the `c.` rows of en.csv from the content
"""
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FILES = ["content.json", "missions_v2.json"]
TEXT_KEYS = {"title", "brief", "label", "ending", "name", "meaning", "detail", "where"}
BRIEF_IF = "briefIf"


def walk(node, path, parent_key, out):
    if isinstance(node, dict):
        for k, v in node.items():
            if isinstance(v, str) and (k in TEXT_KEYS or parent_key == BRIEF_IF or k == BRIEF_IF):
                if k == BRIEF_IF:
                    continue
                out[f"c.{path}.{k}" if path else f"c.{k}"] = v
            elif isinstance(v, (dict, list)):
                walk(v, f"{path}.{k}" if path else k, k, out)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            name = str(v["id"]) if isinstance(v, dict) and isinstance(v.get("id"), str) else str(i)
            walk(v, f"{path}.{name}", parent_key, out)


def content_strings():
    out = {}
    for f in FILES:
        data = json.loads((ROOT / "src/missions/content" / f).read_text(encoding="utf-8"))
        walk(data, "", "", out)
    return out


def read_csv(path):
    with open(path, encoding="utf-8", newline="") as fh:
        return list(csv.reader(fh))


def main():
    strings = content_strings()
    if "--write" in sys.argv or "--check" in sys.argv:
        en_path = ROOT / "assets/i18n/en.csv"
        rows = read_csv(en_path)
        keep = [r for r in rows[1:] if r and not r[0].startswith("c.")]
        have = {r[0]: r[1] for r in rows[1:] if r and r[0].startswith("c.")}
        if "--check" in sys.argv:
            if have != strings:
                print("en.csv content rows differ from the content: run --write")
                return 1
            return 0
        with open(en_path, "w", encoding="utf-8", newline="") as fh:
            w = csv.writer(fh, lineterminator="\n")
            w.writerow(rows[0])
            w.writerows(keep)
            for k, v in strings.items():
                w.writerow([k, v])
        return 0
    for k, v in strings.items():
        print(f"{k}\t{v}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

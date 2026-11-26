#!/usr/bin/env python3
"""Writes docs/tamil-review.md from assets/i18n/en.csv and ta.csv (G-443).

One row per Tamil string: key, English, Tamil, status. A native speaker reads the table, fixes the
Tamil in `assets/i18n/ta.csv` and changes its status to `reviewed`; running this script again
updates the table. `--check` exits 1 when the table is out of date (the unit test calls it too).

    python3 tools/i18n/review_table.py            # write
    python3 tools/i18n/review_table.py --check
"""
import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs/tamil-review.md"

HEAD = """# Tamil review table

Every Tamil string in the game, with its English, for a **native Tamil speaker** to read (decision
G-443). The Tamil was written by Claude, not by a person: **machine Tamil is never shipped
unreviewed**. Until a string is reviewed its status is `needs native review`.

How to review: fix the Tamil of a row in `assets/i18n/ta.csv` (column `text`), set its `status`
to `reviewed`, then run `python3 tools/i18n/review_table.py` to refresh this table. Placeholders
(`{0}`, `{1}`, `{name}`) must stay in the text. Look especially at: station and street names (OSM
and transliterations), the jokes in the cinema and gym texts, words for game things (பொத்தான்
for button, நற்பெயர் for reputation) and politeness: the game speaks to the player as "you"
(நீங்கள்).

A release build can leave the unreviewed rows out (the export feature tag `tamil_reviewed_only`,
or the project setting `chennai/i18n/hide_unreviewed`): the game then shows those texts in
English only.

{summary}

| key | English | Tamil | status |
|---|---|---|---|
"""


def rows(path):
    with open(path, encoding="utf-8", newline="") as fh:
        return list(csv.reader(fh))[1:]


def cell(text):
    return text.replace("|", "\\|").replace("\n", " / ")


def build():
    en = {r[0]: r[1] for r in rows(ROOT / "assets/i18n/en.csv") if r}
    ta = [r for r in rows(ROOT / "assets/i18n/ta.csv") if r]
    pending = sum(1 for r in ta if len(r) < 3 or r[2] != "reviewed")
    summary = f"**{len(ta)} Tamil strings, {pending} still need native review, {len(ta) - pending} reviewed.**"
    lines = [HEAD.replace("{summary}", summary)]
    for r in ta:
        status = r[2] if len(r) > 2 else "needs native review"
        lines.append(f"| `{r[0]}` | {cell(en.get(r[0], ''))} | {cell(r[1])} | {status} |\n")
    return "".join(lines)


def main():
    text = build()
    if "--check" in sys.argv:
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != text:
            print("docs/tamil-review.md is out of date: run tools/i18n/review_table.py")
            return 1
        return 0
    OUT.write_text(text, encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())

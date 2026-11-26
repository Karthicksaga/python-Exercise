#!/usr/bin/env python3
"""Inline `assets/street_ref/facade_categories.json` into `template.html` -> `index.html`.

    python3 tools/imagery/prototype/build_prototype.py          # write index.html
    python3 tools/imagery/prototype/build_prototype.py --check  # fail when index.html is stale
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE.parents[2] / "assets" / "street_ref" / "facade_categories.json"


def build() -> str:
    data = json.dumps(json.loads(DATA.read_text(encoding="utf-8")), ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    return (HERE / "template.html").read_text(encoding="utf-8").replace("/*DATA*/", data)


if __name__ == "__main__":
    html = build()
    out = HERE / "index.html"
    if "--check" in sys.argv:
        if not out.exists() or out.read_text(encoding="utf-8") != html:
            print("index.html is stale: run build_prototype.py")
            sys.exit(1)
        print("index.html up to date")
    else:
        out.write_text(html, encoding="utf-8")
        print(f"wrote {out}")

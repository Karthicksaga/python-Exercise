#!/usr/bin/env python3
"""Downloads Wikimedia Commons files and their licence metadata for import_recordings.py (G-85, G-370).

    python3 tools/audio/fetch_commons.py --cache <dir> "WWS CityBusMANSG220horn.ogg" ...

Writes <dir>/dl/<file> and <dir>/meta_<n>.json (title -> url, file_url, licence, artist, original,
local). Polite by design: a descriptive User-Agent without personal data, one request at a time,
and HTTP 429/503 are waited out for as long as Retry-After says. Only CC0, public domain and CC-BY
(any version, not -SA, -NC, -ND) are kept; anything else is reported and not downloaded.
"""
import argparse
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

UA = "ChennaiGameAudioTool/1.0 (open-source game; sound licence research)"
API = "https://commons.wikimedia.org/w/api.php"


def get(url, tries=12):
    for _ in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=120) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (429, 503):
                wait = min(int(e.headers.get("Retry-After", "15")), 700) + 1
                print("  HTTP %d, waiting %d s" % (e.code, wait), file=sys.stderr)
                time.sleep(wait)
                continue
            raise
    raise SystemExit("gave up on " + url)


def acceptable(short):
    s = short.strip()
    if s in ("CC0", "CC0 1.0", "Public domain"):
        return True
    return bool(re.match(r"CC BY \d\.\d( [a-z]{2})?$", s))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    ap.add_argument("titles", nargs="+")
    args = ap.parse_args()
    os.makedirs(os.path.join(args.cache, "dl"), exist_ok=True)
    meta = {}
    q = urllib.parse.urlencode({"action": "query", "format": "json", "prop": "imageinfo", "iiprop": "url|extmetadata",
                                "titles": "|".join("File:" + t for t in args.titles)})
    data = json.loads(get(API + "?" + q))
    # In the order asked: the wanted files first, so a rate limit that stops the run costs the least.
    wanted = ["File:" + t.replace("_", " ") for t in args.titles]
    pages = sorted(data["query"]["pages"].values(), key=lambda p: wanted.index(p["title"]) if p["title"] in wanted else 999)
    out = os.path.join(args.cache, "meta_%s.json" % "_".join(re.sub(r"\W", "", t)[:8] for t in args.titles[:2]))
    for page in pages:
        title = page["title"]
        ii = (page.get("imageinfo") or [None])[0]
        if not ii:
            print("missing:", title)
            continue
        e = ii.get("extmetadata", {})
        lic = e.get("LicenseShortName", {}).get("value", "")
        if not acceptable(lic):
            print("REFUSED licence %r: %s" % (lic, title))
            continue
        artist = html.unescape(re.sub(r"<[^>]+>", "", e.get("Artist", {}).get("value", ""))).strip()
        name = title[5:]
        local = os.path.join(args.cache, "dl", re.sub(r"[^A-Za-z0-9._-]", "_", name))
        if not os.path.exists(local):
            print("downloading", name)
            blob = get(ii["url"])
            with open(local, "wb") as f:
                f.write(blob)
            time.sleep(3)
        meta[title] = {"url": "https://commons.wikimedia.org/wiki/" + urllib.parse.quote(title.replace(" ", "_"), safe=":/(),'"),
                       "file_url": ii["url"], "licence": lic, "artist": artist, "original": name, "local": local}
        with open(out, "w") as f:
            json.dump(meta, f, indent=1, ensure_ascii=False)
    print("wrote", out)


if __name__ == "__main__":
    main()

"""Reference photos for landmark models, listed from Wikimedia Commons (G-182).

Photos are **modelling references only**: the spec lists them (file title, author, licence, URL);
they are downloaded for viewing into a scratch folder outside the repository and never
committed. A photo may become a texture only when its licence is CC0 / public domain
(`usable_as_texture`).

Etiquette (the host rate-limits): one request every `min_interval` seconds (3.5 s by default),
a descriptive User-Agent without personal data, every response cached on disk, and on HTTP 429
or 503 the client stops and waits for `Retry-After` before trying once more. The API's
`thumburl` points at a thumbnail host this container cannot reach, so thumbnails are fetched
from `upload.wikimedia.org` with the same path (`upload_host`).
"""
from __future__ import annotations

import hashlib
import html
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Callable

API = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = "ChennaiOpenWorldGodot-LandmarkReferences/1.0 (open-source game; modelling references; https://commons.wikimedia.org/wiki/Commons:API)"
TEXTURE_LICENCES = re.compile(r"^(cc0|cc-zero|public domain|pd\b|pd-)", re.I)
_TAG = re.compile(r"<[^>]+>")


@dataclass(frozen=True)
class RefPhoto:
    title: str
    author: str
    licence: str
    licence_url: str
    page_url: str
    file_url: str
    thumb_url: str
    width: int
    height: int

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


def strip_html(text: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(_TAG.sub("", text or ""))).strip()


def upload_host(url: str) -> str:
    """Thumbnails: same path on upload.wikimedia.org (the thumb host is not reachable here)."""
    if not url:
        return url
    parts = urllib.parse.urlsplit(url)
    if parts.netloc.endswith("wikimedia.org") and parts.netloc != "upload.wikimedia.org":
        return urllib.parse.urlunsplit((parts.scheme or "https", "upload.wikimedia.org", parts.path, parts.query, ""))
    return url


def usable_as_texture(licence: str) -> bool:
    return bool(TEXTURE_LICENCES.search(licence.strip()))


def photo_from_info(title: str, info: dict[str, Any]) -> RefPhoto:
    meta: dict[str, Any] = info.get("extmetadata", {})

    def m(key: str) -> str:
        return strip_html(str(meta.get(key, {}).get("value", "")))

    return RefPhoto(
        title=title,
        author=m("Artist") or m("Credit") or "unknown",
        licence=m("LicenseShortName") or m("License") or "unknown",
        licence_url=m("LicenseUrl"),
        page_url=str(info.get("descriptionurl", "")),
        file_url=str(info.get("url", "")),
        thumb_url=upload_host(str(info.get("thumburl", ""))),
        width=int(info.get("width", 0)),
        height=int(info.get("height", 0)),
    )


class CommonsClient:
    def __init__(self, cache: Path, min_interval: float = 3.5, sleep: Callable[[float], None] = time.sleep,
                 opener: Callable[[urllib.request.Request], Any] | None = None) -> None:
        self.cache = cache
        self.cache.mkdir(parents=True, exist_ok=True)
        self.min_interval = max(3.0, min_interval)
        self._sleep = sleep
        self._open = opener or (lambda req: urllib.request.urlopen(req, timeout=60))
        self._last = 0.0
        self.requests = 0

    def _wait_turn(self) -> None:
        gap = time.monotonic() - self._last
        if gap < self.min_interval:
            self._sleep(self.min_interval - gap)
        self._last = time.monotonic()

    def fetch(self, url: str) -> bytes:
        key = hashlib.sha256(url.encode()).hexdigest()[:32]
        hit = self.cache / key
        if hit.exists():
            return hit.read_bytes()
        for attempt in range(2):
            self._wait_turn()
            self.requests += 1
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            try:
                with self._open(req) as resp:
                    body: bytes = resp.read()
                hit.write_bytes(body)
                return body
            except urllib.error.HTTPError as e:
                if e.code in (429, 503) and attempt == 0:
                    retry = e.headers.get("Retry-After", "") if e.headers else ""
                    wait = float(retry) if retry.strip().isdigit() else 120.0
                    print(f"[refs] HTTP {e.code}: waiting {wait:.0f} s as asked", flush=True)
                    self._sleep(wait)
                    continue
                raise
        raise RuntimeError("unreachable")

    def api(self, **params: str) -> dict[str, Any]:
        q = {"format": "json", "formatversion": "2", **params}
        out: dict[str, Any] = json.loads(self.fetch(API + "?" + urllib.parse.urlencode(sorted(q.items()))))
        return out

    def category_files(self, category: str, limit: int = 30) -> list[str]:
        data = self.api(action="query", list="categorymembers", cmtitle=category, cmtype="file", cmlimit=str(limit))
        return [m["title"] for m in data.get("query", {}).get("categorymembers", [])]

    def search_files(self, text: str, limit: int = 20) -> list[str]:
        data = self.api(action="query", list="search", srsearch=text, srnamespace="6", srlimit=str(limit))
        return [m["title"] for m in data.get("query", {}).get("search", [])]

    def infos(self, titles: list[str], thumb_width: int = 1024) -> list[RefPhoto]:
        out: list[RefPhoto] = []
        for i in range(0, len(titles), 40):
            chunk = titles[i:i + 40]
            data = self.api(action="query", prop="imageinfo", titles="|".join(chunk),
                            iiprop="url|size|extmetadata", iiurlwidth=str(thumb_width),
                            iiextmetadatafilter="Artist|Credit|LicenseShortName|License|LicenseUrl")
            for page in data.get("query", {}).get("pages", []):
                ii = page.get("imageinfo")
                if ii:
                    out.append(photo_from_info(page["title"], ii[0]))
        return out

    def download(self, photo: RefPhoto, folder: Path) -> Path:
        folder.mkdir(parents=True, exist_ok=True)
        name = re.sub(r"[^A-Za-z0-9._-]+", "_", photo.title.removeprefix("File:"))[:120]
        target = folder / name
        if not target.exists():
            target.write_bytes(self.fetch(photo.thumb_url or photo.file_url))
        return target

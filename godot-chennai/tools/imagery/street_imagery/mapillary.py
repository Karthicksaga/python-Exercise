"""Mapillary Graph API v4: images in a bounding box.

Written from the public v4 documentation as recalled (developers.mapillary.com); it has NOT been
run against the live API from this sandbox (egress blocked, no token; see docs/street-imagery.md
section 3). The parser is tested only with hand-written payloads shaped like the documented
response. Never requests a thumbnail or image URL: the tools collect metadata only.

Facts the code relies on, each to be confirmed on the first real run:
- `GET https://graph.mapillary.com/images?bbox=W,S,E,N&fields=...&limit=N`, token in the header
  `Authorization: OAuth <token>` (so it never appears in a URL, a log or the database).
- the answer is `{"data": [...]}`, each item with `id`, `geometry` (GeoJSON Point, [lng, lat]),
  `captured_at` (milliseconds since the epoch), `sequence`, `creator` ({id, username}).
- an error is `{"error": {"message", "type", "code"}}`.
- licence: the images endpoint returns no licence field; Mapillary's terms put street-level
  imagery under CC BY-SA 4.0. The record says so (`license_source` = "provider_terms").
"""
from __future__ import annotations

import os
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlencode

from .bbox import BBox
from .errors import AuthError, MissingTokenError, ProviderError, TooMuchDataError
from .http import HttpClient
from .models import CC_BY_SA_4, ImageRecord, ParseResult

PROVIDER = "mapillary"
TOKEN_ENV = "MAPILLARY_TOKEN"
BASE = "https://graph.mapillary.com/images"
# Metadata only. No thumb_*_url, no mesh, no sfm_cluster: pixels and derived geometry are not wanted.
FIELDS = ("id", "geometry", "captured_at", "sequence", "creator", "compass_angle", "is_pano")
DEFAULT_LIMIT = 2000


def token_from_env(env: dict[str, str] | None = None) -> str:
    tok = (env if env is not None else dict(os.environ)).get(TOKEN_ENV, "").strip()
    if not tok:
        raise MissingTokenError(
            f"{TOKEN_ENV} is not set. Mapillary needs a client token: create a free app at "
            "https://www.mapillary.com/dashboard/developers, copy its client token and export it "
            f"(export {TOKEN_ENV}=MLY|...). The tools never store or print it."
        )
    return tok


def build_url(box: BBox, limit: int = DEFAULT_LIMIT) -> str:
    q = {"bbox": f"{box.west},{box.south},{box.east},{box.north}", "fields": ",".join(FIELDS), "limit": str(limit)}
    return f"{BASE}?{urlencode(q, safe=',')}"


def _iso_from_ms(v: Any) -> str | None:
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return datetime.fromtimestamp(v / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    if isinstance(v, str) and v:
        try:
            return datetime.fromisoformat(v.replace("Z", "+00:00")).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        except ValueError:
            return None
    return None


def parse_images(payload: Any) -> ParseResult:
    """Parse one response page. Raises ProviderError for an error object or an unexpected shape."""
    if not isinstance(payload, dict):
        raise ProviderError("Mapillary response is not an object")
    err = payload.get("error")
    if err is not None:
        msg = err.get("message", "") if isinstance(err, dict) else str(err)
        code = err.get("code") if isinstance(err, dict) else None
        low = msg.lower()
        if code in (190, 102) or "access token" in low or "oauth" in low:
            raise AuthError(f"Mapillary: {msg} (code {code})")
        if "reduce" in low or "too many" in low or ("bbox" in low and "large" in low):
            raise TooMuchDataError(f"Mapillary: {msg}")
        raise ProviderError(f"Mapillary error: {msg} (code {code})")
    data = payload.get("data")
    if not isinstance(data, list):
        raise ProviderError("Mapillary response has no 'data' list")
    out = ParseResult()
    for item in data:
        try:
            iid = str(item["id"])
            lng, lat = item["geometry"]["coordinates"][:2]
            lat_f, lng_f = float(lat), float(lng)
        except (KeyError, TypeError, ValueError, IndexError):
            out.skipped += 1
            continue
        creator = item.get("creator")
        username = creator.get("username") if isinstance(creator, dict) else None
        seq = item.get("sequence")
        lic = item.get("license")
        attribution = "Imagery © Mapillary contributors" + (f" (user {username})" if username else "") + ", CC BY-SA 4.0"
        ca = item.get("compass_angle")
        pano = item.get("is_pano")
        out.records.append(ImageRecord(
            provider=PROVIDER, id=iid, lat=lat_f, lng=lng_f, captured_at=_iso_from_ms(item.get("captured_at")),
            sequence_id=str(seq) if seq else None, creator=str(username) if username else None,
            license=str(lic) if lic else CC_BY_SA_4, license_source="api_field" if lic else "provider_terms",
            attribution=attribution, compass_angle=float(ca) if isinstance(ca, (int, float)) else None,
            is_pano=pano if isinstance(pano, bool) else None,
        ))
    return out


class MapillaryClient:
    """Search a box. A full page (limit reached) means the box may hold more: it is split into
    quarters until each answer is under the limit or the box is smaller than `min_span_deg`."""

    def __init__(self, token: str, http: HttpClient, limit: int = DEFAULT_LIMIT, min_span_deg: float = 0.0005) -> None:
        self.token = token
        self.http = http
        self.limit = limit
        self.min_span_deg = min_span_deg
        self.skipped = 0
        self.warnings: list[str] = []

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"OAuth {self.token}", "Accept": "application/json"}

    def search(self, box: BBox, on_page: Callable[[BBox, int], None] | None = None) -> list[ImageRecord]:
        """All images in `box` (deduplicated by id). Raises AuthError/NetworkError/... unchanged."""
        found: dict[str, ImageRecord] = {}
        self._search(box, found, on_page)
        return list(found.values())

    def _search(self, box: BBox, found: dict[str, ImageRecord], on_page: Callable[[BBox, int], None] | None) -> None:
        status, payload = self.http.get_json(build_url(box, self.limit), self._headers())
        try:
            res = parse_images(payload)
        except TooMuchDataError:
            if box.span_deg <= self.min_span_deg:
                raise
            for q in box.quarters():
                self._search(q, found, on_page)
            return
        self.skipped += res.skipped
        if status == 400:
            raise ProviderError(f"Mapillary HTTP 400 without a parsable error for box {box}")
        if on_page is not None:
            on_page(box, len(res.records))
        if len(res.records) >= self.limit:
            if box.span_deg > self.min_span_deg:
                for q in box.quarters():
                    self._search(q, found, on_page)
                return
            self.warnings.append(f"box {box} still full at {self.limit} images and below the minimum size: results truncated")
        for r in res.records:
            found.setdefault(r.id, r)

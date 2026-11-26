"""KartaView (formerly OpenStreetCam) API 2.0: photos in a bounding box.

Written from the public documentation as recalled (kartaview.org/doc); NOT run against the live
API from this sandbox (egress blocked, see docs/street-imagery.md section 3) and the parameter
names below are exactly what must be confirmed first. Parser tested with hand-written payloads
only. Metadata only: no photo URL fields are read.

Recalled shape:
- `GET https://api.openstreetcam.org/2.0/photo/?bbTopLeft=lat,lng&bbBottomRight=lat,lng&itemsPerPage=N&page=P`
- `{"status": {...}, "result": {"data": [{"id", "sequenceId", "lat", "lng", "heading", "shotDate", "username"?}], "hasMoreData": bool}}`
- reading needs no key; an optional token goes in `Authorization: Bearer <KARTAVIEW_TOKEN>`.
- licence: KartaView's terms put contributed imagery under CC BY-SA 4.0 (not returned per photo).
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlencode

from .bbox import BBox
from .errors import ProviderError
from .http import HttpClient
from .models import CC_BY_SA_4, ImageRecord, ParseResult

PROVIDER = "kartaview"
TOKEN_ENV = "KARTAVIEW_TOKEN"
BASE = "https://api.openstreetcam.org/2.0/photo/"
PAGE_SIZE = 1000
MAX_PAGES = 200


def token_from_env(env: dict[str, str] | None = None) -> str | None:
    """Optional: KartaView reads are documented as public. None when unset."""
    tok = (env if env is not None else dict(os.environ)).get(TOKEN_ENV, "").strip()
    return tok or None


def build_url(box: BBox, page: int, per_page: int = PAGE_SIZE) -> str:
    q = {"bbTopLeft": f"{box.north},{box.west}", "bbBottomRight": f"{box.south},{box.east}",
         "itemsPerPage": str(per_page), "page": str(page)}
    return f"{BASE}?{urlencode(q, safe=',')}"


def _iso(v: Any) -> str | None:
    if not isinstance(v, str) or not v:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d"):
        try:
            return datetime.strptime(v, fmt).replace(tzinfo=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(v).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except ValueError:
        return None


def parse_photos(payload: Any) -> tuple[ParseResult, bool]:
    """(records, more pages available)."""
    if not isinstance(payload, dict):
        raise ProviderError("KartaView response is not an object")
    result = payload.get("result")
    if not isinstance(result, dict) or not isinstance(result.get("data"), list):
        status = payload.get("status")
        raise ProviderError(f"KartaView response has no result.data list (status: {status!r})")
    out = ParseResult()
    for item in result["data"]:
        try:
            pid = str(item["id"])
            lat, lng = float(item["lat"]), float(item["lng"])
        except (KeyError, TypeError, ValueError):
            out.skipped += 1
            continue
        user = item.get("username")
        seq = item.get("sequenceId")
        heading = item.get("heading")
        try:
            heading_f = float(heading) if heading not in (None, "") else None
        except (TypeError, ValueError):
            heading_f = None
        out.records.append(ImageRecord(
            provider=PROVIDER, id=pid, lat=lat, lng=lng, captured_at=_iso(item.get("shotDate")),
            sequence_id=str(seq) if seq not in (None, "") else None, creator=str(user) if user else None,
            license=CC_BY_SA_4, license_source="provider_terms",
            attribution="Imagery © KartaView contributors" + (f" (user {user})" if user else "") + ", CC BY-SA 4.0",
            compass_angle=heading_f,
        ))
    return out, bool(result.get("hasMoreData"))


class KartaViewClient:
    def __init__(self, http: HttpClient, token: str | None = None, per_page: int = PAGE_SIZE) -> None:
        self.http = http
        self.token = token
        self.per_page = per_page
        self.skipped = 0
        self.warnings: list[str] = []

    def search(self, box: BBox) -> list[ImageRecord]:
        headers = {"Accept": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        found: dict[str, ImageRecord] = {}
        for page in range(1, MAX_PAGES + 1):
            _, payload = self.http.get_json(build_url(box, page, self.per_page), headers)
            res, more = parse_photos(payload)
            self.skipped += res.skipped
            for r in res.records:
                found.setdefault(r.id, r)
            if not more:
                break
        else:
            self.warnings.append(f"stopped after {MAX_PAGES} pages for {box}: results truncated")
        return list(found.values())

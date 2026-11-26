"""The one record every provider is parsed into."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

CC_BY_SA_4 = "CC-BY-SA-4.0"


@dataclass(frozen=True)
class ImageRecord:
    """Metadata of one street-level photograph. Never the pixels, never a thumbnail URL."""

    provider: str  # "mapillary" | "kartaview"
    id: str
    lat: float
    lng: float
    captured_at: str | None  # ISO 8601 UTC, None when the provider gave none
    sequence_id: str | None
    creator: str | None
    license: str  # an SPDX-style id
    license_source: str  # "api_field" (the API returned it) or "provider_terms" (stated in the provider's terms, not in the response)
    attribution: str
    compass_angle: float | None = None
    is_pano: bool | None = None

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class ParseResult:
    records: list[ImageRecord] = field(default_factory=list)
    skipped: int = 0  # items without a usable id or position

"""One small HTTP layer shared by the providers: JSON GET with retry on 429 and 5xx.

`Transport` is the only thing that touches the network, so tests give the client a scripted
transport and a recording `sleep` (no wall clock, no network).
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from typing import Any, Protocol

from .errors import AuthError, NetworkError, ProviderError, RateLimitError

USER_AGENT = "chennai-street-imagery-tools/1 (open-source game research; contact via repository)"


@dataclass(frozen=True)
class Response:
    status: int
    body: bytes
    headers: Mapping[str, str] = field(default_factory=dict)


class Transport(Protocol):
    def __call__(self, url: str, headers: Mapping[str, str], timeout: float) -> Response: ...


def urllib_transport(url: str, headers: Mapping[str, str], timeout: float) -> Response:
    """The real transport. HTTP error statuses are returned, not raised; anything that means
    "no answer" (DNS, proxy CONNECT refusal, timeout) raises `NetworkError` with the reason."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **headers})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310 (https URLs built by us)
            return Response(r.status, r.read(), dict(r.headers))
    except urllib.error.HTTPError as e:
        return Response(e.code, e.read() or b"", dict(e.headers or {}))
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise NetworkError(f"{type(e).__name__}: {e}") from e


def redact(url: str) -> str:
    """The URL without any access_token value, safe to print or store."""
    out: list[str] = []
    for part in url.split("&"):
        key, _, _ = part.partition("=")
        out.append(f"{key}=REDACTED" if key.endswith("access_token") else part)
    return "&".join(out)


class HttpClient:
    def __init__(
        self,
        transport: Transport = urllib_transport,
        sleep: Callable[[float], None] = time.sleep,
        retries: int = 5,
        base_delay: float = 1.0,
        max_delay: float = 60.0,
        timeout: float = 30.0,
    ) -> None:
        self.transport = transport
        self.sleep = sleep
        self.retries = retries
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.timeout = timeout
        self.requests_made = 0

    def _delay(self, attempt: int, resp: Response | None) -> float:
        if resp is not None:
            ra = {k.lower(): v for k, v in resp.headers.items()}.get("retry-after")
            if ra is not None:
                try:
                    return min(float(ra), self.max_delay)
                except ValueError:
                    pass
        return min(self.base_delay * (2**attempt), self.max_delay)

    def get_json(self, url: str, headers: Mapping[str, str] | None = None) -> tuple[int, Any]:
        """(status, parsed JSON) for statuses the caller may want to read (2xx and 400).
        Raises AuthError for 401/403, RateLimitError when 429 outlasts the retries, ProviderError
        for other statuses or a body that is not JSON, NetworkError when nothing answered."""
        hdrs = dict(headers or {})
        last: Response | None = None
        for attempt in range(self.retries + 1):
            self.requests_made += 1
            resp = self.transport(url, hdrs, self.timeout)
            last = resp
            if resp.status == 429 or resp.status >= 500:
                if attempt == self.retries:
                    break
                self.sleep(self._delay(attempt, resp))
                continue
            if resp.status in (401, 403):
                raise AuthError(f"HTTP {resp.status} from {redact(url)}: {resp.body[:200].decode('utf-8', 'replace')}")
            if resp.status >= 300 and resp.status != 400:
                raise ProviderError(f"HTTP {resp.status} from {redact(url)}")
            try:
                return resp.status, json.loads(resp.body)
            except json.JSONDecodeError as e:
                raise ProviderError(f"HTTP {resp.status} from {redact(url)}: body is not JSON ({e})") from e
        assert last is not None
        if last.status == 429:
            raise RateLimitError(f"HTTP 429 from {redact(url)} after {self.retries} retries")
        raise ProviderError(f"HTTP {last.status} from {redact(url)} after {self.retries} retries")

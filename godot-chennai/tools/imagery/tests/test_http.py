from __future__ import annotations

import json
from collections.abc import Mapping

import pytest

from street_imagery.errors import AuthError, NetworkError, ProviderError, RateLimitError
from street_imagery.http import HttpClient, Response, redact


class Script:
    def __init__(self, *responses: Response | Exception) -> None:
        self.items = list(responses)
        self.calls: list[tuple[str, Mapping[str, str]]] = []

    def __call__(self, url: str, headers: Mapping[str, str], timeout: float) -> Response:
        self.calls.append((url, headers))
        it = self.items.pop(0)
        if isinstance(it, Exception):
            raise it
        return it


def ok(obj: object, status: int = 200) -> Response:
    return Response(status, json.dumps(obj).encode())


def test_retries_429_with_retry_after_then_succeeds() -> None:
    sleeps: list[float] = []
    t = Script(Response(429, b"", {"Retry-After": "7"}), Response(503, b""), ok({"a": 1}))
    c = HttpClient(t, sleeps.append, base_delay=2.0)
    assert c.get_json("https://x/y") == (200, {"a": 1})
    assert sleeps == [7.0, 4.0]  # Retry-After honoured, then exponential backoff (2 * 2**1)
    assert c.requests_made == 3


def test_rate_limit_after_all_retries() -> None:
    c = HttpClient(Script(*[Response(429, b"")] * 3), lambda s: None, retries=2)
    with pytest.raises(RateLimitError):
        c.get_json("https://x/y")


def test_auth_error_not_retried_and_token_not_leaked() -> None:
    t = Script(Response(401, b'{"error":"bad"}'))
    c = HttpClient(t, lambda s: None)
    with pytest.raises(AuthError) as e:
        c.get_json("https://x/y?access_token=SECRET&bbox=1")
    assert "SECRET" not in str(e.value) and len(t.calls) == 1


def test_400_is_returned_for_the_caller_and_other_statuses_raise() -> None:
    assert HttpClient(Script(ok({"error": {}}, 400)), lambda s: None).get_json("https://x") == (400, {"error": {}})
    with pytest.raises(ProviderError):
        HttpClient(Script(Response(404, b"")), lambda s: None).get_json("https://x")
    with pytest.raises(ProviderError):
        HttpClient(Script(Response(200, b"<html>")), lambda s: None).get_json("https://x")


def test_network_error_propagates() -> None:
    with pytest.raises(NetworkError):
        HttpClient(Script(NetworkError("proxy refused")), lambda s: None).get_json("https://x")


def test_server_errors_exhaust_into_provider_error() -> None:
    with pytest.raises(ProviderError):
        HttpClient(Script(*[Response(502, b"")] * 2), lambda s: None, retries=1).get_json("https://x")


def test_redact() -> None:
    assert redact("https://a/b?access_token=XYZ&bbox=1,2") == "https://a/b?access_token=REDACTED&bbox=1,2"

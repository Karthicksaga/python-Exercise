"""Provider parsing and client logic. Payloads come from `parser_fixtures` (made up, parsing only)."""
from __future__ import annotations

import json
from collections.abc import Mapping

import pytest
from parser_fixtures import (KARTAVIEW_PAGE_1, KARTAVIEW_PAGE_2, MAPILLARY_AUTH_ERROR, MAPILLARY_BIG_BOX_ERROR, MAPILLARY_PAGE)

from street_imagery import kartaview, mapillary
from street_imagery.bbox import BBox, parse_bbox
from street_imagery.errors import AuthError, MissingTokenError, ProviderError, TooMuchDataError
from street_imagery.http import HttpClient, Response

BOX = BBox(13.08, 80.20, 13.09, 80.21)


def scripted(*payloads: object, status: int = 200) -> tuple[HttpClient, list[tuple[str, Mapping[str, str]]]]:
    calls: list[tuple[str, Mapping[str, str]]] = []
    items = list(payloads)

    def transport(url: str, headers: Mapping[str, str], timeout: float) -> Response:
        calls.append((url, headers))
        return Response(status, json.dumps(items.pop(0)).encode())

    return HttpClient(transport, lambda s: None), calls


def test_mapillary_missing_token_message() -> None:
    with pytest.raises(MissingTokenError) as e:
        mapillary.token_from_env({})
    assert "MAPILLARY_TOKEN" in str(e.value) and "developers" in str(e.value)
    assert mapillary.token_from_env({"MAPILLARY_TOKEN": " MLY|x "}) == "MLY|x"


def test_mapillary_url_asks_for_metadata_only() -> None:
    url = mapillary.build_url(BOX)
    assert "bbox=80.2,13.08,80.21,13.09" in url and "access_token" not in url
    assert "thumb" not in url and "mesh" not in url


def test_mapillary_parse_fixture() -> None:
    res = mapillary.parse_images(MAPILLARY_PAGE)
    assert [r.id for r in res.records] == ["1000000000000001", "1000000000000002"] and res.skipped == 1
    r = res.records[0]
    assert (r.lat, r.lng) == (13.085, 80.2101) and r.captured_at == "2021-01-01T00:00:00Z"
    assert r.sequence_id == "seq-a" and r.creator == "test_user" and r.compass_angle == 90.5 and r.is_pano is False
    assert r.license == "CC-BY-SA-4.0" and r.license_source == "provider_terms" and "Mapillary" in r.attribution and "CC BY-SA 4.0" in r.attribution
    assert res.records[1].creator is None and res.records[1].captured_at == "2021-01-01T00:01:00Z"


def test_mapillary_api_licence_field_is_kept_when_present() -> None:
    item = {"id": "9", "geometry": {"coordinates": [80.2, 13.0]}, "license": "CC-BY-4.0"}
    r = mapillary.parse_images({"data": [item]}).records[0]
    assert (r.license, r.license_source) == ("CC-BY-4.0", "api_field")


def test_mapillary_errors() -> None:
    with pytest.raises(AuthError):
        mapillary.parse_images(MAPILLARY_AUTH_ERROR)
    with pytest.raises(TooMuchDataError):
        mapillary.parse_images(MAPILLARY_BIG_BOX_ERROR)
    with pytest.raises(ProviderError):
        mapillary.parse_images({"nothing": 1})
    with pytest.raises(ProviderError):
        mapillary.parse_images([])


def test_mapillary_client_sends_token_in_header_and_dedupes() -> None:
    http, calls = scripted(MAPILLARY_PAGE)
    recs = mapillary.MapillaryClient("TOK", http).search(BOX)
    assert len(recs) == 2 and calls[0][1]["Authorization"] == "OAuth TOK" and "TOK" not in calls[0][0]


def test_mapillary_splits_a_full_page_into_quarters_and_dedupes() -> None:
    first = {"data": [MAPILLARY_PAGE["data"][0]]}
    second = {"data": [MAPILLARY_PAGE["data"][1]]}
    empty: dict[str, list[object]] = {"data": []}
    full = {"data": [MAPILLARY_PAGE["data"][0], MAPILLARY_PAGE["data"][1]]}
    http, calls = scripted(full, first, empty, empty, second)  # limit 2: the first answer is full, so four quarters follow
    recs = mapillary.MapillaryClient("T", http, limit=2).search(BOX)
    assert len(calls) == 5 and sorted(r.id for r in recs) == ["1000000000000001", "1000000000000002"]


def test_mapillary_too_much_data_error_splits_and_at_minimum_size_raises() -> None:
    answers = [MAPILLARY_BIG_BOX_ERROR] + [{"data": []}] * 4
    calls: list[str] = []

    def transport(url: str, headers: Mapping[str, str], timeout: float) -> Response:
        calls.append(url)
        body = answers.pop(0)
        return Response(400 if "error" in body else 200, json.dumps(body).encode())

    assert mapillary.MapillaryClient("T", HttpClient(transport, lambda s: None)).search(BOX) == [] and len(calls) == 5
    always = HttpClient(lambda u, h, t: Response(400, json.dumps(MAPILLARY_BIG_BOX_ERROR).encode()), lambda s: None)
    with pytest.raises(TooMuchDataError):
        mapillary.MapillaryClient("T", always, min_span_deg=0.02).search(BOX)


def test_kartaview_parse_and_pagination() -> None:
    http, calls = scripted(KARTAVIEW_PAGE_1, KARTAVIEW_PAGE_2)
    c = kartaview.KartaViewClient(http, token=None)
    recs = c.search(BOX)
    assert [r.id for r in recs] == ["5001", "5002"] and c.skipped == 1 and len(calls) == 2
    assert "Authorization" not in calls[0][1] and "page=2" in calls[1][0]
    r = recs[0]
    assert r.captured_at == "2020-02-03T04:05:06Z" and r.sequence_id == "77" and r.creator == "kv_test" and r.compass_angle == 180.0
    assert r.license == "CC-BY-SA-4.0" and r.license_source == "provider_terms"


def test_kartaview_optional_token_and_bad_shape() -> None:
    assert kartaview.token_from_env({}) is None and kartaview.token_from_env({"KARTAVIEW_TOKEN": "t"}) == "t"
    http, calls = scripted(KARTAVIEW_PAGE_2)
    kartaview.KartaViewClient(http, token="t").search(BOX)
    assert calls[0][1]["Authorization"] == "Bearer t"
    with pytest.raises(ProviderError):
        kartaview.parse_photos({"status": {"httpCode": 400}})


def test_bbox() -> None:
    assert parse_bbox("1,2,3,4") == BBox(1, 2, 3, 4)
    with pytest.raises(ValueError):
        parse_bbox("1,2,3")
    with pytest.raises(ValueError):
        BBox(5, 0, 1, 1)
    tiles = BBox(0, 0, 0.025, 0.01).tiles(0.01)
    assert len(tiles) == 3 and tiles[-1].north == 0.025

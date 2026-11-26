"""PARSER FIXTURES. Hand-written payloads shaped like the documented API responses, used only to
test parsing and client logic. They are not API output, not coverage and never a report input:
the ids, positions and users here are made up for the tests."""
from __future__ import annotations

from typing import Any

MAPILLARY_PAGE: dict[str, Any] = {"data": [
    {"id": "1000000000000001", "geometry": {"type": "Point", "coordinates": [80.2101, 13.085]}, "captured_at": 1609459200000,
     "sequence": "seq-a", "creator": {"id": "11", "username": "test_user"}, "compass_angle": 90.5, "is_pano": False},
    {"id": "1000000000000002", "geometry": {"type": "Point", "coordinates": [80.2102, 13.0851]}, "captured_at": 1609459260000, "sequence": "seq-a"},
    {"id": "1000000000000003", "geometry": None},  # malformed: skipped
]}
MAPILLARY_AUTH_ERROR: dict[str, Any] = {"error": {"message": "Invalid OAuth access token.", "type": "OAuthException", "code": 190}}
MAPILLARY_BIG_BOX_ERROR: dict[str, Any] = {"error": {"message": "Please reduce the amount of data you're asking for, then retry your request", "type": "OAuthException", "code": 1}}
KARTAVIEW_PAGE_1: dict[str, Any] = {"status": {"apiCode": 600, "httpCode": 200}, "result": {"hasMoreData": True, "data": [
    {"id": "5001", "sequenceId": "77", "lat": "13.0850", "lng": "80.2101", "shotDate": "2020-02-03 04:05:06", "heading": "180", "username": "kv_test"},
    {"id": "5002", "sequenceId": "77", "lat": "13.0851", "lng": "80.2102", "shotDate": "2020-02-03 04:05:08"}]}}
KARTAVIEW_PAGE_2: dict[str, Any] = {"status": {"apiCode": 600, "httpCode": 200}, "result": {"hasMoreData": False, "data": [
    {"id": "5002", "sequenceId": "77", "lat": "13.0851", "lng": "80.2102", "shotDate": "2020-02-03 04:05:08"},
    {"id": "5003", "lat": "x", "lng": "y"}]}}

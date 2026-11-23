from __future__ import annotations

import sys
from pathlib import Path

import pytest

GEO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(GEO))
FIXTURES = Path(__file__).parent / "fixtures"
GODOT = GEO.parents[1]
REPO = GODOT.parent
TODAY = REPO / "chennai-open-world" / "apps" / "game" / "public" / "world"
WORLD = GODOT / "world"


@pytest.fixture(scope="session")
def small_features():
    from chennai_geo.osm_parse import parse_osm

    return parse_osm(FIXTURES / "small.osm", timestamp="2026-11-23T00:00:00Z")

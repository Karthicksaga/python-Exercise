"""The committed world's format 2.3 files (G-221…G-226): every tile's fusion.bin decodes, ids and
provenance are sound, the report matches the files, and no dataset's buildings are present
without its credit line (world.json, ATTRIBUTION.md, assets/LICENSES.md, the About page)."""
import json
import re
from collections import Counter
from pathlib import Path

import pytest

from chennai_geo import fusion_codec
from chennai_geo.fusion_multi import FUSION_SOURCES
from chennai_geo.fusion_world import CREDITS, FUSION_FILE
from chennai_geo.regions import TILE_CHUNKS, Grid

GODOT = Path(__file__).resolve().parents[3]
WORLD = GODOT / "world"
WJ = json.loads((WORLD / "world.json").read_text())
pytestmark = pytest.mark.skipif("fusion" not in WJ, reason="world without fusion.bin")


def _grid() -> Grid:
    g = WJ["grid"]
    return Grid(float(g["minX"]), float(g["minZ"]), int(g["cols"]), int(g["rows"]))


def _tiles() -> dict[tuple[int, int], fusion_codec.FusionTile]:
    g = _grid()
    out = {}
    for tc, tr, *_ in WJ["tiles"]:
        out[(tc, tr)] = fusion_codec.decode((WORLD / "tiles" / f"{tc}_{tr}" / FUSION_FILE).read_bytes(), g.centre)
    return out


TILES = _tiles() if "fusion" in WJ else {}


def test_world_json_declares_format_2_3() -> None:
    assert WJ["format"] == 2 and WJ["minor"] >= fusion_codec.MINOR
    f = WJ["fusion"]
    assert f["file"] == FUSION_FILE and f["sources"] == FUSION_SOURCES
    assert WJ["datasets"][6] == "microsoft:mlbuildings" and WJ["datasets"][:6] == ["osm:way", "osm:relation", "osm:node", "overture:buildings", "google:openbuildings", "derived"]


def test_ids_are_new_contiguous_and_in_their_own_tile() -> None:
    nxt = fusion_codec.FIRST_ID
    order = sorted(TILES, key=lambda k: (k[1], k[0]))
    for key in order:
        for c in TILES[key].chunks:
            assert c.first_id == nxt, (key, c.col, c.row)
            assert (c.col // TILE_CHUNKS, c.row // TILE_CHUNKS) == key
            nxt += len(c.buildings)
    assert nxt - fusion_codec.FIRST_ID > 0


def test_provenance_and_heights_are_labelled() -> None:
    by_source: Counter[str] = Counter()
    for t in TILES.values():
        for c in t.chunks:
            last: dict[int, int] = {}
            for b in c.buildings:
                assert b.source in (1, 2, 3)  # never "osm": OSM buildings live in chunks.bin
                assert b.height_from in ("estimated", "overture", "microsoft"), b.height_from  # never OSM's height/levels
                assert b.index >= last.get(b.source, 0)  # sorted by source row within a chunk
                last[b.source] = b.index
                assert len(b.outline) >= 3
                by_source[FUSION_SOURCES[b.source]] += 1
        for h in t.heights:
            assert h.height_from in ("overture", "microsoft") and not fusion_codec.FIRST_ID <= h.building_id < fusion_codec.FIRST_ID + 2**24  # an OSM id
    report = (WORLD / "FUSION.md").read_text()
    row = re.search(r"^\| all \| ([\d,]+) \| ([\d,]+) \| ([\d,]+) \| ([\d,]+) \|", report, re.M)
    assert row is not None
    assert [int(x.replace(",", "")) for x in row.groups()[1:]] == [by_source["overture"], by_source["google"], by_source["microsoft"]]


def test_squares_with_only_added_buildings_are_listed() -> None:
    known = set()
    for tc, tr, *_ in WJ["tiles"]:
        for c in json.loads((WORLD / "tiles" / f"{tc}_{tr}" / "tile.json").read_text())["chunks"]:
            known.add((c[0], c[1]))
    only = sorted((c.col, c.row, c.ring) for t in TILES.values() for c in t.chunks if (c.col, c.row) not in known)
    assert sorted(tuple(x) for x in WJ["fusion"]["cells"]) == only


def test_no_dataset_without_its_credit_line() -> None:
    present = {FUSION_SOURCES[b.source] for t in TILES.values() for c in t.chunks for b in c.buildings} | {"osm"}
    present |= {FUSION_SOURCES[h.source] for t in TILES.values() for h in t.heights}
    assert set(WJ["fusion"]["present"]) == present
    attribution = (WORLD / "ATTRIBUTION.md").read_text()
    licences = (GODOT / "assets" / "LICENSES.md").read_text()
    title = (GODOT / "src" / "ui" / "title_menu" / "title_menu.gd").read_text()
    for s in present:
        assert CREDITS[s] in WJ["fusion"]["credits"], s
        if s != "osm":
            assert CREDITS[s] in attribution, s
            assert CREDITS[s] in licences, s
    assert "others" in title and "Buildings where OpenStreetMap has none" in title  # the About page lists world.json's credits

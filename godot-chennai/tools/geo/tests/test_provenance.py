"""Provenance is never dropped: every building, area and road keeps its source through build,
write, read and fusion."""
from pathlib import Path

from chennai_geo.fusion import ExternalBuilding, fuse
from chennai_geo.regions import world_grid
from chennai_geo.world import build_world
from chennai_geo.writer import read_world_v2, write_world_v2
from test_parse_and_build import BOX


def test_sources_survive_write_and_read(small_features, tmp_path: Path) -> None:
    w = build_world(small_features, world_grid(), [BOX], 0)
    want_b = {(b.source.dataset, b.source.id) for c in w.chunks.values() for b in c.buildings}
    want_a = {(a.source.dataset, a.source.id) for c in w.chunks.values() for a in c.areas}
    want_r = {(r.source.dataset, r.source.id) for r in w.roads}
    write_world_v2(w, tmp_path / "w")
    back = read_world_v2(tmp_path / "w")
    got_b = {(b.source.dataset, b.source.id) for t in back["tiles"] for c in t["chunks"] for b in c.buildings}
    got_a = {(a.source.dataset, a.source.id) for t in back["tiles"] for c in t["chunks"] for a in c.areas}
    got_r = {(p.road.source.dataset, p.road.source.id) for t in back["tiles"] for p in t["roads"]}
    assert want_b == got_b and want_a == got_a and want_r == got_r
    assert all(i > 0 for _, i in got_b | got_a | got_r)


def test_fused_ids_are_kept_in_merged(small_features) -> None:
    w = build_world(small_features, world_grid(), [BOX], 0)
    blds = [b for c in w.chunks.values() for b in c.buildings]
    way = next(b for b in blds if b.id == 100)
    ll = [(80.2101 + 0.00002, 13.085 + 0.00002), (80.2102826, 13.085 + 0.00002), (80.2102826, 13.0851329), (80.2101 + 0.00002, 13.0851329)]
    res = fuse(blds, [ExternalBuilding("08b2a100d2c4bfff0200a1f5a1f3a3c2", ll, height=20.0)])
    fused = next(b for b in res.buildings if b.id == 100)
    assert fused.source == way.source and len(fused.merged) == 1 and res.external_ids[fused.merged[0].id] == "08b2a100d2c4bfff0200a1f5a1f3a3c2"
    assert way.merged == []  # inputs untouched

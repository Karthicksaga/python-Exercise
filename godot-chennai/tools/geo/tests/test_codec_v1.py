"""The format-1 port reads today's committed world and writes it back byte for byte."""
import json

import pytest
from conftest import TODAY

from chennai_geo import codec_v1
from chennai_geo.geometry import Bounds

pytestmark = pytest.mark.skipif(not (TODAY / "index.json").exists(), reason="today's world files are not in this checkout")


def _bounds(index):
    b = index["bounds"]
    return Bounds(b["minX"], b["maxX"], b["minZ"], b["maxZ"])


def test_every_chunk_round_trips_byte_identical() -> None:
    index = json.loads((TODAY / "index.json").read_text())
    b = _bounds(index)
    files = sorted((TODAY / "c").glob("*.bin"))
    assert len(files) == len([c for c in index["chunks"] if c[2] > 0])
    for f in files:
        raw = f.read_bytes()
        c = codec_v1.decode_chunk(raw, b, index["chunkSize"])
        assert codec_v1.encode_chunk(c["col"], c["row"], c["buildings"], c["trees"], c["areas"], b, index["chunkSize"]) == raw, f.name


def test_roads_round_trip_byte_identical() -> None:
    index = json.loads((TODAY / "index.json").read_text())
    raw = (TODAY / "roads.bin").read_bytes()
    roads = codec_v1.decode_roads(raw, index["roadNames"])
    data, names = codec_v1.encode_roads(roads)
    assert data == raw and names == index["roadNames"]


def test_format_version_is_checked() -> None:
    index = json.loads((TODAY / "index.json").read_text())
    raw = bytearray(next((TODAY / "c").glob("*.bin")).read_bytes())
    raw[4] = 2
    with pytest.raises(ValueError, match="format 2"):
        codec_v1.decode_chunk(bytes(raw), _bounds(index), 250)

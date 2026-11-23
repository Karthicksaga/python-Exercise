"""Helpers pinned to the JavaScript results (values printed by node from buildWorldMap.ts's hash)."""
import math

from chennai_geo.util import hash01, js_round, tag_number

JS_HASH = [
    (0, 0, 0.0), (1, 0, 0.5266567736398429), (651861526, 0, 0.27290025539696217), (651861526, 7, 0.6438783810008317),
    (1548155931, 3, 0.2290277003776282), (15481559372, 3, 0.031247392296791077), (12345, 521, 0.7016357476823032),
    (-5, 2, 0.8950829859822989), (4294967297, 1, 0.9197099530138075),
]


def test_hash_matches_javascript() -> None:
    for id_, salt, want in JS_HASH:
        assert hash01(id_, salt) == want, (id_, salt)


def test_js_round_halves_go_up() -> None:
    assert [js_round(v) for v in (2.5, -2.5, 0.5, -0.5)] == [3, -2, 1, 0]


def test_tag_number() -> None:
    assert tag_number("7.5 m") == 7.5
    assert tag_number("3;2") == 3
    assert math.isnan(tag_number(None)) and math.isnan(tag_number("yes"))

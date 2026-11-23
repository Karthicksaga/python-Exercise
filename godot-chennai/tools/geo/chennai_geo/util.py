"""Small helpers that must behave exactly like their JavaScript originals."""
from __future__ import annotations

import math
import re

_NUMBER = re.compile(r"-?\d+(\.\d+)?")


def js_round(v: float) -> float:
    """JavaScript `Math.round`: halves go towards +infinity (Python's `round` goes to even)."""
    return math.floor(v + 0.5)


def round2(v: float) -> float:
    """`Math.round(v * 100) / 100` from the TS builder (centimetres)."""
    return js_round(v * 100) / 100


def round1(v: float) -> float:
    return js_round(v * 10) / 10


def tag_number(value: str | None) -> float:
    """The first number in a tag value ("7", "7.5 m", "3;2"), or NaN (port of `tagNumber`)."""
    m = _NUMBER.search(value or "")
    return float(m.group(0)) if m else math.nan


def _imul(a: int, b: int) -> int:
    return (a * b) & 0xFFFFFFFF


def hash01(id_: int, salt: int = 0) -> float:
    """Stable pseudo-random number in [0, 1) from an id: a port of `hash()` in buildWorldMap.ts.

    JS applies `^` to 32-bit signed ints: `id ^ (salt * 0x9e3779b9)` first converts both sides
    with ToInt32 (modulo 2^32), so the same is done here.
    """
    a = int(id_) & 0xFFFFFFFF if abs(id_) < 2**53 else _to_uint32_float(id_)
    b = _to_uint32_float(salt * 0x9E3779B9)
    t = (a ^ b) & 0xFFFFFFFF
    t = _imul(t ^ (t >> 16), 0x21F0AAAD)
    t = _imul(t ^ (t >> 15), 0x735A2D97)
    return ((t ^ (t >> 15)) & 0xFFFFFFFF) / 4294967296


def _to_uint32_float(v: float) -> int:
    """ECMAScript ToUint32 of a double (salt * 0x9e3779b9 can exceed 2^53 and lose precision)."""
    if not math.isfinite(v):
        return 0
    f = float(v)  # JS multiplies in doubles
    i = math.trunc(f)
    return int(i) % 4294967296

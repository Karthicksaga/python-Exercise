"""Little-endian byte writer/reader (the `Writer`/`Reader` of codec.ts)."""
from __future__ import annotations

import struct


class Writer:
    def __init__(self) -> None:
        self.buf = bytearray()

    def u8(self, v: int) -> None:
        self.buf += struct.pack("<B", v)

    def i8(self, v: int) -> None:
        self.buf += struct.pack("<b", v)

    def u16(self, v: int) -> None:
        self.buf += struct.pack("<H", v)

    def i16(self, v: int) -> None:
        if not -32768 <= v <= 32767:
            raise OverflowError(f"Value {v} does not fit 16 bits.")
        self.buf += struct.pack("<h", v)

    def u32(self, v: int) -> None:
        self.buf += struct.pack("<I", v)

    def i32(self, v: int) -> None:
        self.buf += struct.pack("<i", v)

    def u64(self, v: int) -> None:
        self.buf += struct.pack("<Q", v)

    def f32(self, v: float) -> None:
        self.buf += struct.pack("<f", v)

    def f64(self, v: float) -> None:
        self.buf += struct.pack("<d", v)

    def raw(self, b: bytes) -> None:
        self.buf += b

    def done(self) -> bytes:
        return bytes(self.buf)


class Reader:
    def __init__(self, data: bytes) -> None:
        self.d = memoryview(data)
        self.at = 0

    def _take(self, fmt: str, n: int) -> int | float:
        v = struct.unpack_from(fmt, self.d, self.at)[0]
        self.at += n
        return v  # type: ignore[no-any-return]

    def u8(self) -> int:
        return int(self._take("<B", 1))

    def i8(self) -> int:
        return int(self._take("<b", 1))

    def u16(self) -> int:
        return int(self._take("<H", 2))

    def i16(self) -> int:
        return int(self._take("<h", 2))

    def u32(self) -> int:
        return int(self._take("<I", 4))

    def i32(self) -> int:
        return int(self._take("<i", 4))

    def u64(self) -> int:
        return int(self._take("<Q", 8))

    def f32(self) -> float:
        return float(self._take("<f", 4))

    def f64(self) -> float:
        return float(self._take("<d", 8))

    def raw(self, n: int) -> bytes:
        b = bytes(self.d[self.at : self.at + n])
        self.at += n
        return b

    @property
    def left(self) -> int:
        return len(self.d) - self.at

#!/usr/bin/env python3
"""Renders the Captain app's ride-request ringtone (res/raw/ride_request.wav).

The same FM "chime" voice and motif as startOfferAlert() in shared/sounds.ts, played three times,
so a request that arrives with the app closed sounds like one that arrives with it open.
Android plays a notification channel's sound once, so the repeat is in the file (about 4 s).
Run: python3 scripts/ride-request-sound.py
"""
import math
import struct
import wave
from pathlib import Path

RATE = 22050
E5, GS5, B5, E6 = 659.25, 830.61, 987.77, 1318.51
CALL = [(E5, 0, 0.42, 1), (GS5, 0.12, 0.42, 1), (B5, 0.24, 0.42, 1), (E6, 0.38, 0.9, 1.1)]
REPEATS, GAP = 3, 1.35


def envelope(t, duration, level):
    """Quick rise, settle to 35 % by 90 ms, then exponential decay to silence at the end."""
    if t < 0 or t > duration:
        return 0.0
    if t < 0.006:
        return level * t / 0.006
    if t < 0.09:
        return level * (0.35 ** ((t - 0.006) / 0.084))
    return level * 0.35 * (0.0001 / 0.35) ** ((t - 0.09) / max(duration - 0.09, 1e-3))


def depth(t, f, duration):
    """Modulator depth: bright "tine" for ~80 ms, then a pure tone."""
    if t < 0.08:
        return f * 1.6 * (0.025 ** (t / 0.08))
    return f * 0.04 * (0.0001 / (f * 0.04)) ** ((t - 0.08) / max(duration - 0.08, 1e-3))


def render():
    notes = [(f, start + r * GAP, d, lvl) for r in range(REPEATS) for f, start, d, lvl in CALL]
    length = int(RATE * (max(s + d for _, s, d, _ in notes) + 0.2))
    out = [0.0] * length
    for f, start, duration, level in notes:
        first = int(start * RATE)
        for i in range(int((duration + 0.02) * RATE)):
            t = i / RATE
            phase = 2 * math.pi * f * t + depth(t, f, duration) / (3 * f) * math.sin(2 * math.pi * 3 * f * t)
            if first + i < length:
                out[first + i] += 0.2 * envelope(t, duration, level) * math.sin(phase)
    # One-pole low-pass (~5.2 kHz) and a soft limiter, like the in-app filter and compressor.
    alpha = 1 - math.exp(-2 * math.pi * 5200 / RATE)
    y, peak = 0.0, 1e-9
    for i, x in enumerate(out):
        y += alpha * (x - y)
        out[i] = math.tanh(y * 2.2) / math.tanh(2.2)
        peak = max(peak, abs(out[i]))
    scale = 0.89 / peak
    return [int(max(-1, min(1, v * scale)) * 32767) for v in out]


def main():
    target = Path(__file__).resolve().parents[1] / "mobile/captain/android/app/src/main/res/raw/ride_request.wav"
    samples = render()
    with wave.open(str(target), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(struct.pack(f"<{len(samples)}h", *samples))
    print(f"wrote {target} ({len(samples) / RATE:.1f} s)")


if __name__ == "__main__":
    main()

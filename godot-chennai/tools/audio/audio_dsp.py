"""Small DSP helpers for the recording pipeline (decision G-85): decode with ffmpeg, measure an
engine's firing frequency over time, cut loops on whole firing periods with a crossfaded wrap,
and match loudness. numpy only."""
import subprocess

import numpy as np

RATE = 22050


def decode(path, rate=RATE):
    """Mono float32 samples of any file ffmpeg reads (opus, ogg, wav, mp3)."""
    raw = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", path, "-ac", "1", "-ar", str(rate),
                          "-f", "f32le", "-"], check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def lowpass(x, hz, rate=RATE):
    """Brick-wall low-pass by FFT (for pitch analysis only)."""
    spec = np.fft.rfft(np.asarray(x, dtype=np.float64))
    spec[int(len(spec) * hz / (rate / 2)):] = 0
    return np.fft.irfft(spec, len(x))


def firing_hz(x, lo, hi, rate=RATE):
    """The strongest periodicity between lo and hi Hz by autocorrelation (the engine's firing note)."""
    x = x - x.mean()
    n = len(x)
    spec = np.fft.rfft(x, 2 * n)
    ac = np.fft.irfft(spec * np.conj(spec))[:n]
    lags = np.arange(int(rate / hi), min(n - 1, int(rate / lo)) + 1)
    if len(lags) == 0:
        return 0.0
    best = lags[np.argmax(ac[lags])]
    # Parabolic refinement.
    if 1 <= best < n - 1:
        a, b, c = ac[best - 1], ac[best], ac[best + 1]
        d = (a - c) / (2 * (a - 2 * b + c)) if (a - 2 * b + c) != 0 else 0.0
        return rate / (best + d)
    return rate / best


def track(x, lo, hi, window=0.4, hop=0.2, rate=RATE):
    """[(time, hz, rms)] through a recording."""
    out = []
    w, h = int(window * rate), int(hop * rate)
    for s in range(0, max(1, len(x) - w), h):
        seg = x[s:s + w]
        out.append((s / rate, firing_hz(seg, lo, hi, rate), float(np.sqrt(np.mean(seg ** 2)))))
    return out


def loop(x, start, length, hz, rate=RATE, fade=0.03):
    """A loop of a whole number of firing periods from `start` s, about `length` s long, its first
    `fade` s crossfaded (equal power) with what follows the end so the wrap is seamless.
    Returns (samples, exact_hz)."""
    periods = max(2, round(length * hz))
    n = int(round(periods * rate / hz))
    f = min(n // 4, int(fade * rate))
    s = int(start * rate)
    seg = x[s:s + n + f].astype(np.float64)
    if len(seg) < n + f:
        raise ValueError("segment runs past the end of the recording")
    out = seg[:n].copy()
    t = np.arange(f) / f
    out[:f] = seg[:f] * np.sin(t * np.pi / 2) + seg[n:n + f] * np.cos(t * np.pi / 2)
    return out.astype(np.float32), periods * rate / n


def one_shot(x, start, length, rate=RATE, fade_in=0.005, fade_out=0.05):
    s = int(start * rate)
    out = x[s:s + int(length * rate)].astype(np.float64).copy()
    a, b = int(fade_in * rate), int(fade_out * rate)
    if a:
        out[:a] *= np.linspace(0, 1, a)
    if b:
        out[-b:] *= np.linspace(1, 0, b)
    return out.astype(np.float32)


def rms(x):
    return float(np.sqrt(np.mean(np.asarray(x, dtype=np.float64) ** 2))) if len(x) else 0.0


def match_rms(x, target, peak=0.89):
    """Scale to the target RMS, but never past `peak` (-1 dBFS)."""
    r = rms(x)
    if r <= 0:
        return x
    g = min(target / r, peak / max(1e-9, float(np.max(np.abs(x)))))
    return (x * g).astype(np.float32)


def write_wav(path, x, rate=RATE):
    import wave
    pcm = np.clip(np.round(np.asarray(x) * 32767), -32768, 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.tobytes())


def write_ogg(path, x, rate=RATE, quality=3):
    pcm = np.asarray(x, dtype="<f4").tobytes()
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "f32le", "-ar", str(rate), "-ac", "1", "-i", "-",
                    "-c:a", "libvorbis", "-q:a", str(quality), path], input=pcm, check=True)

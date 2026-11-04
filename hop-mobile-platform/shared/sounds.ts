// Hop's notification sounds (Nov 2026). Every sound uses one voice, a soft kalimba-like chime
// made with FM synthesis: a bright attack that settles into a warm tone, through a gentle
// low-pass filter. Each event has its own short motif in E major, so riders and captains can
// tell them apart without looking. One shared audio context, smooth envelopes and a compressor
// prevent clicks and clipping. Apps in the background stay silent; vibration backs up the
// alerts that matter most.
type Note = [frequency: number, start: number, duration: number, level?: number];
let context: AudioContext | undefined;

const E5 = 659.25, Gs5 = 830.61, A5 = 880, B5 = 987.77, Cs6 = 1108.73, E6 = 1318.51;
const B4 = 493.88, E4 = 329.63, Gs4 = 415.3, Fs5 = 739.99;

function audioContext() {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return;
  if (!context || context.state === "closed") context = new AudioContextClass();
  return context;
}

// Unlock audio during a real gesture, before an asynchronous ride offer arrives.
function unlock() {
  try {
    const ctx = audioContext();
    if (ctx?.state === "suspended") void ctx.resume().catch(() => {});
  } catch { /* Sound remains optional when the browser denies audio. */ }
}
if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", unlock, { passive: true });
  document.addEventListener("keydown", unlock, { passive: true });
}

function play(notes: Note[], volume = 0.16) {
  try {
    const ctx = audioContext();
    if (!ctx || document.hidden) return;
    if (ctx.state === "suspended") {
      void ctx.resume().then(() => { if (ctx.state === "running") play(notes, volume); }).catch(() => {});
      return;
    }
    if (ctx.state !== "running") return;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 12;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.18;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 5200;
    tone.Q.value = 0.4;
    tone.connect(compressor);
    compressor.connect(ctx.destination);
    let remaining = notes.length * 2;
    for (const [frequency, start, duration, level = 1] of notes) {
      const time = ctx.currentTime + 0.015 + start;
      const end = time + duration;
      // Carrier: the note itself, with a quick rise and a long natural decay.
      const carrier = ctx.createOscillator();
      const amp = ctx.createGain();
      carrier.type = "sine";
      carrier.frequency.value = frequency;
      amp.gain.setValueAtTime(0, time);
      amp.gain.linearRampToValueAtTime(volume * level, time + 0.006);
      amp.gain.exponentialRampToValueAtTime(volume * level * 0.35, time + 0.09);
      amp.gain.exponentialRampToValueAtTime(0.0001, end);
      amp.gain.linearRampToValueAtTime(0, end + 0.02);
      // Modulator at 3× the note: strong for the first ~80 ms (the "tine" of a kalimba), then
      // fading so the tail is a pure, warm tone.
      const modulator = ctx.createOscillator();
      const depth = ctx.createGain();
      modulator.type = "sine";
      modulator.frequency.value = frequency * 3;
      depth.gain.setValueAtTime(frequency * 1.6, time);
      depth.gain.exponentialRampToValueAtTime(frequency * 0.04, time + 0.08);
      depth.gain.exponentialRampToValueAtTime(0.0001, end);
      modulator.connect(depth);
      depth.connect(carrier.frequency);
      carrier.connect(amp);
      amp.connect(tone);
      for (const oscillator of [carrier, modulator]) {
        oscillator.onended = () => {
          oscillator.disconnect();
          if (--remaining === 0) {
            amp.disconnect();
            depth.disconnect();
            tone.disconnect();
            compressor.disconnect();
          }
        };
        oscillator.start(time);
        oscillator.stop(end + 0.04);
      }
    }
  } catch { /* Notifications still display if audio is unavailable. */ }
}

const vibrate = (pattern: number[]) => {
  try { navigator.vibrate?.(pattern); } catch { /* not supported */ }
};

// ── Captain ───────────────────────────────────────────────────────────────────
// A new ride request: a rising four-note call that repeats until the captain accepts or
// declines, the request goes away, or 45 seconds pass. Loud enough for a phone in a mount.
const OFFER_CALL: Note[] = [[E5, 0, 0.42], [Gs5, 0.12, 0.42], [B5, 0.24, 0.42], [E6, 0.38, 0.9, 1.1]];
let offerTimer: ReturnType<typeof setInterval> | undefined;
let offerStop: ReturnType<typeof setTimeout> | undefined;
export function startOfferAlert() {
  if (offerTimer) return;
  const call = () => {
    play(OFFER_CALL, 0.2);
    vibrate([180, 90, 180, 90, 320]);
  };
  call();
  offerTimer = setInterval(call, 2600);
  offerStop = setTimeout(stopOfferAlert, 45_000);
}
export function stopOfferAlert() {
  clearInterval(offerTimer);
  clearTimeout(offerStop);
  offerTimer = offerStop = undefined;
}
/** Kept for callers that only need one call, such as a single preview. */
export const driverAlertSound = () => {
  play(OFFER_CALL, 0.2);
  vibrate([180, 90, 180, 90, 320]);
};
export const acceptRideSound = () => play([[B5, 0, 0.35], [E6, 0.11, 0.7]], 0.15);
export const goOnlineSound = () => play([[E5, 0, 0.35], [B5, 0.12, 0.6]], 0.13);
export const goOfflineSound = () => play([[B5, 0, 0.35], [E5, 0.13, 0.6]], 0.11);

// ── Rider ─────────────────────────────────────────────────────────────────────
// While looking for a captain: a very soft two-note pulse every 4.5 s.
let searchTimer: ReturnType<typeof setInterval> | undefined;
export function startSearchingSound() {
  if (searchTimer) return;
  const pulse = () => play([[E5, 0, 0.32, 0.8], [Gs5, 0.2, 0.42, 0.7]], 0.07);
  pulse();
  searchTimer = setInterval(pulse, 4500);
}
export function stopSearchingSound() {
  clearInterval(searchTimer);
  searchTimer = undefined;
}
/** A captain accepted: a warm rising major chord, the "you're sorted" moment. */
export const captainFoundSound = () => {
  play([[E5, 0, 0.5], [Gs5, 0.09, 0.55], [B5, 0.18, 0.6], [E6, 0.3, 0.95, 0.9]], 0.15);
  vibrate([90]);
};
/** The captain is at the pickup: a two-tone doorbell, played twice, for riders waiting indoors. */
export const captainArrivedSound = () => {
  play([[B5, 0, 0.55], [Gs5, 0.32, 0.8], [B5, 0.95, 0.55], [Gs5, 1.27, 0.95]], 0.17);
  vibrate([160, 90, 160, 400, 160, 90, 160]);
};
export const tripStartedSound = () => play([[Gs5, 0, 0.35, 0.8], [Cs6, 0.12, 0.6, 0.8]], 0.1);

// ── Both ──────────────────────────────────────────────────────────────────────
/** Trip finished or payment settled: a short resolving cadence. */
export const tripCompleteSound = () => play([[Fs5, 0, 0.4], [A5, 0.12, 0.45], [E6, 0.26, 1.0]], 0.14);
/** A ride was cancelled by the other side or expired: gentle and falling, never an alarm. */
export const rideCancelledSound = () => {
  play([[B4, 0, 0.45], [Gs4, 0.16, 0.5], [E4, 0.34, 0.8]], 0.13);
  vibrate([220]);
};
/** An in-app notification arrived. */
export const notificationSound = () => play([[B5, 0, 0.3, 0.9], [E6, 0.1, 0.55, 0.8]], 0.11);

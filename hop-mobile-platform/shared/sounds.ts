// Short, layered notification chimes. One shared context avoids accumulating
// audio devices; smooth envelopes and a compressor prevent clicks and clipping.
type Note = [frequency: number, start: number, duration: number];
let context: AudioContext | undefined;
let lastAlert = -Infinity;

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
    compressor.connect(ctx.destination);
    let remaining = notes.length * 3;
    for (const [frequency, start, duration] of notes) {
      // A rounded fundamental with quiet upper partials adds clarity without
      // the harsh edge of a triangle/square wave or a repeated alarm pattern.
      for (const [ratio, strength, decay] of [[1, 1, 1], [2, 0.22, 0.65], [3, 0.06, 0.4]]) {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        const time = ctx.currentTime + 0.015 + start;
        const end = time + duration * decay;
        oscillator.type = "sine";
        oscillator.frequency.value = frequency * ratio;
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(volume * strength, time + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);
        gain.gain.linearRampToValueAtTime(0, end + 0.025);
        oscillator.connect(gain);
        gain.connect(compressor);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
          if (--remaining === 0) compressor.disconnect();
        };
        oscillator.start(time);
        oscillator.stop(end + 0.04);
      }
    }
  } catch { /* Notifications still display if audio is unavailable. */ }
}

// A single clear three-note invitation, with no repeating "ting ting" loop.
export const driverAlertSound = () => {
  const now = performance.now();
  if (now - lastAlert < 1200) return;
  lastAlert = now;
  play([[659.25, 0, 0.55], [880, 0.16, 0.55], [987.77, 0.34, 0.75]], 0.18);
  navigator.vibrate?.([120, 80, 180]);
};
export const goOnlineSound = () => play([[523.25, 0, 0.4], [783.99, 0.16, 0.55]], 0.12);
export const goOfflineSound = () => play([[659.25, 0, 0.4], [440, 0.18, 0.55]], 0.1);
export const acceptRideSound = () => play([[783.99, 0, 0.4], [1046.5, 0.18, 0.65]], 0.14);

export const notificationSound = () => play([[659.25, 0, 0.4], [880, 0.18, 0.55]], 0.12);
let searchTimer: ReturnType<typeof setInterval> | undefined;
export function startSearchingSound() {
  if (searchTimer) return;
  const pulse = () => play([[523.25, 0, 0.35], [659.25, 0.22, 0.45]], 0.09);
  pulse();
  searchTimer = setInterval(pulse, 5000);
}
export function stopSearchingSound() {
  clearInterval(searchTimer);
  searchTimer = undefined;
}

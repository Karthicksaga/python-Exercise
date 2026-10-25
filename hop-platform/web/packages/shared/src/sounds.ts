// Short synthesized cues (no audio files). Each is distinct so drivers know what happened without looking.
type Note = [freq: number, start: number, dur: number, type?: OscillatorType];

function play(notes: Note[], vol = 0.12) {
  try {
    const ctx = new AudioContext();
    for (const [f, s, d, type] of notes) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type ?? "sine";
      o.frequency.value = f;
      o.connect(g);
      g.connect(ctx.destination);
      const t = ctx.currentTime + s;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.start(t);
      o.stop(t + d + 0.05);
    }
    setTimeout(() => void ctx.close(), 2500);
  } catch {
    /* audio is blocked until the user interacts with the page */
  }
}

// Driver: urgent two-tone "taxi meter" ping, repeated twice so it cuts through road noise.
export const driverAlert = () => {
  play([[988, 0, 0.14, "triangle"], [1319, 0.15, 0.2, "triangle"], [988, 0.55, 0.14, "triangle"], [1319, 0.7, 0.28, "triangle"]], 0.18);
  navigator.vibrate?.([200, 100, 200, 100, 300]);
};
export const goOnlineSound = () => play([[523, 0, 0.12], [659, 0.1, 0.12], [784, 0.2, 0.25]]);
export const goOfflineSound = () => play([[784, 0, 0.12], [659, 0.1, 0.12], [440, 0.2, 0.3]]);
export const acceptSound = () => play([[659, 0, 0.1], [880, 0.09, 0.1], [1175, 0.18, 0.3]]);

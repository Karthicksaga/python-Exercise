/**
 * All sound is synthesised with Web Audio: no sound files to download or license. Browsers
 * only allow sound after the player has touched the screen, so `unlock()` is called from the
 * first touch and everything is silent (and harmless) before that.
 */

type Tone = { frequency: number; duration: number; type?: OscillatorType; volume?: number; delay?: number; slideTo?: number };

export class Sound {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private engine: { oscillator: OscillatorNode; rumble: OscillatorNode; gain: GainNode } | null = null;
  private muted = false;

  /** Start the audio system. Safe to call many times; must be called from a touch or key press. */
  unlock(): void {
    if (this.context) {
      if (this.context.state === "suspended") void this.context.resume();
      return;
    }
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return; // no audio on this device: play silently
    try {
      this.context = new Context();
    } catch {
      return;
    }
    this.master = this.context.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.context.destination);
    // One second of white noise, reused for gunshots and impacts.
    this.noise = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  /** Silence everything that is sustained (when the game pauses). */
  suspend(): void {
    this.setEngine(null);
  }

  private tone(tone: Tone): void {
    const { context, master } = this;
    if (!context || !master) return;
    const start = context.currentTime + (tone.delay ?? 0);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = tone.type ?? "sine";
    oscillator.frequency.setValueAtTime(tone.frequency, start);
    if (tone.slideTo) oscillator.frequency.exponentialRampToValueAtTime(tone.slideTo, start + tone.duration);
    gain.gain.setValueAtTime(tone.volume ?? 0.25, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + tone.duration);
    oscillator.connect(gain).connect(master);
    oscillator.start(start);
    oscillator.stop(start + tone.duration + 0.02);
  }

  private burst(duration: number, volume: number, cutoff: number): void {
    const { context, master, noise } = this;
    if (!context || !master || !noise) return;
    const source = context.createBufferSource();
    source.buffer = noise;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start();
    source.stop(context.currentTime + duration + 0.02);
  }

  /** @param distant quieter and duller, for shots fired by enemies */
  shot(distant = false): void {
    this.burst(distant ? 0.22 : 0.16, distant ? 0.35 : 0.8, distant ? 1400 : 3800);
    this.tone({ frequency: distant ? 110 : 160, slideTo: 45, duration: 0.12, type: "square", volume: distant ? 0.12 : 0.3 });
  }

  punch(): void {
    this.burst(0.08, 0.5, 700);
    this.tone({ frequency: 120, slideTo: 60, duration: 0.09, volume: 0.35 });
  }

  whiff(): void {
    this.burst(0.07, 0.12, 2200);
  }

  hurt(): void {
    this.tone({ frequency: 240, slideTo: 110, duration: 0.22, type: "sawtooth", volume: 0.2 });
  }

  /** Empty pistol. */
  click(): void {
    this.tone({ frequency: 900, duration: 0.03, type: "square", volume: 0.12 });
  }

  /** Objective reached. */
  chime(): void {
    this.tone({ frequency: 660, duration: 0.14, type: "triangle" });
    this.tone({ frequency: 880, duration: 0.2, type: "triangle", delay: 0.12 });
  }

  /** Stage complete. */
  fanfare(): void {
    [523, 659, 784, 1047].forEach((frequency, i) => this.tone({ frequency, duration: 0.24, type: "triangle", delay: i * 0.13, volume: 0.3 }));
  }

  /** Stage failed or player knocked out. */
  fail(): void {
    this.tone({ frequency: 330, slideTo: 150, duration: 0.5, type: "sawtooth", volume: 0.22 });
  }

  door(): void {
    this.burst(0.06, 0.35, 500);
    this.tone({ frequency: 90, duration: 0.08, volume: 0.3 });
  }

  horn(): void {
    this.tone({ frequency: 415, duration: 0.35, type: "square", volume: 0.16 });
    this.tone({ frequency: 520, duration: 0.35, type: "square", volume: 0.12 });
  }

  /**
   * Engine note that rises with speed, or silence with null.
   * @param load 0 (idling) to 1 (top speed)
   */
  setEngine(load: number | null, small = false): void {
    const { context, master } = this;
    if (!context || !master) return;
    if (load === null) {
      if (!this.engine) return;
      const { oscillator, rumble, gain } = this.engine;
      gain.gain.setTargetAtTime(0, context.currentTime, 0.08);
      oscillator.stop(context.currentTime + 0.4);
      rumble.stop(context.currentTime + 0.4);
      this.engine = null;
      return;
    }
    if (!this.engine) {
      const oscillator = context.createOscillator();
      const rumble = context.createOscillator();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      oscillator.type = "sawtooth";
      rumble.type = "square";
      filter.type = "lowpass";
      filter.frequency.value = 520;
      gain.gain.value = 0;
      oscillator.connect(filter);
      rumble.connect(filter);
      filter.connect(gain).connect(master);
      oscillator.start();
      rumble.start();
      this.engine = { oscillator, rumble, gain };
    }
    const base = (small ? 78 : 52) + Math.max(0, Math.min(1, load)) * (small ? 150 : 105);
    const now = context.currentTime;
    this.engine.oscillator.frequency.setTargetAtTime(base, now, 0.08);
    this.engine.rumble.frequency.setTargetAtTime(base / 2, now, 0.08);
    this.engine.gain.gain.setTargetAtTime(0.07 + load * 0.06, now, 0.1);
  }
}

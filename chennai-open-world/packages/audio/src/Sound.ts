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
  private siren: { oscillator: OscillatorNode; wobble: OscillatorNode; gain: GainNode } | null = null;
  private skid: { source: AudioBufferSourceNode; whine: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
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
    this.setSiren(false);
    this.setPoliceSiren(null);
    this.setSkid(null);
  }

  /**
   * Tyre squeal while the vehicle slides, or silence with null (on foot, paused). Filtered
   * noise with a faint high whine; louder and a little higher the harder it slides.
   * @param level 0 (gripping) to 1 (a full drift)
   */
  setSkid(level: number | null): void {
    const { context, master, noise } = this;
    if (!context || !master || !noise) return;
    if (level === null) {
      if (!this.skid) return;
      const { source, whine, gain } = this.skid;
      gain.gain.setTargetAtTime(0, context.currentTime, 0.05);
      source.stop(context.currentTime + 0.3);
      whine.stop(context.currentTime + 0.3);
      this.skid = null;
      return;
    }
    const amount = Math.max(0, Math.min(1, level));
    if (!this.skid) {
      if (amount < 0.05) return; // nothing to hear yet: don't start the nodes
      const source = context.createBufferSource();
      source.buffer = noise;
      source.loop = true;
      const whine = context.createOscillator();
      whine.type = "triangle";
      const whineGain = context.createGain();
      whineGain.gain.value = 0.25;
      const filter = context.createBiquadFilter();
      filter.type = "bandpass";
      filter.Q.value = 6;
      const gain = context.createGain();
      gain.gain.value = 0;
      source.connect(filter);
      whine.connect(whineGain).connect(filter);
      filter.connect(gain).connect(master);
      source.start();
      whine.start();
      this.skid = { source, whine, filter, gain };
    }
    const now = context.currentTime;
    // Quiet below a small slide, so ordinary cornering is silent.
    const loud = amount < 0.15 ? 0 : (amount - 0.15) / 0.85;
    this.skid.filter.frequency.setTargetAtTime(1500 + amount * 700, now, 0.08);
    this.skid.whine.frequency.setTargetAtTime(1500 + amount * 700, now, 0.08);
    this.skid.gain.gain.setTargetAtTime(loud * 0.22, now, loud > 0 ? 0.05 : 0.12);
  }

  /** A short blip as the gearbox changes up: the engine note dips and catches. */
  gearChange(): void {
    this.tone({ frequency: 150, slideTo: 95, duration: 0.09, type: "square", volume: 0.07 });
    this.burst(0.05, 0.12, 900);
  }

  /** A crash: a dull thump, louder for harder hits. @param strength change of speed, m/s */
  crash(strength: number): void {
    const loud = Math.max(0.25, Math.min(1, strength / 8));
    this.burst(0.25, 0.9 * loud, 600);
    this.tone({ frequency: 70, slideTo: 38, duration: 0.25, volume: 0.45 * loud });
    if (strength > 4) this.burst(0.18, 0.3 * loud, 5000); // glass and metal
  }

  /** Two-tone wail of an ambulance siren, on until switched off. */
  setSiren(on: boolean): void {
    const { context, master } = this;
    if (!context || !master) return;
    if (!on) {
      if (!this.siren) return;
      const { oscillator, wobble, gain } = this.siren;
      gain.gain.setTargetAtTime(0, context.currentTime, 0.05);
      oscillator.stop(context.currentTime + 0.3);
      wobble.stop(context.currentTime + 0.3);
      this.siren = null;
      return;
    }
    if (this.siren) return;
    // A slow oscillator sweeps the pitch between about 650 and 1050 Hz.
    const oscillator = context.createOscillator();
    const wobble = context.createOscillator();
    const depth = context.createGain();
    const gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.value = 850;
    wobble.type = "sine";
    wobble.frequency.value = 0.55;
    depth.gain.value = 200;
    wobble.connect(depth).connect(oscillator.frequency);
    gain.gain.value = 0.07;
    oscillator.connect(gain).connect(master);
    oscillator.start();
    wobble.start();
    this.siren = { oscillator, wobble, gain };
  }

  private policeSiren: { oscillator: OscillatorNode; wobble: OscillatorNode; gain: GainNode } | null = null;

  /**
   * A police car's siren somewhere near: a faster wail than the ambulance's, as loud as the car
   * is near. Null switches it off.
   * @param level 0 (barely heard) to 1 (right beside the player)
   */
  setPoliceSiren(level: number | null): void {
    const { context, master } = this;
    if (!context || !master) return;
    if (level === null || level <= 0) {
      if (!this.policeSiren) return;
      const { oscillator, wobble, gain } = this.policeSiren;
      gain.gain.setTargetAtTime(0, context.currentTime, 0.08);
      oscillator.stop(context.currentTime + 0.4);
      wobble.stop(context.currentTime + 0.4);
      this.policeSiren = null;
      return;
    }
    if (!this.policeSiren) {
      // A square-ish wobble flips the pitch quickly between about 700 and 1100 Hz.
      const oscillator = context.createOscillator();
      const wobble = context.createOscillator();
      const depth = context.createGain();
      const gain = context.createGain();
      oscillator.type = "sawtooth";
      oscillator.frequency.value = 900;
      wobble.type = "triangle";
      wobble.frequency.value = 1.6;
      depth.gain.value = 200;
      wobble.connect(depth).connect(oscillator.frequency);
      gain.gain.value = 0;
      oscillator.connect(gain).connect(master);
      oscillator.start();
      wobble.start();
      this.policeSiren = { oscillator, wobble, gain };
    }
    this.policeSiren.gain.gain.setTargetAtTime(0.05 * Math.min(1, level), context.currentTime, 0.1);
  }

  /** Coins for a paid job. */
  cash(): void {
    [1318, 1568].forEach((frequency, i) => this.tone({ frequency, duration: 0.16, type: "square", volume: 0.08, delay: i * 0.08 }));
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

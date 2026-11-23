/**
 * All sound is synthesised with Web Audio: no sound files to download or license. Browsers
 * only allow sound after the player has touched the screen, so `unlock()` is called from the
 * first touch and everything is silent (and harmless) before that.
 *
 * The mix (TD-26): master → compressor → speakers, with four buses under the master so each
 * family can be balanced: vehicles (engines, horns, tyres, sirens, crashes), world (footsteps,
 * fights, guns, doors, trains), ambience (the city's background) and interface (rewards, stage
 * music). What each vehicle sounds like is data in `profiles.ts`; the graphs are in `voices.ts`.
 */
import { honkChance, place, soundKind, stepInterval, type Listener, type VehicleSoundKind } from "./profiles";
import { Ambience, EngineVoice, noiseBuffer, playFootstep, playHorn, playLanding, type AmbienceState, type EngineState } from "./voices";

type Tone = { frequency: number; duration: number; type?: OscillatorType; volume?: number; delay?: number; slideTo?: number };

/** A traffic vehicle near the player, as the game reports it. */
export interface TrafficSound {
  readonly id: number;
  readonly x: number;
  readonly z: number;
  /** m/s. */
  readonly speed: number;
  /** Vehicle kind name ("car", "auto", "bike", "bus"…). */
  readonly kind: string;
}

/** What the sound system is doing, for tests and the debug snapshot. */
export interface SoundState {
  readonly unlocked: boolean;
  readonly muted: boolean;
  /** The player's engine: kind and engine speed, or null on foot. */
  readonly engine: { readonly kind: VehicleSoundKind; readonly rpm: number } | null;
  /** Traffic engines heard now (the nearest few). */
  readonly traffic: ReadonlyArray<{ readonly id: number; readonly kind: VehicleSoundKind }>;
  readonly ambience: readonly string[];
  /** Counts of one-shots so far: horns by kind, footsteps, crows, the koel, distant and traffic honks. */
  readonly played: Readonly<Record<string, number>>;
}

/** Traffic engines heard at once (each is a small graph; phones have little to spare). */
const TRAFFIC_VOICES = 3;
/** Metres within which traffic engines are heard. */
const TRAFFIC_HEARD = 45;
const MASTER = 0.55;

export class Sound {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private vehicles: GainNode | null = null;
  private world: GainNode | null = null;
  private ambienceBus: GainNode | null = null;
  private ui: GainNode | null = null;
  private engine: EngineVoice | null = null;
  private siren: { oscillator: OscillatorNode; wobble: OscillatorNode; gain: GainNode } | null = null;
  private skid: { source: AudioBufferSourceNode; whine: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private muted = false;
  private listener: Listener = { x: 0, z: 0, yaw: 0 };
  private readonly trafficVoices = new Map<number, EngineVoice>();
  /** Seconds each nearby traffic vehicle has stood still (honking gets likelier). */
  private readonly stood = new Map<number, number>();
  private honkWait = 0;
  private ambience: Ambience | null = null;
  private stepClock = 0;
  private stepSide = 1;
  private readonly counts: Record<string, number> = { footstep: 0, trafficHonk: 0 };

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
    const context = this.context;
    // A gentle compressor keeps a busy junction (engines, horns, a siren) from clipping on phone speakers.
    const glue = context.createDynamicsCompressor();
    glue.threshold.value = -16;
    glue.knee.value = 12;
    glue.ratio.value = 4;
    glue.attack.value = 0.005;
    glue.release.value = 0.2;
    glue.connect(context.destination);
    this.master = context.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER;
    this.master.connect(glue);
    const bus = (level: number): GainNode => {
      const gain = context.createGain();
      gain.gain.value = level;
      gain.connect(this.master!);
      return gain;
    };
    this.vehicles = bus(1);
    this.world = bus(0.9);
    this.ambienceBus = bus(0.85);
    this.ui = bus(0.8);
    this.noise = noiseBuffer(context);
    this.ambience = new Ambience(context, this.ambienceBus, this.noise);
  }

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.context) this.master.gain.setTargetAtTime(muted ? 0 : MASTER, this.context.currentTime, 0.03);
  }

  /** Silence everything that is sustained (when the game pauses or a menu opens). */
  suspend(): void {
    this.setEngine(null);
    this.setSiren(false);
    this.setPoliceSiren(null);
    this.setSkid(null);
    this.setTraffic([]);
    this.ambience?.stop();
  }

  /** Where the player hears from (the camera), so traffic and birds are placed around them. */
  setListener(x: number, z: number, yaw: number): void {
    this.listener = { x, z, yaw };
  }

  /**
   * The player's vehicle engine, or silence with null (on foot, paused). Its voice follows the
   * vehicle's kind, speed and accelerator: see `ENGINES` in `profiles.ts`.
   */
  setEngine(state: EngineState | null): void {
    const { context, vehicles, noise } = this;
    if (!context || !vehicles || !noise) return;
    if (state === null) {
      this.engine?.stop(0.25);
      this.engine = null;
      return;
    }
    if (this.engine && this.engine.kind !== state.kind) {
      this.engine.stop(0.1);
      this.engine = null;
    }
    this.engine ??= new EngineVoice(context, vehicles, noise, state.kind);
    this.engine.update(state);
  }

  /**
   * The traffic round the player: the nearest few are heard as their own kind of engine, placed
   * and panned in the street. Vehicles that have stood a while may sound their horn (more in the
   * rushes; `honkChance`).
   * @param hour the game clock, for how impatient the traffic is
   */
  setTraffic(traffic: readonly TrafficSound[], dt = 0, hour = 12): void {
    const { context, vehicles, noise } = this;
    if (!context || !vehicles || !noise) return;
    const listener = this.listener;
    const near = traffic
      .map((t) => ({ t, d: Math.hypot(t.x - listener.x, t.z - listener.z) }))
      .filter((n) => n.d < TRAFFIC_HEARD)
      .sort((a, b) => a.d - b.d)
      .slice(0, TRAFFIC_VOICES);
    const keep = new Set(near.map((n) => n.t.id));
    for (const [id, voice] of this.trafficVoices) {
      if (!keep.has(id)) {
        voice.stop(0.3);
        this.trafficVoices.delete(id);
      }
    }
    for (const { t } of near) {
      const kind = soundKind(t.kind);
      const at = place(listener, t.x, t.z, 5, TRAFFIC_HEARD);
      let voice = this.trafficVoices.get(t.id);
      if (!voice || voice.kind !== kind) {
        voice?.stop(0.1);
        voice = new EngineVoice(context, vehicles, noise, kind, { ...at, gain: 0 });
        this.trafficVoices.set(t.id, voice);
      }
      // Traffic is a little quieter than the player's own engine, and pulls away gently.
      voice.update({ speed: t.speed, throttle: t.speed > 0.5 ? 0.35 : 0 }, 0.6, at);
    }

    // Horns from stopped traffic within earshot.
    if (dt <= 0) return;
    this.honkWait = Math.max(0, this.honkWait - dt);
    const seen = new Set<number>();
    for (const t of traffic) {
      const d = Math.hypot(t.x - listener.x, t.z - listener.z);
      if (d > 70) continue;
      seen.add(t.id);
      const stood = t.speed < 0.3 ? (this.stood.get(t.id) ?? 0) + dt : 0;
      this.stood.set(t.id, stood);
      if (this.honkWait > 0 || Math.random() >= honkChance(hour, stood) * dt) continue;
      const kind = soundKind(t.kind);
      playHorn(context, vehicles, kind, 0.8, place(listener, t.x, t.z, 6, 90));
      this.counts.trafficHonk = (this.counts.trafficHonk ?? 0) + 1;
      this.stood.set(t.id, 0);
      this.honkWait = 1.2 + Math.random() * 1.5;
    }
    for (const id of [...this.stood.keys()]) if (!seen.has(id)) this.stood.delete(id);
  }

  /** The city's background (call every frame while playing). */
  setAmbience(dt: number, state: AmbienceState): void {
    this.ambience?.update(dt, state);
  }

  /**
   * Walking and running: call every frame on foot. Footsteps fall at the stride's cadence
   * (`stepInterval`), alternating feet, with a splash when it rains.
   * @param speed m/s along the ground; @param grounded false in the air
   */
  walk(dt: number, speed: number, grounded: boolean, wet: number): void {
    const { context, world, noise } = this;
    if (!context || !world || !noise) return;
    if (!grounded || speed < 0.6) {
      // Start the next walk on a step, not part-way through one.
      this.stepClock = stepInterval(speed) * 0.6;
      return;
    }
    this.stepClock += dt;
    const interval = stepInterval(speed);
    if (this.stepClock < interval) return;
    this.stepClock -= interval;
    this.stepSide = -this.stepSide;
    playFootstep(context, world, noise, Math.max(0, Math.min(1, (speed - 2) / 3)), wet, this.stepSide * 0.12);
    this.counts.footstep = (this.counts.footstep ?? 0) + 1;
  }

  /** Landing after a jump or a drop. @param strength 0..1 */
  land(strength: number): void {
    const { context, world, noise } = this;
    if (!context || !world || !noise) return;
    playLanding(context, world, noise, Math.max(0, Math.min(1, strength)));
  }

  /** The player's horn: each vehicle has its own (`HORNS` in `profiles.ts`). */
  horn(kind: VehicleSoundKind = "car"): void {
    const { context, vehicles } = this;
    if (!context || !vehicles) return;
    playHorn(context, vehicles, kind);
    this.counts[`horn:${kind}`] = (this.counts[`horn:${kind}`] ?? 0) + 1;
  }

  /** For tests and the debug snapshot. */
  state(): SoundState {
    return {
      unlocked: this.context !== null,
      muted: this.muted,
      engine: this.engine ? { kind: this.engine.kind, rpm: Math.round(this.engine.rpm) } : null,
      traffic: [...this.trafficVoices].map(([id, voice]) => ({ id, kind: voice.kind })),
      ambience: this.ambience?.active ?? [],
      played: { ...this.counts, ...(this.ambience?.played ?? {}) },
    };
  }

  /**
   * Tyre squeal while the vehicle slides, or silence with null (on foot, paused). Filtered
   * noise with a faint high whine; louder and a little higher the harder it slides.
   * @param level 0 (gripping) to 1 (a full drift)
   */
  setSkid(level: number | null): void {
    const { context, vehicles, noise } = this;
    if (!context || !vehicles || !noise) return;
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
      filter.connect(gain).connect(vehicles);
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
    this.tone({ frequency: 150, slideTo: 95, duration: 0.09, type: "square", volume: 0.05 }, this.vehicles);
    this.burst(0.05, 0.1, 900, this.vehicles);
  }

  /** A crash: a dull thump, louder for harder hits. @param strength change of speed, m/s */
  crash(strength: number): void {
    const loud = Math.max(0.25, Math.min(1, strength / 8));
    this.burst(0.25, 0.9 * loud, 600, this.vehicles);
    this.tone({ frequency: 70, slideTo: 38, duration: 0.25, volume: 0.45 * loud }, this.vehicles);
    if (strength > 4) this.burst(0.18, 0.3 * loud, 5000, this.vehicles); // glass and metal
  }

  /** Two-tone wail of an ambulance siren, on until switched off. */
  setSiren(on: boolean): void {
    const { context, vehicles } = this;
    if (!context || !vehicles) return;
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
    oscillator.connect(gain).connect(vehicles);
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
    const { context, vehicles } = this;
    if (!context || !vehicles) return;
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
      oscillator.connect(gain).connect(vehicles);
      oscillator.start();
      wobble.start();
      this.policeSiren = { oscillator, wobble, gain };
    }
    this.policeSiren.gain.gain.setTargetAtTime(0.05 * Math.min(1, level), context.currentTime, 0.1);
  }

  /** Coins for a paid job. */
  cash(): void {
    [1318, 1568].forEach((frequency, i) => this.tone({ frequency, duration: 0.16, type: "square", volume: 0.08, delay: i * 0.08 }, this.ui));
  }

  private tone(tone: Tone, bus: GainNode | null = this.world): void {
    const { context } = this;
    if (!context || !bus) return;
    const start = context.currentTime + (tone.delay ?? 0);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = tone.type ?? "sine";
    oscillator.frequency.setValueAtTime(tone.frequency, start);
    if (tone.slideTo) oscillator.frequency.exponentialRampToValueAtTime(tone.slideTo, start + tone.duration);
    gain.gain.setValueAtTime(tone.volume ?? 0.25, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + tone.duration);
    oscillator.connect(gain).connect(bus);
    oscillator.start(start);
    oscillator.stop(start + tone.duration + 0.02);
  }

  private burst(duration: number, volume: number, cutoff: number, bus: GainNode | null = this.world): void {
    const { context, noise } = this;
    if (!context || !bus || !noise) return;
    const source = context.createBufferSource();
    source.buffer = noise;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    source.connect(filter).connect(gain).connect(bus);
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

  /**
   * A blow landing (combat redesign): a jab is a tight slap, a heavy hit (the hook, a stagger)
   * a deeper thud, the cricket bat a woody crack.
   */
  impact(kind: "light" | "heavy" | "bat"): void {
    if (kind === "bat") {
      this.tone({ frequency: 520, slideTo: 300, duration: 0.07, type: "square", volume: 0.18 });
      this.burst(0.12, 0.6, 2600);
      this.tone({ frequency: 110, slideTo: 55, duration: 0.14, volume: 0.35 });
      return;
    }
    const heavy = kind === "heavy";
    this.burst(heavy ? 0.12 : 0.07, heavy ? 0.7 : 0.45, heavy ? 650 : 1100);
    this.tone({ frequency: heavy ? 95 : 140, slideTo: heavy ? 45 : 70, duration: heavy ? 0.16 : 0.08, volume: heavy ? 0.45 : 0.3 });
  }

  /** A blow caught on raised forearms: a dull muffled thump. */
  block(): void {
    this.burst(0.06, 0.35, 380);
    this.tone({ frequency: 75, duration: 0.07, volume: 0.25 });
  }

  /** A quick dodge: cloth and air. */
  dodge(): void {
    const { context, world, noise } = this;
    if (!context || !world || !noise) return;
    const source = context.createBufferSource();
    source.buffer = noise;
    const band = context.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 1.4;
    const now = context.currentTime;
    band.frequency.setValueAtTime(700, now);
    band.frequency.exponentialRampToValueAtTime(2400, now + 0.2);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
    source.connect(band).connect(gain).connect(world);
    source.start(now, Math.random() * 0.7);
    source.stop(now + 0.26);
  }

  /** An enemy drawing back to strike: a short rising swish, the audible tell. */
  windup(): void {
    this.burst(0.18, 0.08, 1600);
  }

  /** Someone hurt (a pedestrian or an enemy): a short voiced grunt, pitch varied. */
  grunt(low = false): void {
    const { context, world } = this;
    if (!context || !world) return;
    const now = context.currentTime;
    const voice = context.createOscillator();
    voice.type = "sawtooth";
    const pitch = (low ? 110 : 160) * (0.9 + Math.random() * 0.25);
    voice.frequency.setValueAtTime(pitch * 1.15, now);
    voice.frequency.exponentialRampToValueAtTime(pitch * 0.8, now + 0.18);
    const formant = context.createBiquadFilter();
    formant.type = "bandpass";
    formant.frequency.value = 650 + Math.random() * 200;
    formant.Q.value = 3;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    voice.connect(formant).connect(gain).connect(world);
    voice.start(now);
    voice.stop(now + 0.22);
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
    this.tone({ frequency: 660, duration: 0.14, type: "triangle" }, this.ui);
    this.tone({ frequency: 880, duration: 0.2, type: "triangle", delay: 0.12 }, this.ui);
  }

  /** Stage complete. */
  fanfare(): void {
    [523, 659, 784, 1047].forEach((frequency, i) => this.tone({ frequency, duration: 0.24, type: "triangle", delay: i * 0.13, volume: 0.3 }, this.ui));
  }

  /** Stage failed or player knocked out. */
  fail(): void {
    this.tone({ frequency: 330, slideTo: 150, duration: 0.5, type: "sawtooth", volume: 0.22 }, this.ui);
  }

  /**
   * A door shutting. A car's is a solid thunk; a bus's is the hiss of its air door; an auto has
   * none (a creak of the seat instead).
   */
  door(kind: VehicleSoundKind | "house" = "car"): void {
    if (kind === "bus") {
      this.burst(0.35, 0.18, 5200);
      this.tone({ frequency: 70, duration: 0.1, volume: 0.2 });
      return;
    }
    if (kind === "auto" || kind === "bike") {
      this.tone({ frequency: 180, slideTo: 150, duration: 0.07, type: "triangle", volume: 0.08 });
      return;
    }
    this.burst(0.06, 0.35, 500);
    this.tone({ frequency: kind === "ambulance" ? 75 : 90, duration: 0.08, volume: 0.3 });
  }

  /**
   * An electric train's horn as it pulls away: two reedy notes a minor third apart, held, then
   * a short second blast. Quieter with distance.
   * @param level 1 beside the train, towards 0 far away
   */
  trainHorn(level = 1): void {
    const v = Math.max(0, Math.min(1, level));
    if (v < 0.03) return;
    for (const [frequency, delay, duration] of [[311, 0, 0.9], [370, 0, 0.9], [311, 1.1, 0.35], [370, 1.1, 0.35]] as const) {
      this.tone({ frequency, duration, type: "sawtooth", volume: 0.07 * v, delay });
    }
  }

  /**
   * The station's announcement: a three-note chime, then a murmur of a voice through the
   * platform's speakers (filtered tones rising and falling like syllables; no words).
   */
  stationChime(): void {
    [659, 523, 784].forEach((frequency, i) => this.tone({ frequency, duration: 0.7, type: "sine", volume: 0.16, delay: i * 0.42 }));
    const { context, world } = this;
    if (!context || !world) return;
    const start = context.currentTime + 1.6;
    const voice = context.createOscillator();
    voice.type = "sawtooth";
    const formant = context.createBiquadFilter();
    formant.type = "bandpass";
    formant.Q.value = 4;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    // Twelve "syllables": pitch and vowel colour wander, loudness pulses.
    for (let k = 0; k < 12; k++) {
      const t = start + k * 0.19;
      voice.frequency.setValueAtTime(150 + Math.sin(k * 1.7) * 25, t);
      formant.frequency.setValueAtTime(700 + Math.sin(k * 2.3) * 350, t);
      gain.gain.linearRampToValueAtTime(0.05, t + 0.05);
      gain.gain.linearRampToValueAtTime(0.012, t + 0.17);
    }
    gain.gain.linearRampToValueAtTime(0.0001, start + 12 * 0.19 + 0.1);
    voice.connect(formant).connect(gain).connect(world);
    voice.start(start);
    voice.stop(start + 12 * 0.19 + 0.2);
  }
}


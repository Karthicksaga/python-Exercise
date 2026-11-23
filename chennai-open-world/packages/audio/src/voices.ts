/**
 * Web Audio building blocks for the sound design in `profiles.ts`: an engine voice, horns,
 * footsteps and the city's ambience. Everything is synthesised (no files, nothing to license).
 * Each builder takes the context and a destination, so the same code plays live and renders
 * offline (tests compare the rendered sounds of different vehicles).
 */
import { ENGINES, HORNS, cityLevel, engineRpm, firingHz, wildlife, type EngineProfile, type Placement, type VehicleSoundKind } from "./profiles";

/** One second of white noise, looped wherever noise is needed. */
export function noiseBuffer(context: BaseAudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/**
 * Where a sound goes: optionally panned and dulled for its place in the street. Returns the node
 * to connect the sound to, and a function to move it.
 */
export function placedOutput(context: BaseAudioContext, destination: AudioNode, placement?: Placement): { input: AudioNode; move(p: Placement, smooth?: number): void; nodes: AudioNode[] } {
  if (!placement) return { input: destination, move: () => undefined, nodes: [] };
  const level = context.createGain();
  const air = context.createBiquadFilter();
  air.type = "lowpass";
  const panner = typeof context.createStereoPanner === "function" ? context.createStereoPanner() : null;
  level.connect(air);
  if (panner) air.connect(panner).connect(destination);
  else air.connect(destination);
  const move = (p: Placement, smooth = 0.08): void => {
    const now = context.currentTime;
    level.gain.setTargetAtTime(p.gain, now, smooth);
    air.frequency.setTargetAtTime(p.cutoff, now, smooth);
    panner?.pan.setTargetAtTime(p.pan, now, smooth);
  };
  level.gain.value = placement.gain;
  air.frequency.value = placement.cutoff;
  if (panner) panner.pan.value = placement.pan;
  return { input: level, move, nodes: panner ? [level, air, panner] : [level, air] };
}

/** What an engine voice is told each frame. */
export interface EngineState {
  readonly kind: VehicleSoundKind;
  /** m/s, forward or back. */
  readonly speed: number;
  /** Accelerator, 0..1. */
  readonly throttle: number;
}

/**
 * A running engine, built from its profile: the firing pulse and a pure tone on the firing note
 * (the order a multi-cylinder engine is loudest in) through an exhaust
 * resonance and a low-pass that opens with revs and throttle; noise chopped by every firing
 * (putts, rattle, diesel clatter); a slow lope at idle for singles; a turbo whistle; and wind
 * and tyre roar that grows with speed.
 */
export class EngineVoice {
  readonly kind: VehicleSoundKind;
  readonly profile: EngineProfile;
  /** Engine speed last set (for tests and the debug snapshot). */
  rpm: number;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private readonly fire: OscillatorNode;
  private readonly sub: OscillatorNode;
  private readonly chopper: OscillatorNode;
  private readonly chopDepth: GainNode;
  private readonly chop: GainNode;
  private readonly lopeDepth: GainNode;
  private readonly tone: BiquadFilterNode;
  private readonly turbo: OscillatorNode;
  private readonly turboGain: GainNode;
  private readonly wind: BiquadFilterNode;
  private readonly windGain: GainNode;
  private readonly level: GainNode;
  private readonly out: ReturnType<typeof placedOutput>;
  private stopped = false;

  constructor(
    private readonly context: BaseAudioContext,
    destination: AudioNode,
    noise: AudioBuffer,
    kind: VehicleSoundKind,
    placement?: Placement,
  ) {
    this.kind = kind;
    const p = (this.profile = ENGINES[kind]);
    this.rpm = p.idleRpm;
    const hz = firingHz(p, p.idleRpm);
    this.out = placedOutput(context, destination, placement);
    this.level = context.createGain();
    this.level.gain.value = 0;
    this.level.connect(this.out.input);

    // Tone: low-pass for the body, plus an exhaust resonance in parallel.
    this.tone = context.createBiquadFilter();
    this.tone.type = "lowpass";
    this.tone.frequency.value = p.cutoff[0];
    this.tone.Q.value = 0.7;
    this.tone.connect(this.level);
    const exhaust = context.createBiquadFilter();
    exhaust.type = "bandpass";
    exhaust.frequency.value = p.exhaust.hz;
    exhaust.Q.value = p.exhaust.q;
    const exhaustGain = context.createGain();
    exhaustGain.gain.value = 0.9;
    exhaust.connect(exhaustGain).connect(this.level);

    this.fire = this.osc(p.wave, hz);
    const fireGain = context.createGain();
    fireGain.gain.value = 0.5;
    this.fire.connect(fireGain);
    fireGain.connect(this.tone);
    fireGain.connect(exhaust);

    this.sub = this.osc("sine", hz);
    const subGain = context.createGain();
    subGain.gain.value = p.sub;
    this.sub.connect(subGain).connect(this.tone);

    // Lope: a slow wobble of the firing rate, strongest at idle.
    const lope = this.osc("sine", 3.1);
    this.lopeDepth = context.createGain();
    this.lopeDepth.gain.value = hz * 0.07 * p.lope;
    lope.connect(this.lopeDepth);
    this.lopeDepth.connect(this.fire.frequency);
    this.lopeDepth.connect(this.sub.frequency);

    // Noise switched on and off by every firing: level = depth/2 + depth/2 × square(firing).
    const rough = this.loop(noise);
    const roughBand = context.createBiquadFilter();
    roughBand.type = "bandpass";
    roughBand.frequency.value = p.roughHz;
    roughBand.Q.value = 1.1;
    this.chop = context.createGain();
    this.chop.gain.value = p.roughness * 0.5;
    this.chopper = this.osc("square", hz);
    this.chopDepth = context.createGain();
    this.chopDepth.gain.value = p.roughness * 0.5;
    this.chopper.connect(this.chopDepth).connect(this.chop.gain);
    rough.connect(roughBand).connect(this.chop).connect(this.level);

    // Turbo whistle (diesels).
    this.turbo = this.osc("sine", 2400);
    this.turboGain = context.createGain();
    this.turboGain.gain.value = 0;
    this.turbo.connect(this.turboGain).connect(this.level);

    // Wind and tyres: low noise opening up with speed.
    const air = this.loop(noise);
    this.wind = context.createBiquadFilter();
    this.wind.type = "lowpass";
    this.wind.frequency.value = 300;
    this.windGain = context.createGain();
    this.windGain.gain.value = 0;
    air.connect(this.wind).connect(this.windGain).connect(this.out.input);

    for (const source of this.sources) source.start();
  }

  /** Follow the vehicle: revs from speed and throttle (`engineRpm`), loudness, wind. */
  update(state: Omit<EngineState, "kind">, level = 1, placement?: Placement): void {
    if (this.stopped) return;
    const p = this.profile;
    const now = this.context.currentTime;
    const throttle = Math.max(0, Math.min(1, state.throttle));
    const rpm = (this.rpm = engineRpm(p, state.speed, throttle));
    const hz = firingHz(p, rpm);
    const rev = Math.max(0, Math.min(1, (rpm - p.idleRpm) / (p.shiftRpm - p.idleRpm)));
    const smooth = 0.05;
    this.fire.frequency.setTargetAtTime(hz, now, smooth);
    this.sub.frequency.setTargetAtTime(hz, now, smooth);
    this.chopper.frequency.setTargetAtTime(hz, now, smooth);
    // The lope fades as the engine revs up.
    this.lopeDepth.gain.setTargetAtTime(hz * 0.07 * p.lope * (1 - rev), now, 0.2);
    // Brighter under load: the throttle opens the filter more than the revs do.
    this.tone.frequency.setTargetAtTime(p.cutoff[0] + (p.cutoff[1] - p.cutoff[0]) * (0.35 * rev + 0.65 * throttle * (0.4 + 0.6 * rev)), now, 0.08);
    const rough = p.roughness * (0.5 + 0.5 * throttle) * 0.5;
    this.chop.gain.setTargetAtTime(rough, now, 0.08);
    this.chopDepth.gain.setTargetAtTime(rough, now, 0.08);
    this.turbo.frequency.setTargetAtTime(1800 + rev * 2600, now, 0.15);
    this.turboGain.gain.setTargetAtTime(p.turbo * throttle * rev * 0.012, now, 0.25);
    const share = Math.min(1, Math.abs(state.speed) / p.topSpeed);
    this.wind.frequency.setTargetAtTime(280 + share * 900, now, 0.2);
    this.windGain.gain.setTargetAtTime(p.wind * share * share * 0.09 * level, now, 0.2);
    this.level.gain.setTargetAtTime(p.volume * (0.05 + 0.055 * throttle + 0.035 * rev) * level, now, 0.08);
    if (placement) this.out.move(placement);
  }

  /** Fade out and release every node. */
  stop(fade = 0.12): void {
    if (this.stopped) return;
    this.stopped = true;
    const now = this.context.currentTime;
    this.level.gain.setTargetAtTime(0, now, fade / 3);
    this.windGain.gain.setTargetAtTime(0, now, fade / 3);
    for (const source of this.sources) source.stop(now + fade + 0.05);
    const nodes = this.out.nodes;
    this.sources[0]?.addEventListener("ended", () => {
      this.level.disconnect();
      for (const node of nodes) node.disconnect();
    });
  }

  private osc(type: OscillatorType, frequency: number): OscillatorNode {
    const node = this.context.createOscillator();
    node.type = type;
    node.frequency.value = frequency;
    this.sources.push(node);
    return node;
  }

  private loop(buffer: AudioBuffer): AudioBufferSourceNode {
    const node = this.context.createBufferSource();
    node.buffer = buffer;
    node.loop = true;
    // Start each loop at a different point so layers do not correlate.
    node.loopStart = 0;
    this.sources.push(node);
    return node;
  }
}

/**
 * Sound a vehicle's horn, as its profile says: one or more notes, coloured by a band-pass, with
 * an air horn's swell and pitch scoop or a cheap horn's diaphragm buzz.
 * @param level 0..1 (distance already applied when `placement` is given)
 */
export function playHorn(context: BaseAudioContext, destination: AudioNode, kind: VehicleSoundKind, level = 1, placement?: Placement, at = context.currentTime): number {
  const horn = HORNS[kind];
  const out = placedOutput(context, destination, placement);
  const colour = context.createBiquadFilter();
  colour.type = "bandpass";
  colour.frequency.value = horn.colour.hz;
  colour.Q.value = horn.colour.q;
  // A band-pass removes the body, so the dry note is mixed back in under it.
  const body = context.createGain();
  body.gain.value = 0.35;
  const sum = context.createGain();
  sum.gain.value = 1;
  colour.connect(sum);
  body.connect(sum);
  sum.connect(out.input);
  let end = at;
  for (const note of horn.notes) {
    const start = at + note.at;
    const stop = start + note.length;
    end = Math.max(end, stop);
    const osc = context.createOscillator();
    osc.type = horn.wave;
    osc.frequency.setValueAtTime(note.hz * horn.scoop, start);
    osc.frequency.linearRampToValueAtTime(note.hz, start + Math.max(0.02, horn.attack * 2));
    const env = context.createGain();
    const peak = horn.volume * level;
    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(peak, start + horn.attack);
    env.gain.setValueAtTime(peak, stop - 0.04);
    env.gain.linearRampToValueAtTime(0.0001, stop);
    osc.connect(env);
    env.connect(colour);
    env.connect(body);
    if (horn.buzz > 0) {
      // Diaphragm rattle: the level flutters at `buzz` Hz.
      const flutter = context.createOscillator();
      flutter.type = "square";
      flutter.frequency.value = horn.buzz;
      const depth = context.createGain();
      depth.gain.value = 0.35;
      const tremolo = context.createGain();
      tremolo.gain.value = 0.65;
      flutter.connect(depth).connect(tremolo.gain);
      env.disconnect();
      env.connect(tremolo);
      tremolo.connect(colour);
      tremolo.connect(body);
      flutter.start(start);
      flutter.stop(stop + 0.02);
    }
    osc.start(start);
    osc.stop(stop + 0.02);
  }
  return end - at;
}

/**
 * One footstep: a soft heel thump and a scuff of the sole, varied a little each time, with a
 * splash on wet ground. Louder and sharper when running.
 */
export function playFootstep(context: BaseAudioContext, destination: AudioNode, noise: AudioBuffer, run: number, wet: number, pan = 0): void {
  const now = context.currentTime;
  const vary = 0.85 + Math.random() * 0.3;
  const panner = typeof context.createStereoPanner === "function" ? context.createStereoPanner() : null;
  const out: AudioNode = panner ?? destination;
  if (panner) {
    panner.pan.value = pan;
    panner.connect(destination);
  }
  const hit = (band: BiquadFilterType, hz: number, q: number, volume: number, length: number, offset = 0): void => {
    const source = context.createBufferSource();
    source.buffer = noise;
    const filter = context.createBiquadFilter();
    filter.type = band;
    filter.frequency.value = hz;
    filter.Q.value = q;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.linearRampToValueAtTime(volume, now + offset + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + length);
    source.connect(filter).connect(gain).connect(out);
    source.start(now + offset, Math.random() * 0.9);
    source.stop(now + offset + length + 0.02);
  };
  const loud = 0.75 + 0.5 * run;
  hit("bandpass", 380 * vary, 1.1, 0.32 * loud, 0.08);
  hit("highpass", 2600 * vary, 0.8, 0.05 * loud, 0.03, 0.012);
  if (wet > 0.05) hit("highpass", 3800 * vary, 0.6, 0.09 * wet * loud, 0.11, 0.008);
}

/** Landing from a jump: a thud, heavier for a longer drop. @param strength 0..1 */
export function playLanding(context: BaseAudioContext, destination: AudioNode, noise: AudioBuffer, strength: number): void {
  const now = context.currentTime;
  const source = context.createBufferSource();
  source.buffer = noise;
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 260;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.25 + 0.4 * strength, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
  source.connect(filter).connect(gain).connect(destination);
  source.start(now);
  source.stop(now + 0.18);
}

/** A crow's caw: a harsh falling note through a nasal band-pass, two or three times. */
export function playCrow(context: BaseAudioContext, destination: AudioNode, placement: Placement): void {
  const out = placedOutput(context, destination, placement);
  const now = context.currentTime;
  const caws = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < caws; i++) {
    const start = now + i * (0.32 + Math.random() * 0.08);
    const osc = context.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(560, start);
    osc.frequency.exponentialRampToValueAtTime(420, start + 0.22);
    const nasal = context.createBiquadFilter();
    nasal.type = "bandpass";
    nasal.frequency.value = 1300;
    nasal.Q.value = 3;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(0.09, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
    osc.connect(nasal).connect(gain).connect(out.input);
    osc.start(start);
    osc.stop(start + 0.26);
  }
}

/** The koel's dawn call: a rising two-note "ku-oo", repeated, each a little higher (as they do). */
export function playKoel(context: BaseAudioContext, destination: AudioNode, placement: Placement): void {
  const out = placedOutput(context, destination, placement);
  const now = context.currentTime;
  const calls = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < calls; i++) {
    const lift = 1 + i * 0.05;
    for (const [offset, from, to, length] of [[0, 620, 640, 0.14], [0.18, 760, 1060, 0.32]] as const) {
      const start = now + i * 0.75 + offset;
      const osc = context.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(from * lift, start);
      osc.frequency.exponentialRampToValueAtTime(to * lift, start + length);
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.06, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
      osc.connect(gain).connect(out.input);
      osc.start(start);
      osc.stop(start + length + 0.02);
    }
  }
}

/** What the ambience follows. */
export interface AmbienceState {
  readonly hour: number;
  /** 0..1 rain. */
  readonly rain: number;
  /** Metres to the sea, or Infinity inland. */
  readonly coast: number;
  /** 0..1 how busy the roads round the player are (traffic nearby). */
  readonly traffic: number;
  /** Inside a vehicle with the windows up: the outside is muffled. */
  readonly enclosed: boolean;
}

type Bed = { gain: GainNode; sources: AudioScheduledSourceNode[]; quietFor: number };

/**
 * The city's background: a low traffic hum by time of day and nearby traffic, rain, waves near
 * the coast, crickets at night; and now and then a crow, the koel at dawn, a distant horn. Beds
 * start only when they are heard and stop a few seconds after they fall silent.
 */
export class Ambience {
  private readonly beds = new Map<string, Bed>();
  private readonly muffle: BiquadFilterNode;
  private nextBird = 4;
  private nextHonk = 3;
  /** One-shots played so far, by name (for the debug snapshot and tests). */
  readonly played = { crow: 0, koel: 0, honk: 0 };

  constructor(
    private readonly context: BaseAudioContext,
    destination: AudioNode,
    private readonly noise: AudioBuffer,
  ) {
    this.muffle = context.createBiquadFilter();
    this.muffle.type = "lowpass";
    this.muffle.frequency.value = 18000;
    this.muffle.connect(destination);
  }

  /** Beds playing now. */
  get active(): string[] {
    return [...this.beds.keys()];
  }

  update(dt: number, state: AmbienceState): void {
    const now = this.context.currentTime;
    this.muffle.frequency.setTargetAtTime(state.enclosed ? 1400 : 18000, now, 0.3);
    const birds = wildlife(state.hour);
    const city = cityLevel(state.hour) * (0.5 + 0.5 * state.traffic);
    this.bed("city", dt, 0.05 * city, () => this.noiseBed([["lowpass", 220, 0.7], ["lowpass", 160, 0.7]]));
    this.bed("rain", dt, 0.06 * state.rain, () => this.noiseBed([["highpass", 900, 0.7], ["lowpass", 7000, 0.7]]));
    const sea = Number.isFinite(state.coast) ? Math.max(0, 1 - state.coast / 450) : 0;
    this.bed("sea", dt, 0.07 * sea, () => this.waves());
    this.bed("crickets", dt, 0.006 * birds.crickets * (1 - state.rain), () => this.crickets());

    // One-shots, out of doors only.
    if (state.enclosed) return;
    this.nextBird -= dt;
    if (this.nextBird <= 0) {
      this.nextBird = 6 + Math.random() * 14;
      const away = this.randomPlace(25, 70);
      if (birds.koel > 0.2 && Math.random() < birds.koel) {
        playKoel(this.context, this.muffle, away);
        this.played.koel++;
      } else if (birds.crows > 0 && Math.random() < birds.crows * (1 - state.rain)) {
        playCrow(this.context, this.muffle, away);
        this.played.crow++;
      }
    }
    this.nextHonk -= dt;
    if (this.nextHonk <= 0) {
      const level = cityLevel(state.hour);
      this.nextHonk = 2 + Math.random() * (14 - 10 * level);
      if (Math.random() < 0.3 + 0.7 * level) {
        const kinds: VehicleSoundKind[] = ["car", "car", "auto", "auto", "bike", "bus"];
        playHorn(this.context, this.muffle, kinds[Math.floor(Math.random() * kinds.length)]!, 0.5, this.randomPlace(80, 220, 900));
        this.played.honk++;
      }
    }
  }

  stop(): void {
    for (const name of [...this.beds.keys()]) this.release(name);
  }

  private randomPlace(min: number, max: number, cutoff?: number): Placement {
    const distance = min + Math.random() * (max - min);
    return { gain: Math.min(1, 8 / distance), pan: Math.random() * 1.6 - 0.8, cutoff: cutoff ?? 4000 - distance * 20 };
  }

  private bed(name: string, dt: number, target: number, make: () => Omit<Bed, "quietFor">): void {
    let bed = this.beds.get(name);
    if (!bed) {
      if (target < 0.0005) return;
      bed = { ...make(), quietFor: 0 };
      bed.gain.gain.value = 0;
      this.beds.set(name, bed);
    }
    bed.gain.gain.setTargetAtTime(target, this.context.currentTime, 0.6);
    bed.quietFor = target < 0.0005 ? bed.quietFor + dt : 0;
    if (bed.quietFor > 4) this.release(name);
  }

  private release(name: string): void {
    const bed = this.beds.get(name);
    if (!bed) return;
    this.beds.delete(name);
    const now = this.context.currentTime;
    bed.gain.gain.setTargetAtTime(0, now, 0.2);
    for (const source of bed.sources) source.stop(now + 1);
  }

  private noiseBed(filters: ReadonlyArray<readonly [BiquadFilterType, number, number]>): Omit<Bed, "quietFor"> {
    const source = this.context.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    let node: AudioNode = source;
    for (const [type, hz, q] of filters) {
      const filter = this.context.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = hz;
      filter.Q.value = q;
      node = node.connect(filter);
    }
    const gain = this.context.createGain();
    node.connect(gain).connect(this.muffle);
    source.start(0, Math.random() * 0.9);
    return { gain, sources: [source] };
  }

  /** Waves: low noise swelling and falling about every eleven seconds. */
  private waves(): Omit<Bed, "quietFor"> {
    const bed = this.noiseBed([["lowpass", 650, 0.6]]);
    const swell = this.context.createOscillator();
    swell.frequency.value = 0.09;
    const depth = this.context.createGain();
    depth.gain.value = 0.6;
    const shaped = this.context.createGain();
    shaped.gain.value = 0.5;
    // The bed's own gain sets the level; `shaped` swells inside it.
    const source = bed.sources[0]!;
    source.disconnect();
    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 650;
    source.connect(filter).connect(shaped).connect(bed.gain);
    swell.connect(depth).connect(shaped.gain);
    swell.start();
    return { gain: bed.gain, sources: [source, swell] };
  }

  /** Crickets: two high tones, each chirping in quick bursts. */
  private crickets(): Omit<Bed, "quietFor"> {
    const gain = this.context.createGain();
    gain.connect(this.muffle);
    const sources: AudioScheduledSourceNode[] = [];
    for (const [hz, rate, burst] of [[4600, 26, 0.9], [4950, 31, 0.7]] as const) {
      const tone = this.context.createOscillator();
      tone.frequency.value = hz;
      const chirp = this.context.createOscillator();
      chirp.type = "square";
      chirp.frequency.value = rate;
      const pulse = this.context.createOscillator();
      pulse.frequency.value = burst;
      const amp = this.context.createGain();
      amp.gain.value = 0.25;
      const chirpDepth = this.context.createGain();
      chirpDepth.gain.value = 0.25;
      const bursts = this.context.createGain();
      bursts.gain.value = 0.5;
      const burstDepth = this.context.createGain();
      burstDepth.gain.value = 0.5;
      chirp.connect(chirpDepth).connect(amp.gain);
      pulse.connect(burstDepth).connect(bursts.gain);
      tone.connect(amp).connect(bursts).connect(gain);
      for (const node of [tone, chirp, pulse]) {
        node.start();
        sources.push(node);
      }
    }
    return { gain, sources };
  }
}

/** For tests: render `seconds` of one vehicle's engine (at `speed`, `throttle`) or horn, offline. */
export async function renderVehicleSound(what: "engine" | "horn", kind: VehicleSoundKind, options: { speed?: number; throttle?: number; seconds?: number; sampleRate?: number } = {}): Promise<Float32Array> {
  const rate = options.sampleRate ?? 22050;
  const seconds = options.seconds ?? 1;
  const context = new OfflineAudioContext(1, Math.round(rate * seconds), rate);
  if (what === "engine") {
    const voice = new EngineVoice(context, context.destination, noiseBuffer(context), kind);
    voice.update({ speed: options.speed ?? 0, throttle: options.throttle ?? 0 });
  } else playHorn(context, context.destination, kind);
  const buffer = await context.startRendering();
  return buffer.getChannelData(0);
}

/**
 * Everyday life between jobs: places the player can go into (home, a hospital, a gym, a mall
 * and a cinema) and what can be done there. Each activity costs money and game time and may
 * change health, fitness or clothes. The game applies the outcome (charges the money, moves the
 * clock, sets the health); this module only decides. Pure logic, fully unit-tested.
 *
 * Every name, film, plot and joke here is invented.
 */

export type PlaceKind = "home" | "hospital" | "gym" | "mall" | "cinema";

/** A place's entrance on the map. Walking into its radius offers ENTER. */
export interface Place {
  readonly id: string;
  readonly kind: PlaceKind;
  /** Invented name shown to the player. */
  readonly name: string;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

/** What the activities need to know about the player right now. */
export interface Now {
  /** Game time, 0–24. */
  readonly hour: number;
  readonly money: number;
  readonly health: number;
}

/** What an activity did. The game takes `cost`, moves the clock by `hours` and sets `health`. */
export interface Outcome {
  readonly ok: boolean;
  /** One or two sentences for the screen. */
  readonly message: string;
  /** Rupees to take (0 when nothing was bought or `ok` is false). */
  readonly cost: number;
  /** Game hours that pass. */
  readonly hours: number;
  /** New health, when the activity changes it. */
  readonly health?: number;
}

export interface Outfit {
  readonly id: string;
  readonly name: string;
  /** Multiplies the clothing colour of the player's model. */
  readonly tint: number;
  /** Price at the mall; 0 for clothes the player starts with. */
  readonly price: number;
}

export interface Snack {
  readonly id: string;
  readonly name: string;
  readonly price: number;
  /** Health points restored. */
  readonly health: number;
}

export interface Film {
  readonly id: string;
  readonly title: string;
  readonly genre: string;
  /** One-line plot. */
  readonly plot: string;
  /** Running time in game hours, interval included. */
  readonly runtime: number;
  /** Moments from the film itself, shown while watching. */
  readonly scenes: readonly string[];
}

export const MAX_HEALTH = 100;
export const ENTRANCE_RADIUS = 3;

export const OUTFITS: readonly Outfit[] = [
  { id: "everyday", name: "Everyday shirt and trousers", tint: 0xffffff, price: 0 },
  { id: "festival", name: "Green festival shirt", tint: 0x7fc48a, price: 0 },
  { id: "maroon-shirt", name: "Maroon silk-cotton shirt", tint: 0xb85a5a, price: 600 },
  { id: "track-suit", name: "Blue track suit", tint: 0x5a7ee0, price: 900 },
  { id: "mustard-kurta", name: "Mustard kurta", tint: 0xe0bb4a, price: 750 },
];
/** Clothes the player owns at the start. */
export const STARTING_OUTFITS = ["everyday", "festival"] as const;
/** The free item of the mall's buy-one-get-one offer (the small print says socks). */
export const FREE_SOCKS = "socks";

export const SNACKS: readonly Snack[] = [
  { id: "filter-coffee", name: "Filter coffee", price: 30, health: 5 },
  { id: "corn-cup", name: "Masala corn cup", price: 40, health: 10 },
  { id: "bajji-plate", name: "Bajji plate", price: 60, health: 20 },
];

export const FILMS: readonly Film[] = [
  {
    id: "sambar-sunday",
    title: "Sambar Sunday",
    genre: "Family comedy",
    plot: "Three generations of one family fight over the last vada at a cousin's wedding lunch.",
    runtime: 2.5,
    scenes: ["Grandfather hides the vada inside his turban.", "The bride's uncle starts a sambar-tasting contest that nobody asked for."],
  },
  {
    id: "roundtana-thunder",
    title: "Roundtana Thunder",
    genre: "Action drama",
    plot: "A soft-spoken bus conductor stands up to the gang that hoards the neighbourhood's water tankers.",
    runtime: 2.75,
    scenes: ["The conductor stops a runaway tanker with one punch-ticket.", "Slow-motion walk through a water-pipe shower, three times."],
  },
  {
    id: "filter-coffee-kadhal",
    title: "Filter Coffee Kadhal",
    genre: "Romance",
    plot: "Two rival coffee-stall owners on the same street fall in love during a week of monsoon rain.",
    runtime: 2.25,
    scenes: ["A song in the rain, under one shared umbrella with a hole in it.", "They argue over chicory for ten full minutes, then hold hands."],
  },
];
/** Show times, game hours. */
export const SHOWS: readonly number[] = [11, 14.5, 18.5, 21.5];
export const TICKET_PRICE = 150;
export const POPCORN_PRICE = 60;
export const POPCORN_HEALTH = 5;

/** Comic audience moments, shown during every film (between the film's own scenes). */
export const AUDIENCE_MOMENTS = {
  entry: "The hero's entry: the whole hall whistles, and paper confetti rains from the back rows.",
  phone: "Someone's phone rings, loudly. He answers: \"I'm in the theatre, the hero just came. Call me at the interval.\"",
  interval: "INTERVAL. Everyone rushes the snack counter at once, as if the popcorn might run out.",
  end: "The credits roll and half the hall is already outside, discussing the climax.",
} as const;

export const SLEEP_UNTIL = 7;
export const TREATMENT_RATE = 3;
export const TREATMENT_MIN_FEE = 50;
export const TREATMENT_HOURS = 0.5;
/** The free counter: no fee, but a long wait. */
export const FREE_QUEUE_HOURS = 3;
export const GYM_PASS = 50;
export const WORKOUT_HOURS = 1;
export const WORKOUT_REPS = 5;
/** Good reps needed for a workout to count as a training day. */
export const WORKOUT_GOOD_NEEDED = 3;
export const MAX_FITNESS = 5;
/** Sprint speed gained per fitness point (2%, so at most +10%). */
export const FITNESS_SPRINT = 0.02;
/** The needle's green zone, as a share of the bar. */
export const WORKOUT_ZONE: readonly [number, number] = [0.38, 0.62];
/** Seconds for the needle to cross the bar and come back. */
export const NEEDLE_PERIOD = 1.6;
/** The mall's famous escalator queue, game hours. */
export const ESCALATOR_HOURS = 1 / 6;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const wrapHour = (h: number) => ((h % 24) + 24) % 24;

/** "18:30" */
export function clockText(hour: number): string {
  const minutes = Math.round(wrapHour(hour) * 60) % (24 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Hours to wait from `hour` until the next show starts, and when it starts. */
export function nextShow(hour: number): { start: number; wait: number } {
  const h = wrapHour(hour);
  const start = SHOWS.find((s) => s >= h) ?? SHOWS[0]!;
  return { start, wait: wrapHour(start - h) };
}

/** Hours of sleep from `hour` until the next morning at SLEEP_UNTIL (a full day if it is exactly then). */
export function sleepHours(hour: number): number {
  const hours = wrapHour(SLEEP_UNTIL - hour);
  return hours < 1e-6 ? 24 : hours;
}

/** Fee to be treated at the hospital: by missing health, a minimum fee, free by ambulance or when healthy. */
export function treatmentFee(health: number, byAmbulance: boolean): number {
  const missing = clamp(MAX_HEALTH - health, 0, MAX_HEALTH);
  if (missing < 1 || byAmbulance) return 0;
  return Math.max(TREATMENT_MIN_FEE, Math.round(missing * TREATMENT_RATE));
}

/** Multiplier on the player's sprint speed for a fitness level. */
export function sprintFactor(fitness: number): number {
  return 1 + clamp(Math.floor(fitness), 0, MAX_FITNESS) * FITNESS_SPRINT;
}

/** Where the workout needle is, 0–1, `seconds` after the rep began (there and back). */
export function needleAt(seconds: number): number {
  const phase = (((seconds / NEEDLE_PERIOD) % 1) + 1) % 1;
  return phase < 0.5 ? phase * 2 : 2 - phase * 2;
}

/** A tap with the needle here is a good rep. */
export function goodRep(needle: number): boolean {
  return needle >= WORKOUT_ZONE[0] && needle <= WORKOUT_ZONE[1];
}

/** Whole days passed when `hours` go by from `hour`. */
export function daysPassed(hour: number, hours: number): number {
  return Math.floor((wrapHour(hour) + Math.max(0, hours)) / 24);
}

/** What is saved. */
export interface LifeState {
  /** Days since the save began (sleeping and the clock passing midnight both count). */
  readonly day: number;
  /** 0 to MAX_FITNESS. */
  readonly fitness: number;
  /** Day of the last workout that counted, or -1. */
  readonly trainedDay: number;
  readonly outfit: string;
  /** Clothes and other things bought. */
  readonly owned: readonly string[];
  /** Films seen, by id. */
  readonly films: readonly string[];
  /** Short stories finished, by id. */
  readonly stories: readonly string[];
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);
const count = (value: unknown, fallback: number): number => (typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback);

/** A saved life state from storage, tolerating anything missing or damaged (older saves have none). */
export function parseLife(raw: unknown): LifeState {
  const data = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const owned = [...new Set([...STARTING_OUTFITS, ...strings(data.owned)])];
  const outfit = typeof data.outfit === "string" && owned.includes(data.outfit) && OUTFITS.some((o) => o.id === data.outfit) ? data.outfit : "everyday";
  return {
    day: Math.max(0, count(data.day, 0)),
    fitness: clamp(count(data.fitness, 0), 0, MAX_FITNESS),
    trainedDay: Math.max(-1, count(data.trainedDay, -1)),
    outfit,
    owned,
    films: [...new Set(strings(data.films))],
    stories: [...new Set(strings(data.stories))],
  };
}

const fresh = (): LifeState => parseLife(undefined);

/** The player's everyday life: decides each activity's outcome and keeps what is saved. */
export class Life {
  private s: LifeState;

  constructor(saved?: unknown) {
    this.s = parseLife(saved);
  }

  state(): LifeState {
    return this.s;
  }

  get day(): number {
    return this.s.day;
  }

  get fitness(): number {
    return this.s.fitness;
  }

  get outfit(): Outfit {
    return OUTFITS.find((o) => o.id === this.s.outfit) ?? OUTFITS[0]!;
  }

  get sprint(): number {
    return sprintFactor(this.s.fitness);
  }

  owns(id: string): boolean {
    return this.s.owned.includes(id);
  }

  /** The clock moved on by itself from `from` to `to` (one fixed step): count midnight. */
  tick(from: number, to: number): void {
    if (to < from - 12) this.s = { ...this.s, day: this.s.day + 1 };
  }

  /** Count the days that `hours` of an activity started at `hour` cross. */
  private pass(hour: number, hours: number): void {
    const days = daysPassed(hour, hours);
    if (days > 0) this.s = { ...this.s, day: this.s.day + days };
  }

  private done(now: Now, message: string, hours: number, cost = 0, health?: number): Outcome {
    this.pass(now.hour, hours);
    return { ok: true, message, cost, hours, ...(health !== undefined ? { health } : {}) };
  }

  private refuse(message: string): Outcome {
    return { ok: false, message, cost: 0, hours: 0 };
  }

  // Home -----------------------------------------------------------------------------------

  /** Sleep until the morning: full health. The game saves afterwards. */
  sleep(now: Now): Outcome {
    const hours = sleepHours(now.hour);
    return this.done(now, `You sleep until ${clockText(SLEEP_UNTIL)}. The neighbour's pressure cooker whistles you awake, fully rested. Game saved.`, hours, 0, MAX_HEALTH);
  }

  /** Put on the next outfit you own. */
  changeClothes(): Outcome {
    const mine = OUTFITS.filter((o) => this.owns(o.id));
    const index = mine.findIndex((o) => o.id === this.s.outfit);
    const next = mine[(index + 1) % mine.length] ?? OUTFITS[0]!;
    this.s = { ...this.s, outfit: next.id };
    return { ok: true, message: `You change into the ${next.name.toLowerCase()}. Your mother says it needs ironing.`, cost: 0, hours: 0.25 };
  }

  // Hospital -------------------------------------------------------------------------------

  /** Treatment at the counter: restores health for a fee (free when brought by ambulance). */
  treat(now: Now, byAmbulance: boolean): Outcome {
    if (now.health >= MAX_HEALTH - 0.5) return this.refuse("The doctor checks you over: perfectly healthy. The nurse gives you a lollipop anyway.");
    const fee = treatmentFee(now.health, byAmbulance);
    if (fee > now.money) return this.refuse(`Treatment costs ₹${fee} and you have ₹${Math.floor(now.money)}. The free counter is always open, if you can wait.`);
    const message = byAmbulance
      ? "You came in with the ambulance, so the staff treat you free. A bandage, a tetanus shot and a lecture about helmets."
      : `Bandaged and patched up for ₹${fee}. The doctor writes \"rest\" on the prescription in very large letters.`;
    return this.done(now, message, TREATMENT_HOURS, fee, MAX_HEALTH);
  }

  /** The free government counter: no fee, a three-hour queue. */
  freeQueue(now: Now): Outcome {
    if (now.health >= MAX_HEALTH - 0.5) return this.refuse("You are not ill. The man behind you in the queue asks if you will give him your token.");
    return this.done(now, "Three hours, one token number and four new friends in the queue later, you are treated for free.", FREE_QUEUE_HOURS, 0, MAX_HEALTH);
  }

  // Gym ------------------------------------------------------------------------------------

  /** Whether today's workout would still count. */
  trainedToday(): boolean {
    return this.s.trainedDay === this.s.day;
  }

  /**
   * A finished workout with `good` good reps out of WORKOUT_REPS. The first workout of a day
   * with enough good reps raises fitness by one. @param free a friend pays the day pass
   */
  workout(now: Now, good: number, free = false): Outcome {
    const cost = free ? 0 : GYM_PASS;
    if (cost > now.money) return this.refuse(`A day pass is ₹${GYM_PASS}. The trainer suggests push-ups at home.`);
    const reps = clamp(Math.floor(good), 0, WORKOUT_REPS);
    let message: string;
    if (reps < WORKOUT_GOOD_NEEDED) {
      message = `${reps} of ${WORKOUT_REPS} good reps. The trainer says you lifted more selfies than weights. Not counted.`;
    } else if (this.trainedToday()) {
      message = `${reps} of ${WORKOUT_REPS} good reps. You already trained today: rest days build muscle too. Come back tomorrow.`;
    } else if (this.s.fitness >= MAX_FITNESS) {
      this.s = { ...this.s, trainedDay: this.s.day };
      message = `${reps} of ${WORKOUT_REPS} good reps. Already at top fitness: the trainer asks you to demonstrate for the new joiners.`;
    } else {
      const fitness = this.s.fitness + 1;
      this.s = { ...this.s, fitness, trainedDay: this.s.day };
      message = `${reps} of ${WORKOUT_REPS} good reps. Fitness ${fitness}/${MAX_FITNESS}: sprinting is ${Math.round((sprintFactor(fitness) - 1) * 100)}% faster.`;
    }
    return this.done(now, message, WORKOUT_HOURS, cost);
  }

  // Mall -----------------------------------------------------------------------------------

  /** The escalator queue on the way in. */
  escalator(now: Now): Outcome {
    return this.done(now, "The escalator is jammed with families taking a group photo on every step. Ten minutes to go up one floor.", ESCALATOR_HOURS);
  }

  buySnack(now: Now, id: string): Outcome {
    const snack = SNACKS.find((s) => s.id === id);
    if (!snack) return this.refuse("Sold out.");
    if (snack.price > now.money) return this.refuse(`${snack.name} is ₹${snack.price}. You have ₹${Math.floor(now.money)}.`);
    const health = Math.min(MAX_HEALTH, now.health + snack.health);
    return this.done(now, `${snack.name}: +${snack.health} health.`, 0.1, snack.price, health);
  }

  /** Buy clothes (and get the free socks of the buy-one-get-one offer); you wear them at once. */
  buyOutfit(now: Now, id: string): Outcome {
    const outfit = OUTFITS.find((o) => o.id === id && o.price > 0);
    if (!outfit) return this.refuse("Not for sale.");
    if (this.owns(outfit.id)) return this.refuse(`You already own the ${outfit.name.toLowerCase()}.`);
    if (outfit.price > now.money) return this.refuse(`The ${outfit.name.toLowerCase()} is ₹${outfit.price}. You have ₹${Math.floor(now.money)}.`);
    const socks = !this.owns(FREE_SOCKS);
    this.s = { ...this.s, owned: [...this.s.owned, outfit.id, ...(socks ? [FREE_SOCKS] : [])], outfit: outfit.id };
    const free = socks ? " BUY 1 GET 1*: your free item is a pair of socks (*see small print)." : " The free item is socks again; you already have socks.";
    return this.done(now, `You buy the ${outfit.name.toLowerCase()} and wear it out of the shop.${free}`, 0.25, outfit.price);
  }

  // Cinema ---------------------------------------------------------------------------------

  /**
   * Buy a ticket and watch a film: wait for the next show, then the film. Returns the lines
   * to show while watching. @param free someone else bought the ticket
   */
  watch(now: Now, filmId: string, free = false): Outcome & { readonly lines: readonly string[]; readonly film: Film | null } {
    const film = FILMS.find((f) => f.id === filmId) ?? null;
    if (!film) return { ...this.refuse("No such film."), lines: [], film };
    const cost = free ? 0 : TICKET_PRICE;
    if (cost > now.money) return { ...this.refuse(`A ticket is ₹${TICKET_PRICE}. You have ₹${Math.floor(now.money)}.`), lines: [], film };
    const show = nextShow(now.hour);
    const hours = show.wait + film.runtime;
    this.s = { ...this.s, films: this.s.films.includes(film.id) ? this.s.films : [...this.s.films, film.id] };
    const wait = show.wait > 0.05 ? `You wait in the lobby for the ${clockText(show.start)} show.` : `You walk in just as the ${clockText(show.start)} show starts.`;
    const lines = [
      `${film.title} (${film.genre}). ${wait}`,
      AUDIENCE_MOMENTS.entry,
      film.scenes[0] ?? film.plot,
      AUDIENCE_MOMENTS.phone,
      AUDIENCE_MOMENTS.interval,
      film.scenes[1] ?? film.plot,
      AUDIENCE_MOMENTS.end,
    ];
    const outcome = this.done(now, `${film.title} is over at ${clockText(now.hour + hours)}.`, hours, cost);
    return { ...outcome, lines, film };
  }

  /** Popcorn at the interval rush. */
  popcorn(now: Now): Outcome {
    if (POPCORN_PRICE > now.money) return this.refuse("No money for popcorn. Your neighbour offers you one piece.");
    return this.done(now, `Popcorn, ₹${POPCORN_PRICE}. By the time you are back, your neighbour has eaten a third of it.`, 0, POPCORN_PRICE, Math.min(MAX_HEALTH, now.health + POPCORN_HEALTH));
  }

  // Stories --------------------------------------------------------------------------------

  finishStory(id: string): void {
    if (!this.s.stories.includes(id)) this.s = { ...this.s, stories: [...this.s.stories, id] };
  }

  /** Forget everything (new game). */
  reset(): void {
    this.s = fresh();
  }
}

// Saving -----------------------------------------------------------------------------------

const record = (raw: unknown): Record<string, unknown> => (raw !== null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {});

/**
 * The life state inside the stage save (`cow-progress-v1`), which keeps it under `life`. Saves
 * from before places existed have no `life` and give the starting state.
 */
export function lifeFromSave(saved: unknown): LifeState {
  return parseLife(record(saved).life);
}

/** The stage save with this life state written in, every other field (completed, money) kept. */
export function saveWithLife(saved: unknown, life: LifeState): Record<string, unknown> {
  return { ...record(saved), life };
}

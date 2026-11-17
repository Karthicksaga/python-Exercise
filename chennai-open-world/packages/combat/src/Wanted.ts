/**
 * The wanted level: how hard the police are after the player, from 0 (not wanted) to 5 stars.
 * Crimes add "heat" points; the stars follow from the points, with a minimum for the worse
 * crimes. The level drops one star at a time once no police unit has seen the player for a
 * while (longer at higher levels), and a sighting starts that wait again. At the low levels an
 * officer standing next to a player who keeps still arrests them ("busted").
 *
 * Pure rules: the game says what happened (a crime, whether police can see the player, whether
 * the player is being held) and acts on the events returned. Every number here is a
 * game-design estimate chosen for play, not a model of how a real police force responds.
 */

export type Crime =
  /** A gun fired in the street, outside a story fight. */
  | "gunfire"
  /** A pedestrian knocked down and hurt by the player's vehicle. */
  | "pedestrianInjured"
  /** A pedestrian killed by the player's vehicle. */
  | "pedestrianKilled"
  /** Driving off in a vehicle that isn't the player's and wasn't assigned to them. */
  | "vehicleTheft"
  /** The player's vehicle drove into a police car. */
  | "policeCarRammed"
  /** A bullet hit a police car. */
  | "policeCarShot"
  /** A police officer punched, shot or run into, but still standing. */
  | "officerAssaulted"
  /** A police officer knocked out. */
  | "officerDown";

export interface CrimeRule {
  /** Heat points added. */
  readonly points: number;
  /** The level is at least this many stars afterwards. */
  readonly minStars: number;
  /** The same crime counts again only after this many seconds (one burst of gunfire is one report). */
  readonly every: number;
}

/** All the numbers, game-design estimates. */
export const WANTED = {
  maxStars: 5,
  /** Heat points at which each level starts (index = stars). */
  starAt: [0, 1, 5, 12, 22, 35],
  crimes: {
    gunfire: { points: 1, minStars: 1, every: 3 },
    pedestrianInjured: { points: 3, minStars: 1, every: 0 },
    pedestrianKilled: { points: 6, minStars: 2, every: 0 },
    vehicleTheft: { points: 1, minStars: 1, every: 0 },
    policeCarRammed: { points: 2, minStars: 1, every: 3 },
    policeCarShot: { points: 2, minStars: 1, every: 2 },
    officerAssaulted: { points: 4, minStars: 2, every: 1 },
    officerDown: { points: 10, minStars: 3, every: 0 },
  } satisfies Record<Crime, CrimeRule>,
  /**
   * Seconds unseen by any police unit before the level drops one star (index = stars). One star
   * lasts long enough for the first car (sent from 80-140 m away, about 15 s) to arrive.
   */
  loseAfter: [0, 30, 40, 55, 70, 85],
  /** How far a unit sees the player (with a clear line), metres: from a car, and on foot. */
  sightCar: 70,
  sightOfficer: 45,
  /** Arrest: only up to this level (above it the police shoot instead)... */
  bustUpTo: 2,
  /**
   * ...when an officer is this close, metres, to a player on foot moving slower than `stillBelow` m/s...
   * (officers on foot stop about 2.8 m away: the enemy walking rules treat the player's body as
   * something to step round, so the range reaches them there).
   */
  bustRange: 3.2,
  stillBelow: 0.6,
  /** ...for this long, seconds. */
  bustAfter: 2,
  /** Fine on arrest, rupees (index = stars when caught). */
  bustFine: [0, 500, 1000, 2000, 3500, 5000],
  /** Most police cars and officers on foot out at once (index = stars). Kept small for draw calls. */
  cars: [0, 1, 2, 2, 3, 3],
  officers: [0, 2, 2, 3, 4, 4],
  /** From this level officers come out armed and shoot, and cars ram and box in. */
  armedFrom: 3,
  ramFrom: 3,
  /** From this level the job board takes no new jobs (a job in progress can still be finished or quit). */
  jobsBlockedFrom: 2,
} as const;

export type WantedEvent =
  /** The level rose (a crime). */
  | { readonly type: "raised"; readonly stars: number; readonly crime: Crime }
  /** The level dropped one star after the police lost sight of the player. */
  | { readonly type: "lowered"; readonly stars: number }
  /** The player was arrested. The level is cleared; the game charges `fine` and moves them. */
  | { readonly type: "busted"; readonly stars: number; readonly fine: number };

/** What the police can tell about the player this step. */
export interface WantedSight {
  /** A police unit has a clear view of the player. */
  readonly seen: boolean;
  /** An officer is within `bustRange` of the player, who is on foot and keeping still. */
  readonly held: boolean;
}

/** Stars for a number of heat points. */
export function starsFor(points: number): number {
  let stars = 0;
  for (let i = 1; i <= WANTED.maxStars; i++) if (points >= WANTED.starAt[i]!) stars = i;
  return stars;
}

/** Most police cars and officers out at once at a level, and whether officers are armed. */
export function policeUnits(stars: number): { cars: number; officers: number; armed: boolean; ram: boolean } {
  const s = Math.max(0, Math.min(WANTED.maxStars, Math.floor(stars)));
  return { cars: WANTED.cars[s]!, officers: WANTED.officers[s]!, armed: s >= WANTED.armedFrom, ram: s >= WANTED.ramFrom };
}

/** Whether the job board offers new jobs at this level. */
export function jobsAllowed(stars: number): boolean {
  return stars < WANTED.jobsBlockedFrom;
}

/**
 * Whether getting into a vehicle is a theft: it is not one of the player's own, the current job
 * or story step doesn't ask for that kind, and it hasn't already been taken (and reported, or
 * allowed) before.
 */
export function isVehicleTheft(vehicle: { readonly id: string; readonly kind: string }, rules: { readonly own: readonly string[]; readonly allowedKinds: readonly string[]; readonly taken: ReadonlySet<string> }): boolean {
  if (rules.own.includes(vehicle.id) || rules.taken.has(vehicle.id)) return false;
  return !rules.allowedKinds.includes(vehicle.kind);
}

/**
 * Police officers on foot are ordinary `Combat` enemies (so the pistol, punches and the enemy
 * shooting rules work on them unchanged) in groups named after their car: "police:<car>".
 */
export const POLICE_GROUP = "police:";

export function isPoliceGroup(group: string): boolean {
  return group.startsWith(POLICE_GROUP);
}

export class Wanted {
  /** Heat points; the stars follow from them. */
  points = 0;
  stars = 0;
  /** Seconds since a police unit last saw the player (while wanted). */
  unseenFor = 0;
  /** Seen by police this step (the HUD stars flash). */
  seen = false;
  /** Seconds an officer has been holding the player still. */
  heldFor = 0;
  /** Seconds since each crime was last counted. */
  private readonly since = new Map<Crime, number>();

  /** Count a crime. Returns the event when the level rose, otherwise null. */
  report(crime: Crime): WantedEvent | null {
    const rule: CrimeRule = WANTED.crimes[crime];
    const since = this.since.get(crime);
    if (since !== undefined && since < rule.every) return null;
    this.since.set(crime, 0);
    const before = this.stars;
    this.points += rule.points;
    this.stars = Math.max(starsFor(this.points), rule.minStars, this.stars);
    this.points = Math.max(this.points, WANTED.starAt[this.stars]!);
    // A fresh crime is a fresh report: the search starts again.
    this.unseenFor = 0;
    return this.stars > before ? { type: "raised", stars: this.stars, crime } : null;
  }

  /** Set the level directly (tests and debugging), clearing the timers. */
  set(stars: number): void {
    this.stars = Math.max(0, Math.min(WANTED.maxStars, Math.floor(stars)));
    this.points = WANTED.starAt[this.stars]!;
    this.unseenFor = 0;
    this.heldFor = 0;
  }

  clear(): void {
    this.set(0);
    this.seen = false;
    this.since.clear();
  }

  /** Advance the timers. Returns what happened this step, if anything. */
  update(dt: number, sight: WantedSight): WantedEvent | null {
    for (const [crime, t] of this.since) this.since.set(crime, t + dt);
    this.seen = this.stars > 0 && sight.seen;
    if (this.stars === 0) {
      this.unseenFor = 0;
      this.heldFor = 0;
      return null;
    }
    // Arrest: kept still beside an officer for long enough. Moving away starts it again.
    if (sight.held && this.stars <= WANTED.bustUpTo) {
      this.heldFor += dt;
      if (this.heldFor >= WANTED.bustAfter) {
        const stars = this.stars;
        this.clear();
        return { type: "busted", stars, fine: WANTED.bustFine[stars]! };
      }
    } else {
      this.heldFor = 0;
    }
    if (this.seen) {
      this.unseenFor = 0;
      return null;
    }
    this.unseenFor += dt;
    if (this.unseenFor < WANTED.loseAfter[this.stars]!) return null;
    // Lost: down one star, the heat to the bottom of that level, and the next wait begins.
    this.stars--;
    this.points = WANTED.starAt[this.stars]!;
    this.unseenFor = 0;
    return { type: "lowered", stars: this.stars };
  }
}

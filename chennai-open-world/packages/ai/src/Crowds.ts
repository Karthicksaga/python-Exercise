/**
 * Crowds: the people who stand, sit and stroll near the player, as many as the place calls for
 * (`Places.ts`, TD-31). They are not agents: each square of the map has a fixed set of spots
 * (made from the map the first time it is near, the same every visit), generated at the place's
 * busiest and thinned by the hour, so a beach fills up through the evening without anyone
 * popping in front of the player. On pavements they stand beside the road or stroll a few
 * metres up and down it; on the sand they come in groups that sit, stand or walk together.
 * The game draws them as cheap baked figures (`CrowdFigures`), only round the player, and never
 * more than a hard cap.
 *
 * Pure logic: no rendering and no physics engine.
 */
import { closestOnSegment, roadSegmentsNear, type Road } from "@cow/game-world";
import { placePeak, placePeople, type PlaceKind, type PlaceMap } from "./Places";

export type CrowdPose = "stand" | "walk" | "sit";

/** A fixed spot someone may be at; whether they are there now depends on the hour. */
export interface CrowdSpot {
  readonly x: number;
  readonly z: number;
  /** Facing (the game's yaw: 0 faces -Z). For a stroller, the direction of the walk's first leg. */
  readonly yaw: number;
  readonly pose: CrowdPose;
  /** 0..1: the spot is taken while this is below the place's share of its busiest (by hour). */
  readonly rank: number;
  /** Picks the person drawn (and their shirt). */
  readonly look: number;
  readonly kind: PlaceKind;
  /** Strollers walk this far up and back from the spot, metres, at `speed` m/s. */
  readonly stroll: number;
  readonly speed: number;
}

/** Someone to draw this frame. */
export interface CrowdPerson {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  /** Metres walked so far (picks the walk pose), or null when standing or sitting. */
  readonly walked: number | null;
  readonly sitting: boolean;
  readonly look: number;
  readonly kind: PlaceKind;
}

export interface CrowdOptions {
  /** Side of a crowd square, metres. */
  readonly cell: number;
  /** People are drawn within this distance of the player, metres. */
  readonly radius: number;
  /** Beyond this distance only `farShare` of the spots are taken (cheap at a distance), metres. */
  readonly near: number;
  readonly farShare: number;
  /** Never more than this many at once (the nearest are kept). */
  readonly cap: number;
  /** At most this many new squares are made per call (the rest on the next ones): no long frame on arrival. */
  readonly newCells: number;
}

/**
 * What is built on the ground, which the map index does not hold (buildings stream in chunks):
 * nobody is put inside a building, and a square is made only once what stands on it is known.
 */
export interface CrowdGround {
  /** True once the buildings round this point are known. */
  ready(x: number, z: number): boolean;
  /** True inside (or within a step of) a building. */
  solid(x: number, z: number): boolean;
}

export const CROWD_DEFAULTS: CrowdOptions = { cell: 32, radius: 70, near: 40, farShare: 0.45, cap: 90, newCells: 8 };

/** Room kept round something that moves through a crowd, on top of its own radius, metres. */
const MAKE_WAY = 0.5;
/** Pavement: how far beyond the carriageway's edge people stand, metres (from, plus up to `PAVEMENT_SPREAD`). */
const PAVEMENT_FROM = 1.0;
const PAVEMENT_SPREAD = 1.3;
/** People are not put within this of a road's first or last point (junctions), metres. */
const JUNCTION_CLEAR = 6;

/** What people do at each kind of place: shares of standing and walking (the rest sit, on sand only). */
const POSES: Readonly<Record<PlaceKind, { stand: number; walk: number }>> = {
  beach: { stand: 0.3, walk: 0.2 },
  promenade: { stand: 0.4, walk: 0.6 },
  market: { stand: 0.6, walk: 0.4 },
  station: { stand: 0.7, walk: 0.3 },
  temple: { stand: 0.65, walk: 0.35 },
  "main-road": { stand: 0.45, walk: 0.55 },
  street: { stand: 0.4, walk: 0.6 },
  lane: { stand: 0.35, walk: 0.65 },
};

/** Stable pseudo-random number in [0, 1). */
export function crowdHash(a: number, b: number, c: number): number {
  let t = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b9)) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
  t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
  return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
}

const yawOf = (dx: number, dz: number) => Math.atan2(-dx, -dz);

export class CrowdField {
  readonly options: CrowdOptions;
  private readonly cells = new Map<string, CrowdSpot[]>();
  private readonly out: CrowdPerson[] = [];

  constructor(private readonly places: PlaceMap, private readonly roads: readonly Road[], options: Partial<CrowdOptions> = {}, private readonly ground: CrowdGround | null = null) {
    this.options = { ...CROWD_DEFAULTS, ...options };
  }

  /** The spots of one square (made once, then kept while it is near). */
  spots(col: number, row: number): readonly CrowdSpot[] {
    return this.spotsOf(`${col},${row}`, col, row);
  }

  private spotsOf(key: string, col: number, row: number): CrowdSpot[] {
    let spots = this.cells.get(key);
    if (!spots) {
      spots = [...this.pavementSpots(col, row), ...this.sandSpots(col, row)];
      this.cells.set(key, spots);
    }
    return spots;
  }

  /** Squares made so far (for tests and to keep the cache small). */
  get cellCount(): number {
    return this.cells.size;
  }

  private inCell(x: number, z: number, col: number, row: number): boolean {
    const c = this.options.cell;
    return Math.floor(x / c) === col && Math.floor(z / c) === row;
  }

  /** People beside the roads through a square: evenly along each road, as many as its place's busiest calls for. */
  private pavementSpots(col: number, row: number): CrowdSpot[] {
    const c = this.options.cell;
    const cx = (col + 0.5) * c;
    const cz = (row + 0.5) * c;
    const out: CrowdSpot[] = [];
    const seen = new Set<string>();
    roadSegmentsNear(this.roads, cx, cz, c * 0.75, (road, i) => {
      const key = `${road.id}:${i}`;
      if (seen.has(key) || road.kind === "service") return;
      seen.add(key);
      const kind = this.places.segmentKind(road, i);
      const peak = placePeak(kind);
      if (peak <= 0) return;
      const a = road.points[i]!;
      const b = road.points[i + 1]!;
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length < 1) return;
      const dx = (b.x - a.x) / length;
      const dz = (b.z - a.z) / length;
      const spacing = 100 / peak;
      const footway = road.kind === "footway";
      const startClear = i === 0 ? JUNCTION_CLEAR : 0;
      const endClear = i === road.points.length - 2 ? JUNCTION_CLEAR : 0;
      for (let j = 0; j * spacing < length; j++) {
        const h = (k: number) => crowdHash(road.id, i * 1024 + j, k);
        const along = (j + 0.1 + h(1) * 0.8) * spacing;
        if (along > length - endClear || along < startClear) continue;
        const side = h(2) < 0.5 ? 1 : -1;
        // On a footpath, on the path; beside a road, on its pavement.
        const offset = footway ? (h(3) - 0.5) * road.width : side * (road.width / 2 + PAVEMENT_FROM + h(3) * PAVEMENT_SPREAD);
        const x = a.x + dx * along - dz * offset;
        const z = a.z + dz * along + dx * offset;
        if (!this.inCell(x, z, col, row) || this.onCarriageway(x, z, road) || this.places.inSea(x, z) || this.ground?.solid(x, z)) continue;
        const poses = POSES[kind];
        const p = h(4);
        const walk = p >= poses.stand;
        // Strollers keep to their stretch of road.
        const room = Math.min(along - startClear, length - endClear - along);
        const stroll = walk ? Math.min(room, 3 + h(5) * 6) : 0;
        const forwards = h(6) < 0.5;
        // Standing: turned towards the road or along it.
        const yaw = walk ? yawOf(forwards ? dx : -dx, forwards ? dz : -dz) : yawOf(dz * side, -dx * side) + (h(7) - 0.5) * 2.2;
        out.push({ x, z, yaw, pose: walk && stroll > 1 ? "walk" : "stand", rank: h(8), look: Math.floor(h(9) * 997), kind, stroll: walk && stroll > 1 ? stroll : 0, speed: 0.9 + h(10) * 0.5 });
      }
    });
    return out;
  }

  /** True when a point is on the carriageway of a road other than `own`. */
  private onCarriageway(x: number, z: number, own: Road): boolean {
    let on = false;
    roadSegmentsNear(this.roads, x, z, 16, (road, i) => {
      if (road === own || road.kind === "footway") return;
      if (closestOnSegment({ x, z }, road.points[i]!, road.points[i + 1]!).d2 < (road.width / 2 + 0.6) ** 2) on = true;
      return on;
    });
    return on;
  }

  /** Groups on the sand of a square: sitting in a ring, standing together or walking along. */
  private sandSpots(col: number, row: number): CrowdSpot[] {
    const c = this.options.cell;
    const cx = (col + 0.5) * c;
    const cz = (row + 0.5) * c;
    if (!this.places.nearBeach(cx, cz, c)) return [];
    const out: CrowdSpot[] = [];
    const people = (c * c * placePeak("beach")) / 1000;
    const groups = Math.round(people / 2.5 + crowdHash(col, row, 1) - 0.5);
    for (let g = 0; g < groups; g++) {
      const h = (k: number) => crowdHash(col * 131 + g, row, 100 + k);
      const gx = col * c + h(1) * c;
      const gz = row * c + h(2) * c;
      if (!this.places.onSand(gx, gz) || this.ground?.solid(gx, gz)) continue;
      const poses = POSES.beach;
      const p = h(3);
      const pose: CrowdPose = p < poses.stand ? "stand" : p < poses.stand + poses.walk ? "walk" : "sit";
      // Walkers come alone or in pairs; others in ones to fours.
      const size = pose === "walk" ? 1 + Math.floor(h(4) * 2) : 1 + Math.floor(h(4) * h(5) * 5);
      const heading = h(6) * Math.PI * 2;
      const dirX = -Math.sin(heading);
      const dirZ = -Math.cos(heading);
      const stroll = pose === "walk" ? 6 + h(7) * 10 : 0;
      // The walk stays on the sand at both ends.
      const walking = pose === "walk" && [1, -1].every((e) => this.places.onSand(gx + dirX * stroll * e, gz + dirZ * stroll * e) && !this.ground?.solid(gx + dirX * stroll * e, gz + dirZ * stroll * e));
      const rank = h(8);
      for (let m = 0; m < size; m++) {
        const k = (n: number) => crowdHash(col * 131 + g, row * 7 + m, 300 + n);
        let x: number;
        let z: number;
        let yaw: number;
        if (pose === "walk") {
          // Side by side.
          x = gx - dirZ * m * 0.8;
          z = gz + dirX * m * 0.8;
          yaw = heading;
        } else {
          // In a ring round the group's middle, facing it (alone: facing anywhere).
          const angle = (m / size) * Math.PI * 2 + h(9) * Math.PI;
          const r = size === 1 ? 0 : (pose === "sit" ? 0.75 : 0.6) + k(1) * 0.2;
          x = gx + Math.sin(angle) * r;
          z = gz + Math.cos(angle) * r;
          yaw = size === 1 ? heading : yawOf(gx - x, gz - z);
        }
        if (!this.places.onSand(x, z) || this.ground?.solid(x, z)) continue;
        const walks = pose === "walk" && walking;
        out.push({ x, z, yaw, pose: walks ? "walk" : pose === "walk" ? "stand" : pose, rank, look: Math.floor(k(2) * 997), kind: "beach", stroll: walks ? stroll : 0, speed: 0.8 + h(10) * 0.35 });
      }
    }
    return out;
  }

  /**
   * The people to draw round `focus` at this hour, nearest first, at most `cap`.
   * @param time seconds of game time (strollers' positions follow it)
   * @param avoid things moving through the crowd (the player, their vehicle): people step out of the way
   */
  near(focus: { x: number; z: number }, hour: number, time: number, avoid: ReadonlyArray<{ x: number; z: number; radius: number }> = []): readonly CrowdPerson[] {
    const { cell, radius, near, farShare, cap } = this.options;
    let fresh = this.options.newCells;
    const out = this.out;
    out.length = 0;
    const share = new Map<PlaceKind, number>();
    const shareOf = (kind: PlaceKind) => {
      let s = share.get(kind);
      if (s === undefined) {
        s = placePeople(kind, hour) / placePeak(kind);
        share.set(kind, s);
      }
      return s;
    };
    const distances: number[] = [];
    const c0 = Math.floor((focus.x - radius) / cell);
    const c1 = Math.floor((focus.x + radius) / cell);
    const r0 = Math.floor((focus.z - radius) / cell);
    const r1 = Math.floor((focus.z + radius) / cell);
    for (let col = c0; col <= c1; col++) {
      for (let row = r0; row <= r1; row++) {
        const key = `${col},${row}`;
        if (!this.cells.has(key)) {
          if (this.ground && !this.ground.ready((col + 0.5) * cell, (row + 0.5) * cell)) continue;
          if (fresh-- <= 0) continue;
        }
        for (const spot of this.spotsOf(key, col, row)) {
          const d = Math.hypot(spot.x - focus.x, spot.z - focus.z);
          if (d > radius) continue;
          if (spot.rank >= shareOf(spot.kind) * (d < near ? 1 : farShare)) continue;
          const person = this.personAt(spot, time, avoid);
          out.push(person);
          distances.push(Math.hypot(person.x - focus.x, person.z - focus.z));
        }
      }
    }
    if (out.length > cap) {
      const order = out.map((_, i) => i).sort((a, b) => distances[a]! - distances[b]!);
      const kept = order.slice(0, cap).map((i) => out[i]!);
      out.length = 0;
      out.push(...kept);
    }
    this.forget(focus);
    return out;
  }

  private personAt(spot: CrowdSpot, time: number, avoid: ReadonlyArray<{ x: number; z: number; radius: number }>): CrowdPerson {
    let x = spot.x;
    let z = spot.z;
    let yaw = spot.yaw;
    let walked: number | null = null;
    if (spot.pose === "walk" && spot.stroll > 0) {
      // Up and back along the walk: out `stroll` metres, turn, back past the spot, turn.
      const lap = spot.stroll * 4;
      const distance = time * spot.speed + spot.look * 0.37;
      const u = ((distance % lap) + lap) % lap;
      const s = u < spot.stroll ? u : u < spot.stroll * 3 ? spot.stroll * 2 - u : u - spot.stroll * 4;
      const outwards = u < spot.stroll || u >= spot.stroll * 3;
      const dirX = -Math.sin(spot.yaw);
      const dirZ = -Math.cos(spot.yaw);
      x += dirX * s;
      z += dirZ * s;
      yaw = outwards ? spot.yaw : spot.yaw + Math.PI;
      walked = distance;
    }
    for (const o of avoid) {
      const dx = x - o.x;
      const dz = z - o.z;
      const d = Math.hypot(dx, dz);
      const room = o.radius + MAKE_WAY;
      if (d < room) {
        const k = d > 1e-3 ? room / d : 1;
        x = o.x + (d > 1e-3 ? dx * k : room);
        z = o.z + (d > 1e-3 ? dz * k : 0);
      }
    }
    return { x, z, yaw, walked, sitting: spot.pose === "sit", look: spot.look, kind: spot.kind };
  }

  /** Drop squares far from the player once many are kept. */
  private forget(focus: { x: number; z: number }): void {
    if (this.cells.size < 600) return;
    const c = this.options.cell;
    for (const key of [...this.cells.keys()]) {
      const [col, row] = key.split(",").map(Number) as [number, number];
      if (Math.hypot((col + 0.5) * c - focus.x, (row + 0.5) * c - focus.z) > this.options.radius * 4) this.cells.delete(key);
    }
  }
}

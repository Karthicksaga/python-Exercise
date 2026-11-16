/**
 * Which named area of the city a point is in, and the record of areas the player has visited.
 *
 * OSM maps districts as points (place=suburb, neighbourhood, quarter, locality), not outlines.
 * A point belongs to the nearest district point within `reach` metres: an estimate of the
 * boundaries (Voronoi cells), not their real lines.
 */
import type { District, Point } from "./types";

/** Further than this from every district point, a place is in no named area. */
export const DISTRICT_REACH = 1500;

export class DistrictIndex {
  private readonly cells = new Map<string, District[]>();
  private readonly cell = 1000;

  constructor(readonly districts: readonly District[], private readonly reach = DISTRICT_REACH) {
    for (const d of districts) {
      const key = `${Math.floor(d.x / this.cell)},${Math.floor(d.z / this.cell)}`;
      const list = this.cells.get(key);
      if (list) list.push(d);
      else this.cells.set(key, [d]);
    }
  }

  /** The district a point is in (the nearest within reach), or null. */
  at(p: Point): District | null {
    let best: District | null = null;
    let bestD2 = this.reach * this.reach;
    const span = Math.ceil(this.reach / this.cell);
    const cx = Math.floor(p.x / this.cell);
    const cz = Math.floor(p.z / this.cell);
    for (let i = -span; i <= span; i++) {
      for (let k = -span; k <= span; k++) {
        for (const d of this.cells.get(`${cx + i},${cz + k}`) ?? []) {
          const d2 = (d.x - p.x) ** 2 + (d.z - p.z) ** 2;
          if (d2 < bestD2) {
            bestD2 = d2;
            best = d;
          }
        }
      }
    }
    return best;
  }
}

/** Names of the districts visited, in the order first visited. Saved as a JSON array. */
export class VisitedDistricts {
  private readonly names: string[] = [];

  constructor(saved: unknown = []) {
    if (Array.isArray(saved)) for (const name of saved) if (typeof name === "string" && !this.names.includes(name)) this.names.push(name);
  }

  /** Record a visit; true when the district is new. */
  visit(name: string): boolean {
    if (this.names.includes(name)) return false;
    this.names.push(name);
    return true;
  }

  get count(): number {
    return this.names.length;
  }

  list(): readonly string[] {
    return this.names;
  }

  clear(): void {
    this.names.length = 0;
  }

  /** "Anna Nagar, T. Nagar and 3 more", for sharing. */
  summary(max = 4): string {
    const n = this.names.length;
    if (n === 0) return "";
    if (n <= max) return n === 1 ? this.names[0]! : `${this.names.slice(0, -1).join(", ")} and ${this.names[n - 1]}`;
    return `${this.names.slice(0, max).join(", ")} and ${n - max} more`;
  }
}

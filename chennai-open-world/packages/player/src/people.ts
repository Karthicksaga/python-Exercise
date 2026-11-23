/**
 * The city's people as data: the manifest of character models made by the assets pipeline
 * (`assets/models/people/people.json`, schema in `docs/characters.md`), and the casting rules
 * that decide who plays whom: which people walk the streets, drive the autos, wear the police
 * uniform, wait on a platform. Pure (no Three.js), so it is unit-tested on its own.
 *
 * Safety rule: children and teenagers are never cast in anything that can be hit, shot or hurt
 * (street pedestrians, enemies, police, drivers). They appear only where nothing can harm them:
 * platform crowds (baked, not physics or combat bodies) and as passengers travelling with an adult.
 */

export const SEXES = ["male", "female"] as const;
export type Sex = (typeof SEXES)[number];
export const AGES = ["child", "teen", "young", "middle", "elderly"] as const;
export type Age = (typeof AGES)[number];
export const ROLES = [
  "pedestrian",
  "auto-driver",
  "cab-driver",
  "traffic-police",
  "police",
  "vendor",
  "tea-worker",
  "construction",
  "delivery",
  "shopkeeper",
  "office",
  "college",
  "school",
  "passenger",
] as const;
export type Role = (typeof ROLES)[number];

/** One person of the manifest. Paths are relative to `assets/models/` (and `assets/optimized/`). */
export interface Person {
  readonly id: string;
  readonly file: string;
  /** The cheaper model for figures seen from afar, or null (one is then made at load time). */
  readonly lod1: string | null;
  readonly sex: Sex;
  readonly age: Age;
  readonly roles: readonly Role[];
  /** Standing height in metres, or null when the manifest doesn't give a sensible one (the model's own height is used). */
  readonly heightM: number | null;
  readonly triangles: number;
  readonly lod1Triangles: number;
  readonly texture: number;
}

export interface PeopleManifest {
  readonly people: readonly Person[];
  /** True for the stand-in manifest (`people.fixture.json`) used until the real one exists. */
  readonly fixture: boolean;
}

/** Heights outside this range are treated as a mistake in the manifest (metres). */
const HEIGHT_RANGE = [0.8, 2.2] as const;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const oneOf = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === "string" && (list as readonly string[]).includes(value);
const count = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0);

/**
 * Read a manifest. A broken entry is left out (and reported) rather than stopping the game; a
 * file that isn't a manifest at all throws.
 */
export function parsePeopleManifest(json: unknown): { manifest: PeopleManifest; problems: string[] } {
  if (!isRecord(json) || !Array.isArray(json.people)) throw new Error("People manifest: expected an object with a `people` list.");
  const problems: string[] = [];
  const people: Person[] = [];
  const ids = new Set<string>();
  json.people.forEach((entry: unknown, i) => {
    if (!isRecord(entry)) return void problems.push(`people[${i}]: not an object`);
    const id = entry.id;
    const where = typeof id === "string" && id ? id : `people[${i}]`;
    if (typeof id !== "string" || !id) return void problems.push(`${where}: no id`);
    if (ids.has(id)) return void problems.push(`${where}: id used twice`);
    if (typeof entry.file !== "string" || !/\.glb$/i.test(entry.file)) return void problems.push(`${where}: no .glb file`);
    if (!oneOf(SEXES, entry.sex)) return void problems.push(`${where}: sex must be ${SEXES.join(" or ")}`);
    if (!oneOf(AGES, entry.age)) return void problems.push(`${where}: age must be one of ${AGES.join(", ")}`);
    const roles: Role[] = [];
    for (const role of Array.isArray(entry.roles) ? (entry.roles as unknown[]) : []) {
      if (oneOf(ROLES, role)) {
        if (!roles.includes(role)) roles.push(role);
      } else problems.push(`${where}: unknown role ${String(role)}`);
    }
    if (roles.length === 0) return void problems.push(`${where}: no known role`);
    const h = entry.heightM;
    const heightM = typeof h === "number" && h >= HEIGHT_RANGE[0] && h <= HEIGHT_RANGE[1] ? h : null;
    if (heightM === null && h !== undefined) problems.push(`${where}: heightM ${String(h)} ignored`);
    const lod1 = typeof entry.lod1 === "string" && /\.glb$/i.test(entry.lod1) ? entry.lod1 : null;
    ids.add(id);
    people.push({ id, file: entry.file, lod1, sex: entry.sex, age: entry.age, roles, heightM, triangles: count(entry.triangles), lod1Triangles: count(entry.lod1Triangles), texture: count(entry.texture) });
  });
  return { manifest: { people, fixture: json.fixture === true }, problems };
}

export const isMinor = (person: Pick<Person, "age">): boolean => person.age === "child" || person.age === "teen";

/** What the game casts people as. */
export type Cast =
  /** Walkers on the street (can be run over). */
  | "pedestrian"
  /** Story enemies (stages 7–10) and rival gang members: they fight and get shot. */
  | "enemy"
  /** Police officers on foot (`Police.ts`, combat enemies). */
  | "police"
  /** AI auto drivers, and the drivers of cars, buses and trucks. */
  | "auto-driver"
  | "driver"
  /** Railway platform crowds (baked figures, nothing can hurt them). */
  | "platform"
  /** The station tea-stall seller. */
  | "tea-seller"
  /** Fare and share-auto passengers, bus passengers. */
  | "passenger"
  /** Stage 16's wedding party (in silks: saree, veshti where the models have them). */
  | "wedding"
  /** Ambulance patients. */
  | "patient";

interface Filter {
  readonly roles: readonly Role[];
  readonly sexes?: readonly Sex[];
  readonly ages?: readonly Age[];
}

interface CastRule extends Filter {
  /** Can be hit, shot or hurt: never children or teenagers. */
  readonly hurtable: boolean;
  /** Children and teenagers allowed: always (crowds) or only beside an adult (`withAdult`). */
  readonly minors: "never" | "withAdult" | "yes";
  /** Who stands in when nobody in the manifest has the roles above. */
  readonly fallback?: Filter;
  /** People whose id matches are preferred (outfits the manifest has no field for). */
  readonly prefer?: RegExp;
  /** Clothing tint for a stand-in (someone without the role's own clothes), e.g. a khaki uniform. */
  readonly uniform?: number;
}

const ADULTS: readonly Age[] = ["young", "middle", "elderly"];
const WORKING: readonly Age[] = ["young", "middle"];

/** Who plays whom. Tints are the game's earlier estimates (khaki police and auto shirts). */
export const CASTS: Readonly<Record<Cast, CastRule>> = {
  pedestrian: { roles: ["pedestrian"], hurtable: true, minors: "never" },
  enemy: { roles: ["pedestrian"], sexes: ["male"], ages: WORKING, hurtable: true, minors: "never", fallback: { roles: [...ROLES], sexes: ["male"], ages: WORKING } },
  police: { roles: ["police", "traffic-police"], hurtable: true, minors: "never", uniform: 0xe3cb8f, fallback: { roles: ["pedestrian", "office"], sexes: ["male"], ages: WORKING } },
  "auto-driver": { roles: ["auto-driver"], hurtable: true, minors: "never", uniform: 0xd9c08f, fallback: { roles: ["pedestrian", "construction"], sexes: ["male"], ages: ["middle", "elderly"] } },
  driver: { roles: ["cab-driver"], hurtable: true, minors: "never", fallback: { roles: ["office", "pedestrian", "delivery"], ages: WORKING } },
  platform: { roles: ["passenger", "pedestrian", "office", "college", "school", "vendor"], hurtable: false, minors: "yes" },
  "tea-seller": { roles: ["tea-worker"], ages: ADULTS, hurtable: false, minors: "never", fallback: { roles: ["vendor", "shopkeeper"], ages: ADULTS } },
  passenger: { roles: ["passenger", "pedestrian", "office", "college", "school"], hurtable: false, minors: "withAdult" },
  wedding: { roles: ["passenger", "pedestrian"], hurtable: false, minors: "withAdult", prefer: /saree|sari|veshti|dhoti|silk|pattu|wedding/i },
  patient: { roles: ["passenger", "pedestrian"], ages: ["elderly"], hurtable: false, minors: "never", fallback: { roles: [...ROLES], ages: ["middle", "elderly"] } },
};

const matches = (person: Person, filter: Filter): boolean =>
  person.roles.some((r) => filter.roles.includes(r)) && (!filter.sexes || filter.sexes.includes(person.sex)) && (!filter.ages || filter.ages.includes(person.age));

/**
 * Interleave people so that consecutive picks differ: one of each (sex, age) group in turn,
 * in manifest order within a group. `pool[i % length]` then mixes men and women, old and young.
 */
function interleave(people: readonly Person[]): Person[] {
  const groups = new Map<string, Person[]>();
  for (const p of people) {
    const key = `${p.sex}:${p.age}`;
    const group = groups.get(key) ?? [];
    group.push(p);
    groups.set(key, group);
  }
  const lists = [...groups.values()];
  const out: Person[] = [];
  for (let i = 0; out.length < people.length; i++) for (const list of lists) if (i < list.length) out.push(list[i]!);
  return out;
}

export interface CastOptions {
  /** The person travels with an adult (a fare party's second member on): children may be cast. */
  readonly withAdult?: boolean;
}

/**
 * Everyone who can play `cast`, interleaved for variety (see `pickPerson`). Empty when the
 * manifest has nobody suitable; the game then uses the player's model.
 */
export function castPool(people: readonly Person[], cast: Cast, options: CastOptions = {}): Person[] {
  const rule = CASTS[cast];
  const minorsOk = !rule.hurtable && (rule.minors === "yes" || (rule.minors === "withAdult" && options.withAdult === true));
  const allowed = people.filter((p) => minorsOk || !isMinor(p));
  let pool = allowed.filter((p) => matches(p, rule));
  const fallback = rule.fallback;
  if (pool.length === 0 && fallback) pool = allowed.filter((p) => matches(p, fallback));
  // A small manifest: any adult of the stand-in's sex (an auto driver stays a man), then any adult.
  const sexes = fallback?.sexes ?? rule.sexes;
  if (pool.length === 0) pool = allowed.filter((p) => !isMinor(p) && (!sexes || sexes.includes(p.sex)) && (!rule.ages || rule.ages.includes(p.age)));
  if (pool.length === 0) pool = allowed.filter((p) => !isMinor(p) && (!rule.ages || rule.ages.includes(p.age)));
  if (rule.prefer) {
    const preferred = pool.filter((p) => rule.prefer!.test(p.id));
    if (preferred.length > 0) pool = preferred;
  }
  return interleave(pool);
}

/** The `index`-th person of a pool: consecutive indices give different people while there are any. */
export function pickPerson<T>(pool: readonly T[], index: number): T | null {
  if (pool.length === 0) return null;
  const i = ((Math.trunc(index) % pool.length) + pool.length) % pool.length;
  return pool[i]!;
}

/** True when `person` wears the cast's own clothes (has one of its roles), so no uniform tint is laid over them. */
export function dressedFor(person: Person, cast: Cast): boolean {
  return person.roles.some((r) => CASTS[cast].roles.includes(r));
}

/** The clothing tint a person needs for a cast: the uniform for a stand-in, else none. */
export function uniformFor(person: Person | null, cast: Cast): number | undefined {
  const uniform = CASTS[cast].uniform;
  if (uniform === undefined) return undefined;
  return person && dressedFor(person, cast) ? undefined : uniform;
}

/**
 * Up to `count` different people from a pool, chosen to differ as much as possible: each next
 * one adds an age and a sex not yet chosen where the pool has one (pool order breaks ties). For
 * crowds baked into a few models.
 */
export function diverseCast(pool: readonly Person[], count: number): Person[] {
  const left = [...pool];
  const out: Person[] = [];
  while (out.length < count && left.length > 0) {
    const novelty = (p: Person) => (out.some((o) => o.age === p.age) ? 0 : 2) + (out.some((o) => o.sex === p.sex) ? 0 : 1);
    let best = 0;
    for (let i = 1; i < left.length; i++) if (novelty(left[i]!) > novelty(left[best]!)) best = i;
    out.push(left.splice(best, 1)[0]!);
  }
  return out;
}

/**
 * Who a platform crowd is made of: up to `count` different people (men and women, elderly,
 * students, children: nothing on a platform can hurt them), and the tea-stall seller.
 */
export function platformCast(people: readonly Person[], count = 4): { people: string[]; seller: string | null } {
  return {
    people: diverseCast(castPool(people, "platform"), count).map((p) => p.id),
    seller: pickPerson(castPool(people, "tea-seller"), 0)?.id ?? null,
  };
}

/**
 * Who the street and beach crowds are made of (TD-31): a few different pedestrians (adults only:
 * vehicles pass among them), each baked into cheap poses, so the more people the fewer draw calls
 * per person.
 */
export function streetCrowdCast(people: readonly Person[], count = 5): { people: string[] } {
  return { people: diverseCast(castPool(people, "pedestrian"), count).map((p) => p.id) };
}

/** Distance beyond which an animated figure is drawn with its cheaper model (metres). */
export const LOD1_FROM = 30;
/** Hysteresis, so a figure walking at the boundary doesn't flicker between the two (metres). */
const LOD_MARGIN = 2;

/** Which model a figure at `distance` should show, given the one it shows now (0 detailed, 1 cheap). */
export function detailFor(distance: number, current: 0 | 1): 0 | 1 {
  if (current === 0) return distance > LOD1_FROM + LOD_MARGIN ? 1 : 0;
  return distance < LOD1_FROM - LOD_MARGIN ? 0 : 1;
}

/**
 * Scale and ground lift for a character measured in rest pose (`low`, `high`: lowest and highest
 * point, model units): drawn `heightM` tall when given, else `fallbackScale` times its own size,
 * with `sole` (its lowest vertex; `low` when not given) on the ground.
 */
export function fitHeight(measured: { readonly low: number; readonly high: number }, heightM: number | null, fallbackScale: number, sole = measured.low): { scale: number; lift: number } {
  const size = Math.max(0.01, measured.high - measured.low);
  const scale = heightM !== null ? heightM / size : fallbackScale;
  return { scale, lift: -sole * scale };
}

/**
 * How much longer (or shorter) this person's stride is than the player's, from hip heights in
 * metres: the walk and run clips are rotations only, so a shorter leg covers less ground per
 * cycle and has to play faster to keep its feet from sliding. Clamped to sensible bodies.
 */
export function strideScale(hipHeight: number, referenceHip: number): number {
  if (!(hipHeight > 0) || !(referenceHip > 0)) return 1;
  return Math.min(1.3, Math.max(0.45, hipHeight / referenceHip));
}

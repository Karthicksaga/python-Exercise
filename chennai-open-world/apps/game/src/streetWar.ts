/**
 * The street war: three rival gangs holding districts of central Chennai, weapons lying in the
 * world, and five story stages (11 to 15) that follow the Roundtana showdown. Built from the
 * city map (the first ten stages stay in the Anna Nagar home square), deterministic for a map.
 *
 * Real: the districts (OSM place points), the roads and their names, the mapped tea shop and
 * clock tower the stages meet at (their names are never shown). Invented: the gangs, their
 * names and colours, every person, the stories, rewards and the exact corners.
 */
import { nearestRoadPoint, type Point, type Road, type WorldMap } from "@cow/game-world";
import type { EnemySpot, PickupSpot, WeaponId } from "@cow/combat";
import type { Mission, Objective } from "@cow/missions";
import type { Parking } from "./content";

export interface Gang {
  readonly id: string;
  /** Invented name, shown in messages. */
  readonly name: string;
  /** What the name means, for the brief. */
  readonly meaning: string;
  /** Clothing tint worn by its members. */
  readonly colour: number;
  /** District it holds (an OSM place name). */
  readonly district: string;
}

/** Original gangs; no real group, person or business is meant. */
export const GANGS: readonly Gang[] = [
  { id: "puli", name: "Manjal Puli", meaning: "Yellow Tigers", colour: 0xe0b020, district: "Royapettah" },
  { id: "nandu", name: "Neela Nandu", meaning: "Blue Crabs", colour: 0x3a86c8, district: "Triplicane" },
  { id: "paambu", name: "Pachai Paambu", meaning: "Green Snakes", colour: 0x4f9a45, district: "Egmore" },
];

/** A crew of a gang hanging around one corner of its turf. */
export interface Crew {
  /** Combat group name: `gang:<gang>:<corner>`. */
  readonly id: string;
  readonly gang: string;
  /** Centre of the corner. */
  readonly x: number;
  readonly z: number;
  readonly members: EnemySpot[];
  /** The middle of the street beside the corner, where someone walking up would be. */
  readonly street: Point;
}

export interface StreetWar {
  readonly gangs: readonly Gang[];
  readonly crews: Crew[];
  readonly missions: Mission[];
  readonly enemies: Record<string, EnemySpot[]>;
  readonly parking: Parking[];
  readonly pickups: PickupSpot[];
}

type Hit = Point & { heading: number; road: Road };

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const round = (p: Point): Point => ({ x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 });
/** Time allowed to ride from a to b: road distance is longer than the straight line. */
const allow = (a: Point, b: Point, speed: number) => Math.round((distance(a, b) * 1.5) / speed + 25);

/**
 * A continuous path along one named road from near `start`: its pieces chained end to end
 * (OSM splits a road at every junction), until it is `length` metres long or the road ends.
 */
export function roadPathOn(streets: Pick<WorldMap, "roads">, name: string, start: Point, length: number): Point[] {
  const pieces = streets.roads.filter((r) => r.name === name);
  const first = nearestRoadPoint({ roads: pieces }, start);
  if (!first) return [start];
  const used = new Set<Road>([first.road]);
  // Begin at the start point and run to the far end of its piece.
  const pts = first.road.points;
  const fromStart = distance(pts[0]!, start) < distance(pts[pts.length - 1]!, start);
  const path: Point[] = [round(first)];
  const ordered = fromStart ? pts : [...pts].reverse();
  // The segment the start lies on: carry on from its far point.
  let index = 1;
  let best = Infinity;
  for (let i = 0; i < ordered.length - 1; i++) {
    const a = ordered[i]!;
    const b = ordered[i + 1]!;
    const ab = distance(a, b);
    const off = distance(a, first) + distance(first, b) - ab;
    if (off < best) {
      best = off;
      index = i + 1;
    }
  }
  for (const p of ordered.slice(index)) if (distance(p, path[path.length - 1]!) > 1) path.push(round(p));
  let total = 0;
  const measure = () => {
    total = 0;
    for (let i = 1; i < path.length; i++) total += distance(path[i]!, path[i - 1]!);
  };
  measure();
  while (total < length) {
    const end = path[path.length - 1]!;
    const next = pieces.find((r) => !used.has(r) && (distance(r.points[0]!, end) < 3 || distance(r.points[r.points.length - 1]!, end) < 3));
    if (!next) break;
    used.add(next);
    const points = distance(next.points[0]!, end) < 3 ? next.points : [...next.points].reverse();
    for (const p of points.slice(1)) path.push(round(p));
    measure();
  }
  return path;
}

export function buildStreetWar(city: WorldMap): StreetWar {
  const streets: Pick<WorldMap, "roads"> = { roads: city.roads.filter((r) => r.kind !== "footway" && r.kind !== "service") };
  const named = (name: string): Pick<WorldMap, "roads"> => ({ roads: streets.roads.filter((r) => r.name === name) });
  const district = (name: string): Point => city.districts?.find((d) => d.name === name) ?? { x: 0, z: 0 };
  /** The nearest point on a road (that road by name if given and within 700 m, else any street). */
  const snap = (p: Point, road?: string): Hit => {
    const hit = (road ? nearestRoadPoint(named(road), p) : null) ?? nearestRoadPoint(streets, p);
    if (!hit || (road && hit.distance > 700)) {
      const any = nearestRoadPoint(streets, p);
      return any ? { x: any.x, z: any.z, heading: any.heading, road: any.road } : ({ ...p, heading: 0, road: streets.roads[0]! } as Hit);
    }
    return { x: hit.x, z: hit.z, heading: hit.heading, road: hit.road };
  };
  /** Along a road's heading by `metres` (0 = north, -Z). */
  const along = (p: Hit, metres: number): Point => ({ x: p.x - Math.sin(p.heading) * metres, z: p.z - Math.cos(p.heading) * metres });
  /** The pavement edge beside a road point: right of its direction (side 1) or left (-1). */
  const pavement = (p: Hit, side: 1 | -1, extra = 1.2): Point => {
    const out = p.road.width / 2 + extra;
    return round({ x: p.x + Math.cos(p.heading) * out * side, z: p.z - Math.sin(p.heading) * out * side });
  };
  const kerb = (p: Hit): { x: number; z: number; yaw: number } => {
    const side = Math.max(0.2, p.road.width / 2 - 1.3);
    return { x: Math.round((p.x + Math.cos(p.heading) * side) * 10) / 10, z: Math.round((p.z - Math.sin(p.heading) * side) * 10) / 10, yaw: p.heading };
  };
  /** People a few metres apart along the pavement round a point, facing the road. */
  const huddle = (centre: Hit, side: 1 | -1, people: ReadonlyArray<readonly [WeaponId, number?]>, tint: number, calm: boolean): EnemySpot[] =>
    people.map(([weapon, health], i) => {
      // Just off the carriageway: pavements are not mapped and on many streets the buildings
      // start a metre or two further back (a figure placed inside one could never be reached).
      const spot = pavement({ ...centre, ...along(centre, (i - (people.length - 1) / 2) * 2.2) }, side, 0.5 + (i % 2) * 0.5);
      return { ...spot, armed: weapon === "pistol" || weapon === "shotgun" || weapon === "smg", weapon, tint, ...(calm ? { calm } : {}), ...(health ? { health } : {}) };
    });

  const roadPath = (name: string, start: Point, length: number): Point[] => roadPathOn(streets, name, start, length);

  const gang = (id: string) => GANGS.find((g) => g.id === id)!;
  const crews: Crew[] = [];
  const enemies: Record<string, EnemySpot[]> = {};
  const parking: Parking[] = [];
  const pickups: PickupSpot[] = [];

  // --- Turf: two corners for each gang, on its district's main streets. -------------------
  const corners: Record<string, ReadonlyArray<readonly [string, number, 1 | -1]>> = {
    // [road, metres along it from the point nearest the district centre, side]
    puli: [["Royapettah High Road", 0, 1], ["Bharathi Salai", -60, -1]],
    nandu: [["Triplicane High Road", 40, 1], ["KMS Street", 0, -1]],
    paambu: [["Casa Major Road", 0, 1], ["Halls Road", 30, -1]],
  };
  // Each crew: someone with a pistol, someone with a bat, and one with bare fists.
  const crewArms: ReadonlyArray<readonly [WeaponId]> = [["pistol"], ["bat"], ["fists"]];
  for (const g of GANGS) {
    const centre = district(g.district);
    (corners[g.id] ?? []).forEach(([road, metres, side], i) => {
      const base = snap(centre, road);
      // Slide along the road until the whole crew stands beside it, not out in a junction
      // where another road is nearer.
      let members = huddle(snap(along(base, metres), road), side, crewArms, g.colour, true);
      for (const slide of [30, -30, 60, -60, 90, -90]) {
        const clear = members.every((m) => {
          const hit = nearestRoadPoint(city, m);
          return hit !== null && hit.distance > hit.road.width / 2 - 0.5;
        });
        if (clear) break;
        members = huddle(snap(along(base, metres + slide), road), side, crewArms, g.colour, true);
      }
      const street = nearestRoadPoint(city, members[1]!);
      crews.push({ id: `gang:${g.id}:${i}`, gang: g.id, ...round(members[1]!), members, street: street ? round(street) : round(members[1]!) });
    });
  }

  // --- Stage 11: the courier. A Manjal Puli rider carries the week's protection money down
  // Peters Road; stop him with a car and take the bag to the tea shop he collected it from.
  const puli = gang("puli");
  const nandu = gang("nandu");
  const paambu = gang("paambu");
  const royapettah = district("Royapettah");
  const triplicane = district("Triplicane");
  const egmore = district("Egmore");
  const chaseStart = snap(royapettah, "Peters Road");
  const courierPath = roadPath("Peters Road", chaseStart, 1100);
  // The player waits 45 m behind where the courier sets off, so he rides away from them.
  const [p0, p1] = [courierPath[0]!, courierPath[1] ?? courierPath[0]!];
  const away = Math.max(0.01, distance(p0, p1));
  const waitAt = snap({ x: p0.x - ((p1.x - p0.x) / away) * 45, z: p0.z - ((p1.z - p0.z) / away) * 45 }, "Peters Road");
  parking.push({ id: "car-royapettah", kind: "car", ...kerb(snap(along(chaseStart, -90), "Peters Road")), color: 0x8a8f99 });

  // The tea shop: the mapped cafe or restaurant nearest Triplicane High Road near the district centre.
  const highRoad = snap(triplicane, "Triplicane High Road");
  const eateries = city.pois.filter((p) => (p.kind === "cafe" || p.kind === "restaurant") && distance(p, highRoad) < 500);
  eateries.sort((a, b) => distance(a, highRoad) - distance(b, highRoad));
  const shop = snap(eateries[0] ?? highRoad, "Triplicane High Road");
  const shopDoor = pavement(shop, 1, 0.8);

  const reach = (label: string, p: Point, extra: Partial<Extract<Objective, { type: "reach" }>> = {}): Objective => ({ type: "reach", label, x: p.x, z: p.z, radius: 6, ...extra });
  const fight = (label: string, group: string, p: Point, radius = 14): Objective => ({ type: "defeat", label, group, x: p.x, z: p.z, radius });

  // --- Stage 12: the racket. The Neela Nandu come to the same tea shop for their cut.
  const racketFrom = snap(along(shop, 22), "Triplicane High Road");
  enemies.racket = huddle(racketFrom, 1, [["bat"], ["bat"], ["fists"], ["pistol"]], nandu.colour, false);

  // --- Stage 13: the drive-by escape. A Neela Nandu crew spots you collecting a bike on KMS
  // Street; ride out of Triplicane to the Marina beach road before they get you.
  const kms = snap(triplicane, "KMS Street");
  parking.push({ id: "bike-triplicane", kind: "bike", ...kerb(kms), color: 0x7a1f2b });
  const marina = city.landmarks?.find((l) => l.id === "marina-beach") ?? { x: 7992, z: 3422 };
  const beachRoad = nearestRoadPoint({ roads: streets.roads.filter((r) => r.name === "Kamarajar Salai") }, { x: (kms.x + marina.x) / 2 + 300, z: kms.z });
  const safe = beachRoad && distance(beachRoad, kms) < 2000 ? round(beachRoad) : round(snap(marina));
  const ambushCentre = snap(along(kms, 18), "KMS Street");
  enemies.driveby = [...huddle(ambushCentre, 1, [["smg"], ["pistol"]], nandu.colour, false), ...huddle(snap(along(kms, -20), "KMS Street"), -1, [["pistol"], ["bat"]], nandu.colour, false)];

  // --- Stage 14: the Pachai Paambu hideout, a back street in Egmore. Six of them, well armed.
  const hideout = snap(egmore, "Narayana M Street");
  enemies.hideout = [
    ...huddle(hideout, 1, [["shotgun"], ["pistol"], ["bat"]], paambu.colour, false),
    ...huddle(snap(along(hideout, 14), "Narayana M Street"), -1, [["smg"], ["pistol"], ["fists"]], paambu.colour, false),
  ];

  // --- Stage 15: the turf war. The Manjal Puli boss calls every crew to the Royapettah clock
  // tower junction to settle it.
  const clock = city.pois.find((p) => p.kind === "clock" && distance(p, royapettah) < 900);
  const tower = snap(clock ?? royapettah);
  enemies.turf = [
    ...huddle(tower, 1, [["shotgun", 320], ["smg"], ["bat"]], puli.colour, false),
    ...huddle(snap(along(tower, 16)), -1, [["pistol"], ["pistol"], ["fists"]], puli.colour, false),
    ...huddle(snap(along(tower, -16)), 1, [["smg"], ["bat"]], nandu.colour, false),
  ];

  const missions: Mission[] = [
    {
      id: "courier-chase",
      stage: 11,
      title: "Courier chase",
      brief: `With the boss gone, three gangs want his streets. The ${puli.name} (${puli.meaning}) send a rider down Peters Road in Royapettah with the week's protection money. Take a car and stop him.`,
      reward: 2200,
      objectives: [
        reach("Go to Peters Road, Royapettah", waitAt, { radius: 30 }),
        { type: "enter", label: "Get in a car", vehicle: "car" },
        reach("Wait on Peters Road for the courier", waitAt, { mode: "car", radius: 14 }),
        { type: "chase", label: "Catch the courier: pull up beside him", path: courierPath, speed: 11, radius: 5, quarry: "bike" },
        reach("Take the money back to the tea shop, Triplicane High Road", shopDoor, { radius: 8, stop: true }),
      ],
    },
    {
      id: "tea-shop",
      stage: 12,
      title: "Protection money",
      brief: `The tea shop's owner paid the ${puli.name} for years. Now the ${nandu.name} (${nandu.meaning}) want a cut too, and four of them are walking up the street. Stand with him. He keeps an old shotgun under the counter for you.`,
      reward: 2500,
      weapons: [{ id: "shotgun", ammo: 14 }],
      objectives: [reach("Wait at the tea shop", shopDoor, { radius: 10 }), fight("Send the racket packing", "racket", racketFrom, 16)],
    },
    {
      id: "drive-by",
      stage: 13,
      title: "Hot wheels",
      brief: `Word is out that you took the ${nandu.name}'s money. A friend left you a motorbike on KMS Street; the crew is waiting by it. Get on and ride for the Marina beach road.`,
      reward: 2000,
      weapons: [{ id: "smg", ammo: 90 }],
      objectives: [
        reach("Go to KMS Street, Triplicane", kms, { radius: 24 }),
        { type: "enter", label: "Get on the motorbike", vehicle: "bike" },
        reach("Ride to the beach road before they get you", safe, { mode: "bike", radius: 12, hostiles: "driveby", timeLimit: allow(kms, safe, 8) }),
      ],
    },
    {
      id: "snake-pit",
      stage: 14,
      title: "Snake pit",
      brief: `The ${paambu.name} (${paambu.meaning}) of Egmore have been arming both sides. Their hideout is a back street off Pantheon Road. Six of them, with shotguns and an SMG. Clear it out.`,
      reward: 3500,
      weapons: [{ id: "shotgun", ammo: 16 }],
      objectives: [reach("Find the hideout, Egmore", hideout, { radius: 26 }), fight("Clear out the hideout", "hideout", hideout, 18)],
    },
    {
      id: "turf-war",
      stage: 15,
      title: "Turf war",
      brief: `The ${puli.name} boss has called every crew he has left to the clock tower junction in Royapettah to finish this. So have you.`,
      reward: 6000,
      weapons: [{ id: "smg", ammo: 120 }],
      objectives: [reach("Go to the clock tower, Royapettah", tower, { radius: 28 }), fight("Win the turf war", "turf", tower, 20)],
    },
  ];

  // --- Weapons lying in the world: a bat in Anna Nagar, rounds and guns in the gang districts.
  const anna = district("Anna Nagar");
  const lie = (id: string, weapon: WeaponId, ammo: number, near: Point, road?: string, side: 1 | -1 = 1) => {
    pickups.push({ id, weapon, ammo, ...pavement(snap(near, road), side, 0.6) });
  };
  lie("bat-anna-nagar", "bat", 0, { x: anna.x + 120, z: anna.z + 470 });
  lie("pistol-anna-nagar", "pistol", 24, { x: anna.x - 180, z: anna.z + 300 });
  lie("shotgun-royapettah", "shotgun", 10, royapettah, "Muthu Street", -1);
  lie("pistol-triplicane", "pistol", 24, triplicane, "Ellis Road");
  lie("smg-egmore", "smg", 90, egmore, "Shiyali Street");
  lie("shotgun-egmore", "shotgun", 8, { x: hideout.x + 60, z: hideout.z }, "Narayana M Street", -1);

  return { gangs: GANGS, crews, missions, enemies, parking, pickups };
}

/**
 * Jobs across the whole city, far from Anna Nagar: the Marina evening drive (T. Nagar to Marina
 * Beach, keeping off Anna Salai), a hospital transfer from Egmore to Royapettah, and a bus run
 * along Anna Salai's mapped bus stops. Built from the city map (not the home square), with the
 * vehicles they need parked near their starts. Deterministic for a given map.
 *
 * Real: the landmarks, roads, hospital positions and bus stops (and the stops' OSM names).
 * Invented: the stories, times, pay, and the approximate points the searches start from.
 * Hospital names are never shown, only the street they are on.
 */
import { insideBounds, nearestRoadPoint, type District, type Point, type Road, type WorldMap } from "@cow/game-world";
import { busCrowd, type AvoidPoint, type Job } from "@cow/missions";
import { fareAt } from "./fareSpots";
import type { Parking } from "./content";

/** Anna Salai's name in the extract, and the samples of it the evening drive avoids. */
export const ANNA_SALAI = "Anna Salai (Mount Road)";
const AVOID_STEP = 25;
const AVOID_MARGIN = 3;
/** Evening window for the Marina drive, game hours. */
export const MARINA_HOURS = { from: 16, to: 20.5 } as const;

type RoadMap = Pick<WorldMap, "roads">;

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
/** Time allowed to drive from a to b: road distance is longer than the straight line. */
const allow = (a: Point, b: Point, speed: number) => Math.round((distance(a, b) * 1.5) / speed + 25);
const road = (a: Point, b: Point) => distance(a, b) * 1.4;
const round = (p: Point): Point => ({ x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 });
const roadsOf = (city: WorldMap, keep: (r: Road) => boolean): RoadMap => ({ roads: city.roads.filter(keep) });

/** Nearest point on one of these roads, or null when there is none. */
function snap(roads: RoadMap, p: Point): (Point & { heading: number; road: Road; distance: number }) | null {
  const hit = nearestRoadPoint(roads, p);
  return hit ? { x: hit.x, z: hit.z, heading: hit.heading, road: hit.road, distance: hit.distance } : null;
}

/** A parking place at the kerb of the nearest of these roads, facing along it. */
function kerb(roads: RoadMap, p: Point): { x: number; z: number; yaw: number } {
  const hit = nearestRoadPoint(roads, p);
  if (!hit) return { ...p, yaw: 0 };
  const side = Math.max(0.2, hit.road.width / 2 - 1.3);
  return { x: hit.x + Math.cos(hit.heading) * side, z: hit.z - Math.sin(hit.heading) * side, yaw: hit.heading };
}

/** The road a hit is on and its other pieces with the same name, for parking along it. */
const sameRoad = (city: WorldMap, piece: Road): RoadMap => ({ roads: city.roads.filter((r) => r === piece || (piece.name !== undefined && r.name === piece.name && r.kind !== "footway")) });

/** A point `metres` along a heading (0 = north, -Z). Negative goes back. */
const along = (p: Point & { heading: number }, metres: number): Point => ({ x: p.x - Math.sin(p.heading) * metres, z: p.z - Math.cos(p.heading) * metres });

/**
 * Park at the kerb about `metres` behind a stop, or ahead of it when the road ends behind it,
 * so the vehicle is near the stop without sitting in its marker.
 */
function parkNear(roads: RoadMap, stop: Point & { heading: number }, metres: number): { x: number; z: number; yaw: number } {
  const behind = kerb(roads, along(stop, -metres));
  const ahead = kerb(roads, along(stop, metres));
  return distance(behind, stop) >= metres * 0.7 || distance(behind, stop) >= distance(ahead, stop) ? behind : ahead;
}

/**
 * The avoid corridor: points every `AVOID_STEP` metres along the named road's pieces inside
 * `box`. Each radius reaches half the carriageway plus a margin to the side, and half a step
 * along it, so the circles leave no gap between samples.
 */
export function corridor(roads: readonly Road[], name: string, box: { minX: number; maxX: number; minZ: number; maxZ: number }): AvoidPoint[] {
  const points: AvoidPoint[] = [];
  for (const piece of roads) {
    if (piece.name !== name) continue;
    const radius = Math.round(Math.hypot(piece.width / 2 + AVOID_MARGIN, AVOID_STEP / 2) * 10) / 10;
    let carry = 0;
    for (let i = 0; i < piece.points.length - 1; i++) {
      const a = piece.points[i]!;
      const b = piece.points[i + 1]!;
      const length = distance(a, b);
      for (let d = carry; d < length; d += AVOID_STEP) {
        const p = round({ x: a.x + ((b.x - a.x) * d) / length, z: a.z + ((b.z - a.z) * d) / length });
        if (insideBounds(p, box)) points.push({ ...p, radius });
      }
      carry = (((carry - length) % AVOID_STEP) + AVOID_STEP) % AVOID_STEP;
    }
    // The far end of each piece, so short pieces are covered too.
    const end = round(piece.points[piece.points.length - 1]!);
    if (insideBounds(end, box)) points.push({ ...end, radius });
  }
  // Drop samples that another sample already covers almost entirely.
  const kept: AvoidPoint[] = [];
  for (const p of points) if (!kept.some((k) => distance(k, p) < 6 && k.radius >= p.radius)) kept.push(p);
  return kept;
}

/** Hospitals that take patients: no clinics, eye, dental or diabetes centres. */
const isHospital = (name: string | undefined) => !/clinic|clini\b|eye|dental|diabet|nethralaya|optical|e ?n ?t\b|gastro|health|police|centre/i.test(name ?? "");

export function cityJobs(city: WorldMap): { jobs: Job[]; parking: Parking[] } {
  const streets = roadsOf(city, (r) => r.kind !== "footway" && r.kind !== "service");
  const streetOf = (p: Point): string => {
    const hit = nearestRoadPoint(streets, p);
    return hit?.road.name ? ` on ${hit.road.name}` : "";
  };
  const onStreet = (p: Point): Point => {
    const hit = snap(streets, p);
    return hit ? round(hit) : p;
  };
  const landmark = (id: string, fallback: Point): Point => city.landmarks?.find((l) => l.id === id) ?? fallback;
  const district = (name: string, fallback: Point): Point => city.districts?.find((d: District) => d.name === name) ?? fallback;
  const jobs: Job[] = [];
  const parking: Parking[] = [];

  // 1. Marina evening drive: T. Nagar to Marina Beach, keeping off Anna Salai.
  const tNagar = landmark("t-nagar", { x: 2543, z: 5160 });
  const marina = landmark("marina-beach", { x: 7992, z: 3422 });
  // Sir Thyagaraya Road, T. Nagar's shopping street, where it is closest to T. Nagar's centre.
  const thyagaraya = snap(roadsOf(city, (r) => r.name === "Sir Thyagaraya Road"), tNagar);
  const pickupHit = thyagaraya && thyagaraya.distance < 600 ? thyagaraya : snap(streets, tNagar);
  const pickup = pickupHit ? round(pickupHit) : tNagar;
  // The beach road along the Marina (Kamarajar Salai), opposite the beach landmark.
  const beachRoad = snap(roadsOf(city, (r) => r.name === "Kamarajar Salai" && r.kind === "primary"), marina);
  const drop = beachRoad && beachRoad.distance < 400 ? round(beachRoad) : onStreet(marina);
  // Anna Salai between T. Nagar and the Marina: the stretch in the box round the two ends.
  const reach = 1200;
  const box = {
    minX: Math.min(pickup.x, drop.x) - reach,
    maxX: Math.max(pickup.x, drop.x) + reach,
    minZ: Math.min(pickup.z, drop.z) - reach,
    maxZ: Math.max(pickup.z, drop.z) + reach,
  };
  const annaSalai = corridor(city.roads, ANNA_SALAI, box);
  // A hatchback a little way back along Sir Thyagaraya Road, for players who come on foot.
  if (pickupHit) parking.push({ id: "car-tnagar", kind: "car", ...parkNear(sameRoad(city, pickupHit.road), pickupHit, 35), color: 0x2f6fb5 });
  jobs.push({
    id: "marina-evening",
    kind: "cab",
    title: "Marina evening drive",
    brief: `Take a friend from T. Nagar to Marina Beach for the evening breeze. Anna Salai is jammed at this hour: cross it, don't drive along it. Evenings only (${MARINA_HOURS.from}:00–20:30); the clock starts at the pick-up.`,
    vehicle: "car",
    stops: [
      { label: `Pick up your friend${streetOf(pickup)}, T. Nagar`, ...pickup, radius: 8, dwell: 3, fare: fareAt(city, pickup, { board: 1 }) },
      // They get out on the beach side of the road.
      { label: "Drop them at Marina Beach, on the beach road", ...drop, radius: 10, dwell: 2, fare: fareAt(city, drop, { alight: 1 }, marina) },
    ],
    // About 6 km of evening city driving, with room to go round Anna Salai.
    timeLimit: allow(pickup, drop, 10) + 60,
    payout: Math.round(150 + road(pickup, drop) * 0.2),
    fine: 120,
    hours: MARINA_HOURS,
    avoid: { name: "Anna Salai", points: annaSalai, grace: 25 },
    startRadius: 400,
  });

  // 2. Hospital transfer from Egmore to Royapettah: the nearest mapped hospital to each.
  const hospitals = city.pois.filter((p) => p.kind === "hospital" && isHospital(p.name));
  const nearestHospital = (to: Point): Point | null => {
    let best: Point | null = null;
    for (const h of hospitals) if (distance(h, to) < 1200 && (!best || distance(h, to) < distance(best, to))) best = h;
    return best;
  };
  const egmore = district("Egmore", { x: 5154, z: 1353 });
  const royapettah = district("Royapettah", { x: 5835, z: 3283 });
  const from = nearestHospital(egmore);
  const to = nearestHospital(royapettah);
  if (from && to && distance(from, to) > 800) {
    const a = snap(streets, from)!;
    const b = onStreet(to);
    const collect = round(a);
    parking.push({ id: "ambulance-egmore", kind: "ambulance", ...parkNear(sameRoad(city, a.road), a, 30), color: 0xffffff });
    jobs.push({
      id: "egmore-transfer",
      kind: "ambulance",
      title: "Egmore hospital transfer",
      brief: "A stable patient moves from a hospital in Egmore to one in Royapettah for treatment, through central Chennai. Use the SIREN; three bumps end the run.",
      vehicle: "ambulance",
      stops: [
        { label: `Collect the patient at the hospital${streetOf(collect)}, Egmore`, ...collect, radius: 10, dwell: 4, fare: fareAt(city, collect, { board: 1, patient: true, shift: 20 }) },
        { label: `Transfer to the hospital${streetOf(b)}, Royapettah`, ...b, radius: 10, dwell: 2, fare: fareAt(city, b, { alight: 1, patient: true }, to) },
      ],
      timeLimit: allow(collect, b, 9) + 60,
      payout: 1000,
      fine: 150,
      maxBumps: 3,
      startRadius: 400,
    });
  }

  // 3. Mount Road bus: four mapped bus stops in order along Anna Salai, north-east from
  // Teynampet (near the SIET stop) to Thousand Lights. Both points are approximate.
  const runFrom = { x: 3960, z: 5330 };
  const runTo = { x: 5030, z: 3160 };
  const length = distance(runFrom, runTo);
  const dir = { x: (runTo.x - runFrom.x) / length, z: (runTo.z - runFrom.z) / length };
  // Only the carriageway going our way (Anna Salai is mapped as two one-way roads).
  const carriageway = roadsOf(city, (r) => {
    if (r.name !== ANNA_SALAI) return false;
    if (!r.oneway) return true;
    const first = r.points[0]!;
    const last = r.points[r.points.length - 1]!;
    return (last.x - first.x) * dir.x + (last.z - first.z) * dir.z > 0;
  });
  const candidates: Array<Point & { name: string; t: number; heading: number; mapped: Point }> = [];
  for (const stop of city.busStops ?? []) {
    if (!stop.name) continue;
    const t = (stop.x - runFrom.x) * dir.x + (stop.z - runFrom.z) * dir.z;
    if (t < -60 || t > length + 60) continue;
    const hit = snap(carriageway, stop);
    if (!hit || hit.distance > 30) continue;
    candidates.push({ ...round(hit), heading: hit.heading, name: stop.name, t, mapped: { x: stop.x, z: stop.z } });
  }
  candidates.sort((p, q) => p.t - q.t || p.x - q.x);
  const picked: typeof candidates = [];
  for (const target of [0, 1 / 3, 2 / 3, 1].map((f) => f * length)) {
    let best: (typeof candidates)[number] | null = null;
    for (const c of candidates) {
      if (picked.some((p) => distance(p, c) < 300 || p.name === c.name)) continue;
      if (!best || Math.abs(c.t - target) < Math.abs(best.t - target)) best = c;
    }
    if (best) picked.push(best);
  }
  picked.sort((p, q) => p.t - q.t);
  if (picked.length === 4) {
    const first = picked[0]!;
    const stand = kerb(carriageway, along(first, -120));
    parking.push({ id: "bus-mount-road", kind: "bus", ...stand, color: 0x1f6f78 });
    let due = 0;
    // People wait on the side of the road the stop is mapped on (its shelter).
    const crowd = busCrowd(picked.length);
    const stops = picked.map((stop, i) => {
      due += allow(i === 0 ? stand : picked[i - 1]!, stop, 8) + 5;
      return { label: `Bus stop ${i + 1} of 4: ${stop.name}`, x: stop.x, z: stop.z, radius: 9, dwell: 4, due, fare: fareAt(city, stop, crowd[i]!, stop.mapped) };
    });
    jobs.push({
      id: "mount-road-bus",
      kind: "bus",
      title: "Mount Road bus",
      brief: "Drive the bus up Anna Salai from Teynampet towards Thousand Lights, stopping at four real stops in order. Keep to the timetable in the heaviest traffic in town.",
      vehicle: "bus",
      stops,
      timeLimit: due + 60,
      payout: 1300,
      fine: 130,
      minReputation: 55,
      startRadius: 300,
    });
  }

  return { jobs, parking };
}

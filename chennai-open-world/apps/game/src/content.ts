/**
 * Game content placed on the real map: where the player starts, where vehicles are parked and
 * the mission stages. Places are given approximately and snapped to the nearest real road, so
 * they stay valid when the OpenStreetMap extract is refreshed.
 */
import { boundsOf, centroid, nearestRoadPoint, type Bounds, type Point, type WorldMap } from "@cow/game-world";
import { GeoProjection } from "@cow/map-data";
import type { EnemySpot } from "@cow/combat";
import type { Job, Mission, Objective } from "@cow/missions";
import type { VehicleKind } from "@cow/vehicles";
import { cityJobs } from "./cityJobs";
import { shareAutoJob } from "./shareAutoRoute";

export interface Parking {
  readonly id: string;
  readonly kind: VehicleKind;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly color: number;
}

export interface GameContent {
  readonly spawn: { x: number; z: number; yaw: number };
  readonly parking: Parking[];
  readonly missions: Mission[];
  /** Enemy groups by name, placed when a "defeat" objective for that group begins. */
  readonly enemies: Record<string, EnemySpot[]>;
  /** Everyday paid work offered on the job board. Repeatable. */
  readonly jobs: Job[];
}

const CAR_COLORS = [0xc0392b, 0x2f6fb5, 0xe8e8ea, 0x2c2f36, 0x1f8a5b, 0xd98e1f];

/**
 * Stops along the main avenues, each at least `gap` metres from every other and from the
 * start, visited in a loop that keeps each leg short. Deterministic for a given map.
 */
function spacedStops(avenues: WorldMap, start: Point, count: number, gap: number): Point[] {
  const samples: Point[] = [];
  for (const road of avenues.roads) {
    for (let i = 0; i < road.points.length - 1; i++) {
      const a = road.points[i]!;
      const b = road.points[i + 1]!;
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      for (let d = 0; d < length; d += 30) samples.push({ x: a.x + ((b.x - a.x) * d) / length, z: a.z + ((b.z - a.z) * d) / length });
    }
  }
  const stops: Point[] = [];
  let from = start;
  for (let n = 0; n < count; n++) {
    let best: Point | null = null;
    let bestScore = Infinity;
    for (const p of samples) {
      const far = Math.hypot(p.x - start.x, p.z - start.z) >= gap * 0.6 && stops.every((s) => Math.hypot(p.x - s.x, p.z - s.z) >= gap);
      if (!far) continue;
      // Closest acceptable sample to the previous stop: a loop of short legs.
      const score = Math.abs(Math.hypot(p.x - from.x, p.z - from.z) - gap);
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (!best) break;
    stops.push({ x: Math.round(best.x * 10) / 10, z: Math.round(best.z * 10) / 10 });
    from = best;
  }
  return stops;
}

/**
 * The first map's square of Anna Nagar (13.0805–13.0895 N, 80.2056–80.2146 E, about 1 km round
 * the Roundtana). The ten stages and the first ten jobs were laid out in it, relative to its
 * edges, so they stay exactly where they were now that the map is the whole city.
 */
export function homeBounds(map: WorldMap): Bounds {
  const projection = new GeoProjection(map.origin);
  const sw = projection.toLocal({ lat: 13.0805, lng: 80.2056 });
  const ne = projection.toLocal({ lat: 13.0895, lng: 80.2146 });
  return { minX: Math.ceil(sw.x), maxX: Math.floor(ne.x), minZ: Math.ceil(ne.z), maxZ: Math.floor(sw.z) };
}

const inside = (p: Point, b: Bounds) => p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ;
const overlaps = (a: Bounds, b: Bounds) => a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;

/** The part of the city map inside the home square: what the original content is placed on. */
export function homeMap(map: WorldMap): WorldMap {
  const bounds = homeBounds(map);
  return {
    ...map,
    bounds,
    roads: map.roads.filter((road) => overlaps(boundsOf(road.points), bounds)),
    areas: map.areas.filter((area) => inside(centroid(area.outline), bounds)),
    pois: map.pois.filter((poi) => inside(poi, bounds)),
  };
}

export function buildContent(city: WorldMap): GameContent {
  const map = homeMap(city);
  /** Nearest point on a drivable road. */
  const onRoad = (p: Point): Point => {
    const hit = nearestRoadPoint(map, p);
    return hit ? { x: hit.x, z: hit.z } : p;
  };
  /** A parking place at the kerb of the nearest road, facing along it. */
  const kerb = (p: Point, farSide = false): { x: number; z: number; yaw: number } => {
    const hit = nearestRoadPoint(map, p);
    if (!hit) return { ...p, yaw: 0 };
    // Right-hand side of the road's direction, or the opposite kerb facing the other way.
    const side = Math.max(0.2, hit.road.width / 2 - 1.3) * (farSide ? -1 : 1);
    return { x: hit.x + Math.cos(hit.heading) * side, z: hit.z - Math.sin(hit.heading) * side, yaw: farSide ? hit.heading + Math.PI : hit.heading };
  };
  const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
  /** Time allowed to drive from a to b: road distance is longer than the straight line. */
  const allow = (a: Point, b: Point, speed: number) => Math.round((distance(a, b) * 1.5) / speed + 25);

  const start = nearestRoadPoint(map, { x: 40, z: 60 });
  const spawn = start ? { x: start.x, z: start.z, yaw: start.heading } : { x: 0, z: 0, yaw: 0 };
  const forward = { x: -Math.sin(spawn.yaw), z: -Math.cos(spawn.yaw) };
  const ahead = (metres: number): Point => ({ x: spawn.x + forward.x * metres, z: spawn.z + forward.z * metres });

  const park = map.areas.find((a) => a.name?.includes("Tower Park")) ?? map.areas.find((a) => a.kind === "park");
  const parkGate = onRoad(park ? centroid(park.outline) : { x: -150, z: -150 });

  const firstCar = kerb(ahead(14));
  const firstAuto = kerb({ x: parkGate.x + 12, z: parkGate.z + 6 });
  const walkTo = onRoad(ahead(55));
  const { minX, maxX, minZ, maxZ } = map.bounds;
  const inset = 70;
  const pickup = onRoad({ x: maxX - 180, z: minZ + 230 });
  const drop = onRoad({ x: minX + 160, z: maxZ - 200 });
  const parcels = [onRoad({ x: maxX - inset - 40, z: maxZ - 180 }), onRoad({ x: minX + 200, z: minZ + 160 }), onRoad({ x: 0, z: maxZ - inset - 30 })];
  const lunch = [onRoad({ x: 60, z: -120 }), onRoad({ x: maxX - 120, z: 120 }), onRoad({ x: minX + 130, z: 40 })];
  const dashFrom = onRoad({ x: minX + inset, z: maxZ - inset });
  const dashTo = onRoad({ x: maxX - inset, z: minZ + inset });

  const parking: Parking[] = [
    { id: "car-start", kind: "car", ...firstCar, color: CAR_COLORS[0]! },
    { id: "auto-park", kind: "auto", ...firstAuto, color: 0xf5c400 },
  ];
  // Across the street from the hatchback, so neither is parked in the other's way.
  const firstBike = kerb(ahead(20), true);
  parking.push({ id: "bike-start", kind: "bike", ...firstBike, color: 0x1d4e89 });
  // A few more vehicles around the map for free roaming.
  const extras: Array<[VehicleKind, Point]> = [
    ["auto", ahead(-30)],
    ["car", { x: maxX - 150, z: minZ + 150 }],
    ["car", { x: minX + 150, z: maxZ - 150 }],
    ["auto", { x: minX + 220, z: minZ + 260 }],
    ["car", { x: maxX - 220, z: maxZ - 260 }],
    ["car", { x: -60, z: -220 }],
    ["bike", { x: 180, z: 60 }],
    ["bike", { x: -200, z: -60 }],
  ];
  extras.forEach(([kind, p], i) => parking.push({ id: `${kind}-${i}`, kind, ...kerb(p), color: kind === "auto" ? 0xf5c400 : CAR_COLORS[(i + 1) % CAR_COLORS.length]! }));

  const parkCentre = park ? centroid(park.outline) : parkGate;
  const thieves = onRoad({ x: minX + 250, z: maxZ - 120 });
  const godown = onRoad({ x: maxX - 160, z: minZ + 120 });
  const roundtana = onRoad({ x: 0, z: 0 });
  const fight = (label: string, group: string, p: Point): Objective => ({ type: "defeat", label, group, x: p.x, z: p.z, radius: 12 });

  const reach = (label: string, p: Point, extra: Partial<Extract<Objective, { type: "reach" }>> = {}): Objective => ({
    type: "reach",
    label,
    x: p.x,
    z: p.z,
    radius: 5,
    ...extra,
  });

  const missions: Mission[] = [
    {
      id: "morning-walk",
      stage: 1,
      title: "Morning walk",
      brief: "Stretch your legs. Walk down the street to the marker.",
      reward: 50,
      objectives: [reach("Walk to the marker", walkTo, { radius: 4 })],
    },
    {
      id: "borrowed-wheels",
      stage: 2,
      title: "Borrowed wheels",
      brief: "Your cousin left his hatchback on the street. Take it to Tower Park.",
      reward: 150,
      objectives: [
        { type: "enter", label: "Get in the hatchback", vehicle: "car" },
        reach("Drive to Anna Nagar Tower Park", parkGate, { mode: "car", radius: 7, stop: true }),
      ],
    },
    {
      id: "auto-shift",
      stage: 3,
      title: "Auto shift",
      brief: "Cover a friend's auto for one fare. Pick the passenger up and drop them before they lose patience.",
      reward: 300,
      objectives: [
        { type: "enter", label: "Get in the auto-rickshaw", vehicle: "auto" },
        reach("Pick up the passenger", pickup, { mode: "auto", radius: 6, stop: true }),
        reach("Drop the passenger", drop, { mode: "auto", radius: 6, stop: true, timeLimit: allow(pickup, drop, 9) }),
      ],
    },
    {
      id: "parcel-run",
      stage: 4,
      title: "Parcel run",
      brief: "Three parcels, three addresses, and the clock is running on each one.",
      reward: 500,
      objectives: [
        { type: "enter", label: "Get in a car", vehicle: "car" },
        reach("Deliver parcel 1 of 3", parcels[0]!, { mode: "car", radius: 6, stop: true }),
        reach("Deliver parcel 2 of 3", parcels[1]!, { mode: "car", radius: 6, stop: true, timeLimit: allow(parcels[0]!, parcels[1]!, 12) }),
        reach("Deliver parcel 3 of 3", parcels[2]!, { mode: "car", radius: 6, stop: true, timeLimit: allow(parcels[1]!, parcels[2]!, 12) }),
      ],
    },
    {
      id: "cross-town",
      stage: 5,
      title: "Cross-town dash",
      brief: "Corner to corner across Anna Nagar, as fast as the streets allow.",
      reward: 800,
      objectives: [
        { type: "enter", label: "Get in a car", vehicle: "car" },
        reach("Drive to the start line", dashFrom, { mode: "car", radius: 7, stop: true }),
        reach("Race to the finish", dashTo, { mode: "car", radius: 8, timeLimit: allow(dashFrom, dashTo, 14) }),
      ],
    },
    {
      id: "bike-courier",
      stage: 6,
      title: "Two-wheel courier",
      brief: "Lunch boxes go cold fast. Take the motorbike and make both drops on time.",
      reward: 1000,
      objectives: [
        { type: "enter", label: "Get on a motorbike", vehicle: "bike" },
        reach("Collect the lunch boxes", lunch[0]!, { mode: "bike", radius: 5, stop: true }),
        reach("First drop", lunch[1]!, { mode: "bike", radius: 5, stop: true, timeLimit: allow(lunch[0]!, lunch[1]!, 13) }),
        reach("Second drop", lunch[2]!, { mode: "bike", radius: 5, stop: true, timeLimit: allow(lunch[1]!, lunch[2]!, 13) }),
      ],
    },
    {
      id: "park-trouble",
      stage: 7,
      title: "Park trouble",
      brief: "Three thugs are shaking down walkers in Tower Park. No weapons, just fists. Sort them out.",
      reward: 600,
      objectives: [reach("Go to Tower Park", parkCentre, { radius: 16 }), fight("Beat the three thugs (HIT)", "park", parkCentre)],
    },
    {
      id: "bike-thieves",
      stage: 8,
      title: "Bike thieves",
      brief: "A stolen motorbike is being stripped on a back street, and two of the gang are armed. You have a pistol now: FIRE shoots where you look.",
      reward: 900,
      objectives: [
        reach("Find the thieves", thieves, { radius: 22 }),
        fight("Take down the thieves", "thieves", thieves),
        { type: "enter", label: "Get on a motorbike", vehicle: "bike" },
        reach("Ride it back to its owner", onRoad(ahead(8)), { mode: "bike", radius: 6, stop: true }),
      ],
    },
    {
      id: "godown-raid",
      stage: 9,
      title: "Godown raid",
      brief: "The gang keeps its takings in a godown across town. Four guards, all armed. Use the corners.",
      reward: 1400,
      objectives: [reach("Get to the godown", godown, { radius: 24 }), fight("Clear out the guards", "godown", godown)],
    },
    {
      id: "roundtana-showdown",
      stage: 10,
      title: "Roundtana showdown",
      brief: "The boss is waiting at the Roundtana with his best men. End it.",
      reward: 3000,
      objectives: [reach("Go to the Roundtana", roundtana, { radius: 26 }), fight("Defeat the boss and his men", "boss", roundtana)],
    },
  ];

  // Enemies stand a few metres apart around their meeting point.
  const around = (centre: Point, spots: ReadonlyArray<readonly [number, number, boolean, number?]>): EnemySpot[] =>
    spots.map(([dx, dz, armed, health]) => ({ x: centre.x + dx, z: centre.z + dz, armed, ...(health ? { health } : {}) }));
  const enemies: Record<string, EnemySpot[]> = {
    park: around(parkCentre, [[0, 0, false], [3, 2, false], [-3, 2.5, false]]),
    thieves: around(thieves, [[0, 0, true], [3, -2, true], [-2.5, 2, false]]),
    godown: around(godown, [[0, 0, true], [4, 0, true], [-4, 1, true], [0, 4, true]]),
    boss: around(roundtana, [[0, 0, true, 260], [4, 2, true], [-4, 2, true], [3, -4, false], [-3, -4, false]]),
  };

  // City jobs. Hospitals and the post office are real places from the map; their names are
  // not shown (no real business names), only the street they are on. Bus stops are invented
  // positions on the main avenues (the extract has no bus stops).
  const streetOf = (p: Point): string => {
    const hit = nearestRoadPoint(map, p);
    return hit?.road.name ? ` on ${hit.road.name}` : "";
  };
  const place = (kind: string, fallback: Point): Point => {
    const poi = map.pois.find((p) => p.kind === kind && !/eye|optical/i.test(p.name ?? ""));
    return poi ? { x: poi.x, z: poi.z } : fallback;
  };
  const avenues: WorldMap = { ...map, roads: map.roads.filter((r) => r.kind === "secondary" || r.kind === "tertiary") };
  const avenueKerb = (p: Point) => {
    const hit = nearestRoadPoint(avenues, p);
    return hit ? kerb({ x: hit.x, z: hit.z }) : kerb(p);
  };

  const ambulanceBay = kerb(place("hospital", { x: 320, z: 55 }));
  const hospital = onRoad(map.pois.filter((p) => p.kind === "hospital" && !/eye|optical/i.test(p.name ?? ""))[1] ?? { x: -337, z: 314 });
  const patient = onRoad({ x: -60, z: -260 });
  const postOffice = onRoad(place("post_office", { x: -100, z: 150 }));
  const parcelTo = onRoad({ x: maxX - 120, z: maxZ - 140 });
  const rider = onRoad({ x: minX + 140, z: minZ + 180 });
  const riderTo = onRoad({ x: 230, z: 280 });
  const busStand = avenueKerb({ x: -150, z: 20 });
  const busStops = spacedStops(avenues, busStand, 4, 260);
  parking.push(
    { id: "ambulance", kind: "ambulance", ...ambulanceBay, color: 0xffffff },
    { id: "bus", kind: "bus", ...busStand, color: 0x1f6f78 },
  );

  const road = (a: Point, b: Point) => distance(a, b) * 1.4;
  let due = 0;
  const busRoute = busStops.map((stop, i) => {
    due += allow(i === 0 ? busStand : busStops[i - 1]!, stop, 8) + 5;
    return { label: `Bus stop ${i + 1} of ${busStops.length}${streetOf(stop)}`, ...stop, radius: 8, dwell: 4, due };
  });
  const jobs: Job[] = [
    {
      id: "ambulance-run",
      kind: "ambulance",
      title: "Ambulance run",
      brief: "A patient needs a hospital now. Use the SIREN to clear the traffic, and drive smoothly: every bump hurts.",
      vehicle: "ambulance",
      stops: [
        { label: `Pick up the patient${streetOf(patient)}`, ...patient, radius: 8, dwell: 3 },
        { label: `Drive the patient to the hospital${streetOf(hospital)}`, ...hospital, radius: 9 },
      ],
      timeLimit: allow(ambulanceBay, patient, 11) + allow(patient, hospital, 11),
      payout: 900,
      fine: 150,
      maxBumps: 5,
    },
    {
      id: "courier",
      kind: "courier",
      title: "Courier delivery",
      brief: "Collect a parcel from the post office and get it across town on the motorbike. No damage earns a bonus.",
      vehicle: "bike",
      stops: [
        { label: `Collect the parcel at the post office${streetOf(postOffice)}`, ...postOffice, radius: 6, dwell: 2 },
        { label: `Deliver the parcel${streetOf(parcelTo)}`, ...parcelTo, radius: 6, dwell: 1 },
      ],
      timeLimit: allow(postOffice, parcelTo, 12) + 60,
      payout: 450,
      fine: 80,
    },
    {
      id: "cab-ride",
      kind: "cab",
      title: "Cab ride",
      brief: "A passenger is waiting for a car. The fare goes by distance; a smooth ride earns a tip.",
      vehicle: "car",
      stops: [
        { label: `Pick up the passenger${streetOf(rider)}`, ...rider, radius: 7, dwell: 2 },
        { label: `Drop the passenger${streetOf(riderTo)}`, ...riderTo, radius: 7, dwell: 1 },
      ],
      timeLimit: allow(rider, riderTo, 10) + 90,
      // ₹80 flag fall plus ₹0.35 a metre of road.
      payout: Math.round(80 + road(rider, riderTo) * 0.35),
      fine: 60,
    },
    {
      id: "bus-route",
      kind: "bus",
      title: "Bus route",
      brief: "Drive the city bus round its loop. Stop at every stop in order and keep to the timetable.",
      vehicle: "bus",
      stops: busRoute,
      timeLimit: due + 60,
      payout: 1100,
      fine: 120,
      minReputation: 55,
    },
  ];

  // More everyday work, from real mapped places (names not shown).
  const firstHospital = onRoad(place("hospital", { x: 320, z: 55 }));
  const kitchen = onRoad(place("restaurant", { x: 100, z: -60 }));
  // The chemist and hospital farthest apart, so the run is a real ride.
  let medicine = { from: onRoad({ x: -300, z: -250 }), to: firstHospital };
  for (const shop of map.pois.filter((p) => p.kind === "pharmacy")) {
    for (const ward of [firstHospital, hospital]) {
      if (distance(shop, ward) > distance(medicine.from, medicine.to)) medicine = { from: onRoad(shop), to: ward };
    }
  }
  const chemist = medicine.from;
  const meals = [onRoad({ x: -280, z: -320 }), onRoad({ x: 60, z: 380 }), onRoad({ x: 330, z: -380 })];
  const tourist = onRoad({ x: -330, z: -40 });
  const legs = (points: readonly Point[], speed: number) => points.slice(1).reduce((sum, p, i) => sum + allow(points[i]!, p, speed), 0);
  // The share auto runs 2nd Avenue end to end, so it is built from the city map (the avenue
  // runs out of the home square at both ends). It replaced an earlier "Share auto" job that was
  // two fixed pick-ups and one drop; the id is kept so saved best fares carry on.
  const share = shareAutoJob(city);
  if (share) parking.push(share.parking);
  jobs.push(
    {
      id: "hospital-transfer",
      kind: "ambulance",
      title: "Hospital transfer",
      brief: "A stable patient needs moving between hospitals for a scan. Less rush, but a smooth ride matters even more.",
      vehicle: "ambulance",
      stops: [
        { label: `Collect the patient at the hospital${streetOf(firstHospital)}`, ...firstHospital, radius: 10, dwell: 4 },
        { label: `Transfer to the hospital${streetOf(hospital)}`, ...hospital, radius: 9, dwell: 2 },
      ],
      timeLimit: legs([ambulanceBay, firstHospital, hospital], 9) + 40,
      payout: 700,
      fine: 120,
      maxBumps: 3,
    },
    {
      id: "food-delivery",
      kind: "courier",
      title: "Lunch rush",
      brief: "Three hot lunches from one kitchen to three homes. Ride fast, ride clean.",
      vehicle: "bike",
      stops: [
        { label: `Collect the orders${streetOf(kitchen)}`, ...kitchen, radius: 6, dwell: 2 },
        ...meals.map((p, i) => ({ label: `Delivery ${i + 1} of 3${streetOf(p)}`, ...p, radius: 6, dwell: 1 })),
      ],
      timeLimit: legs([kitchen, ...meals], 12) + 60,
      payout: 650,
      fine: 90,
    },
    {
      id: "medicine-run",
      kind: "courier",
      title: "Medicine run",
      brief: "A hospital ward has run short. Take a box of medicine from the chemist, quickly.",
      vehicle: "bike",
      stops: [
        { label: `Collect the medicine${streetOf(chemist)}`, ...chemist, radius: 6, dwell: 2 },
        { label: `Deliver to the hospital${streetOf(medicine.to)}`, ...medicine.to, radius: 8, dwell: 1 },
      ],
      timeLimit: allow(chemist, medicine.to, 13) + 35,
      payout: 380,
      fine: 70,
    },
    ...(share ? [share.job] : []),
    {
      id: "tower-park-visit",
      kind: "cab",
      title: "Tower Park visitor",
      brief: "A visitor wants to see Anna Nagar Tower Park before it closes. Take them to the gate.",
      vehicle: "car",
      stops: [
        { label: `Pick up the visitor${streetOf(tourist)}`, ...tourist, radius: 7, dwell: 2 },
        { label: "Drop them at Anna Nagar Tower Park", ...parkGate, radius: 8, dwell: 1 },
      ],
      timeLimit: allow(tourist, parkGate, 10) + 90,
      payout: Math.round(80 + road(tourist, parkGate) * 0.35),
      fine: 60,
    },
    {
      id: "evening-bus",
      kind: "bus",
      title: "Evening bus, the other way",
      brief: "The same loop backwards at the busy hour. Tighter timetable, more people waiting.",
      vehicle: "bus",
      stops: (() => {
        let clock = 0;
        const reversed = [...busStops].reverse();
        return reversed.map((stop, i) => {
          clock += allow(i === 0 ? busStand : reversed[i - 1]!, stop, 9) + 6;
          return { label: `Bus stop ${i + 1} of ${reversed.length}${streetOf(stop)}`, ...stop, radius: 8, dwell: 5, due: clock };
        });
      })(),
      timeLimit: legs([busStand, ...[...busStops].reverse()], 9) + 80,
      payout: 1400,
      fine: 150,
      minReputation: 62,
    },
  );

  // Jobs across the whole city (T. Nagar, Marina, Egmore, Anna Salai), placed on the city map.
  const across = cityJobs(city);
  parking.push(...across.parking);
  jobs.push(...across.jobs);

  return { spawn, parking, missions, enemies, jobs };
}

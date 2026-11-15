/**
 * Game content placed on the real map: where the player starts, where vehicles are parked and
 * the mission stages. Places are given approximately and snapped to the nearest real road, so
 * they stay valid when the OpenStreetMap extract is refreshed.
 */
import { centroid, nearestRoadPoint, type Point, type WorldMap } from "@cow/game-world";
import type { EnemySpot } from "@cow/combat";
import type { Mission, Objective } from "@cow/missions";
import type { VehicleKind } from "@cow/vehicles";

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
}

const CAR_COLORS = [0xc0392b, 0x2f6fb5, 0xe8e8ea, 0x2c2f36, 0x1f8a5b, 0xd98e1f];

export function buildContent(map: WorldMap): GameContent {
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

  return { spawn, parking, missions, enemies };
}

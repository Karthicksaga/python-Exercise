/**
 * Stages 16 to 21, after the street war: a day of odd jobs across central Chennai that starts at
 * the Royapettah clock tower where stage 15 ended, and where each stage begins close to where the
 * last one finished (a vehicle is parked at the start when one is needed), so there are no long
 * empty drives. They mix what the game can do: passengers getting in and out (`fares.ts`), losing
 * the police, a suburban train ride and a chase, a delivery against the clock, and a fight.
 *
 * Real: the roads and their names, the temple, the railway stations (from `world/rail.json`), the
 * stadium's street. Invented: every person and story, the times, the rewards, and the exact spots
 * (approximate points snapped to the nearest real road). No real person or business is meant.
 */
import { nearestRoadPoint, type Point, type Road, type WorldMap } from "@cow/game-world";
import type { EnemySpot, WeaponId } from "@cow/combat";
import type { Mission, Objective } from "@cow/missions";
import type { Parking } from "./content";
import { fareAt } from "./fareSpots";
import { roadPathOn } from "./streetWar";

/** Station positions as in `world/rail.json` (checked by `laterStages.test.ts`). */
export const STATIONS = {
  park: { name: "Park", x: 6822.1, z: 472.2 },
  egmore: { name: "Chennai Egmore", x: 5541, z: 806 },
} as const;

type Hit = Point & { heading: number; road: Road };

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const round = (p: Point): Point => ({ x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 });
/** Time allowed to drive from a to b: road distance is longer than the straight line. */
const allow = (a: Point, b: Point, speed: number) => Math.round((distance(a, b) * 1.5) / speed + 25);

export interface LaterStages {
  readonly missions: Mission[];
  readonly enemies: Record<string, EnemySpot[]>;
  readonly parking: Parking[];
}

export function buildLaterStages(city: WorldMap): LaterStages {
  const streets: Pick<WorldMap, "roads"> = { roads: city.roads.filter((r) => r.kind !== "footway" && r.kind !== "service") };
  const named = (name: string): Pick<WorldMap, "roads"> => ({ roads: streets.roads.filter((r) => r.name === name) });
  const district = (name: string): Point => city.districts?.find((d) => d.name === name) ?? { x: 0, z: 0 };
  const landmark = (id: string, fallback: Point): Point => city.landmarks?.find((l) => l.id === id) ?? fallback;
  /** The nearest point on a road (that road by name when it is within 600 m, else any street). */
  const snap = (p: Point, road?: string): Hit => {
    const hit = (road ? nearestRoadPoint(named(road), p) : null) ?? nearestRoadPoint(streets, p);
    const use = hit && (!road || hit.distance < 600) ? hit : nearestRoadPoint(streets, p);
    return use ? { ...round(use), heading: use.heading, road: use.road } : ({ ...p, heading: 0, road: streets.roads[0]! } as Hit);
  };
  const along = (p: Hit, metres: number): Point => ({ x: p.x - Math.sin(p.heading) * metres, z: p.z - Math.cos(p.heading) * metres });
  /** Parked at the kerb on the right of the road's direction, facing along it. */
  const kerb = (p: Hit): { x: number; z: number; yaw: number } => {
    const side = Math.max(0.2, p.road.width / 2 - 1.3);
    return { ...round({ x: p.x + Math.cos(p.heading) * side, z: p.z - Math.sin(p.heading) * side }), yaw: p.heading };
  };
  /** Just off the carriageway (pavements are not mapped; buildings often start a metre or two back). */
  const pavement = (p: Hit, side: 1 | -1, extra: number): Point => {
    const out = p.road.width / 2 + extra;
    return round({ x: p.x + Math.cos(p.heading) * out * side, z: p.z - Math.sin(p.heading) * out * side });
  };
  const huddle = (centre: Hit, side: 1 | -1, people: ReadonlyArray<WeaponId>, tint: number): EnemySpot[] =>
    people.map((weapon, i) => {
      const spot = pavement({ ...centre, ...along(centre, (i - (people.length - 1) / 2) * 2.4) }, side, 0.5 + (i % 2) * 0.5);
      return { ...spot, armed: weapon === "pistol" || weapon === "shotgun" || weapon === "smg", weapon, tint };
    });
  const reach = (label: string, p: Point, extra: Partial<Extract<Objective, { type: "reach" }>> = {}): Objective => ({ type: "reach", label, x: p.x, z: p.z, radius: 7, ...extra });

  const parking: Parking[] = [];
  const enemies: Record<string, EnemySpot[]> = {};

  // --- Stage 16: the wedding party. From the clock tower (where the turf war ended) by auto.
  const royapettah = district("Royapettah");
  const clockPoi = city.pois.find((p) => p.kind === "clock" && distance(p, royapettah) < 900);
  const tower = snap(clockPoi ?? royapettah);
  parking.push({ id: "auto-royapettah", kind: "auto", ...kerb(snap(along(tower, -45))), color: 0xf5c400 });
  const westcott = snap(royapettah, "Westcott Road");
  const temple = landmark("kapaleeshwarar-temple", { x: 6476, z: 5707 });
  const mandapam = snap(temple, "North Mada Street");

  // --- Stage 17: the planted chain. On foot round the temple.
  const stall = snap(temple, "East Tank Square Street");
  const templeOffice = snap(along(mandapam, 40), "North Mada Street");

  // --- Stage 18: the singer for the Mumbai Mail. A car by the temple, to Chennai Central
  // (the drop is on EVR Periyar Salai beside Park station, the suburban station next to Central).
  const southMada = snap(temple, "South Mada Street");
  parking.push({ id: "car-mylapore", kind: "car", ...kerb(snap(along(templeOffice, 30), "North Mada Street")), color: 0x6b2737 });
  const central = snap(STATIONS.park, "EVR Periyar Salai");

  // --- Stage 19: the harmonium thief. Park to Egmore by train, then a chase on a motorbike.
  const egmoreGate = snap(STATIONS.egmore, "Gandhi Irwin Road");
  parking.push({ id: "bike-egmore", kind: "bike", ...kerb(snap(along(egmoreGate, -25), "Gandhi Irwin Road")), color: 0x24445c });
  // He rides off along EVR Periyar Salai, the main road past the station.
  const thiefPath = roadPathOn(streets, "EVR Periyar Salai", snap(STATIONS.egmore, "EVR Periyar Salai"), 900);

  // --- Stage 20: biryani for the dressing room, from a kitchen near Egmore station to the
  // cricket stadium at Chepauk, against the clock.
  const kitchenPoi = city.pois.filter((p) => p.kind === "restaurant" && distance(p, STATIONS.egmore) < 400).sort((a, b) => distance(a, STATIONS.egmore) - distance(b, STATIONS.egmore))[0];
  const kitchen = snap(kitchenPoi ?? along(egmoreGate, 120));
  const chepauk = district("Chepauk");
  const stadiumGate = snap(chepauk, "Wallajah Road");
  const hostelGate = snap(chepauk, "Victoria Hostel Road");

  // --- Stage 21: the beach road brawl, across from the stadium on Kamarajar Salai.
  const beach = snap(chepauk, "Kamarajar Salai");
  // The sea side of the road: towards the Marina.
  const marina = landmark("marina-beach", { x: 7992, z: 3422 });
  const right = { x: Math.cos(beach.heading), z: -Math.sin(beach.heading) };
  const seaSide: 1 | -1 = (marina.x - beach.x) * right.x + (marina.z - beach.z) * right.z >= 0 ? 1 : -1;
  enemies.brawl = [...huddle(beach, seaSide, ["fists", "bat", "fists"], 0x8a5a2b), ...huddle(snap(along(beach, 14), "Kamarajar Salai"), seaSide, ["bat", "fists"], 0x8a5a2b)];

  const missions: Mission[] = [
    {
      id: "wedding-party",
      stage: 16,
      title: "Muhurtham",
      brief: "Selvi akka's niece gets married in Mylapore this morning and the hired van never came. Three of the family are waiting on Westcott Road in their silks. Take the auto by the clock tower and get them to the mandapam before the muhurtham.",
      reward: 1800,
      reputation: 3,
      objectives: [
        { type: "enter", label: "Get in the auto by the clock tower", vehicle: "auto" },
        reach("Pick up the wedding party on Westcott Road", westcott, { mode: "auto", radius: 7, stop: true, fare: fareAt(city, westcott, { board: 3 }) }),
        reach("Get them to the mandapam on North Mada Street, Mylapore", mandapam, {
          mode: "auto",
          radius: 8,
          stop: true,
          timeLimit: allow(westcott, mandapam, 8),
          fare: fareAt(city, mandapam, { alight: 3 }),
        }),
      ],
    },
    {
      id: "planted-chain",
      stage: 17,
      title: "Hot property",
      brief: "Lakshmi, who sells jasmine by the temple tank, wants a word. As she talks, someone slips a gold chain into your pocket and a constable starts shouting. Lose the police, then hand the chain in at the temple office.",
      reward: 2000,
      reputation: 2,
      objectives: [
        reach("Meet Lakshmi at her flower stall, East Tank Square Street", stall, { radius: 10 }),
        { type: "evade", label: "Someone planted a stolen chain on you: lose the police", stars: 2 },
        reach("Hand the chain in at the temple office, North Mada Street", templeOffice, { radius: 8 }),
      ],
    },
    {
      id: "mumbai-mail",
      stage: 18,
      title: "The Mumbai Mail",
      brief: "Padma Raghavan, a Carnatic singer with a concert in Mumbai tomorrow, has missed her ride and her train leaves Central soon. A car is parked on North Mada Street. Pick her up on South Mada Street and get her to Chennai Central.",
      reward: 2500,
      reputation: 3,
      objectives: [
        { type: "enter", label: "Get in the car on North Mada Street", vehicle: "car" },
        reach("Pick up the singer on South Mada Street", southMada, { mode: "car", radius: 7, stop: true, fare: fareAt(city, southMada, { board: 1 }, temple) }),
        reach("Drop her at Chennai Central, EVR Periyar Salai", central, {
          mode: "car",
          radius: 9,
          stop: true,
          timeLimit: allow(southMada, central, 11),
          fare: fareAt(city, central, { alight: 1 }, STATIONS.park),
        }),
      ],
    },
    {
      id: "harmonium-thief",
      stage: 19,
      title: "The harmonium thief",
      brief: "Padma's accompanist sent her harmonium ahead on a suburban train, and a thief has taken it off at Egmore. Walk to Park station, take the train one stop to Egmore, then catch him on the motorbike outside the station.",
      reward: 2800,
      objectives: [
        reach("Walk to Park station", STATIONS.park, { radius: 60 }),
        reach("Take a train from Park to Chennai Egmore (BOARD on the platform)", STATIONS.egmore, { radius: 120, byTrain: true }),
        { type: "enter", label: "Step off and get on the motorbike outside Egmore station", vehicle: "bike" },
        { type: "chase", label: "Catch the thief on EVR Periyar Salai", path: thiefPath, speed: 10, radius: 5, quarry: "bike" },
        reach("Bring the harmonium back to Egmore station", egmoreGate, { radius: 9, stop: true }),
      ],
    },
    {
      id: "stadium-biryani",
      stage: 20,
      title: "Biryani for the dressing room",
      brief: "Match day at Chepauk. A kitchen near Egmore station has forty parcels of biryani for the dressing room and its delivery rider has flu. The toss is soon: ride, and don't stop for tea.",
      reward: 1600,
      reputation: 2,
      objectives: [
        { type: "enter", label: "Get on a motorbike", vehicle: "bike" },
        reach("Collect the biryani near Egmore station", kitchen, { mode: "bike", radius: 7, stop: true }),
        reach("Deliver it to the stadium gate, Wallajah Road", stadiumGate, { mode: "bike", radius: 7, stop: true, timeLimit: allow(kitchen, stadiumGate, 13) }),
        reach("Last box to the scorers, Victoria Hostel Road", hostelGate, { mode: "bike", radius: 7, stop: true, timeLimit: allow(stadiumGate, hostelGate, 9) }),
      ],
    },
    {
      id: "beach-road-brawl",
      stage: 21,
      title: "Beach road brawl",
      brief: "After the match a gang is robbing the delivery riders on the beach road opposite the stadium. Five of them, bats and fists. Police are everywhere on match day, so leave the guns holstered and settle it by hand.",
      reward: 3000,
      reputation: 4,
      objectives: [reach("Go to the beach road opposite the stadium", beach, { radius: 22 }), { type: "defeat", label: "Beat the gang robbing the riders", group: "brawl", x: beach.x, z: beach.z, radius: 16 }],
    },
  ];

  return { missions, enemies, parking };
}

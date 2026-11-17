/**
 * Places the player can go into and the short stories that use them, placed on the real map of
 * Anna Nagar. Each entrance stands on the pavement beside the nearest road, on the side of the
 * building it belongs to, and clear of parked vehicles (so ENTER never means two things).
 *
 * Real: the hospital and the theatre are at mapped OpenStreetMap amenities (`amenity=hospital`,
 * `amenity=theatre`/`cinema`), and the roads. Invented: every name shown, the home, gym and mall
 * positions (no such amenities are mapped nearby), and the stories.
 */
import { nearestRoadPoint, type Point, type WorldMap } from "@cow/game-world";
import { ENTRANCE_RADIUS, type Place, type PlaceKind, type Story } from "@cow/missions";
import { homeMap, type GameContent } from "./content";

export interface PlaceContent {
  readonly places: Place[];
  readonly stories: Story[];
}

/** Invented names shown on screen. */
export const PLACE_NAMES: Record<PlaceKind, string> = {
  home: "Home",
  hospital: "Sugam Hospital",
  gym: "Thol Power Gym",
  mall: "Vaanavil Mall",
  cinema: "Minnal Cinemas",
};

/** Parked vehicles and other entrances stay at least this far from an entrance, metres. */
const CLEAR = 8;
const APART = 30;

export function buildPlaces(city: WorldMap, content: GameContent): PlaceContent {
  const map = homeMap(city);
  const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
  const taken: Point[] = content.parking.map((p) => ({ x: p.x, z: p.z }));
  const placed: Point[] = [];
  const round = (v: number) => Math.round(v * 10) / 10;

  /** The pavement on the near side of the road closest to `building`, slid along it until clear. */
  const entrance = (building: Point): Point => {
    const hit = nearestRoadPoint(map, building);
    if (!hit) return building;
    const along = { x: -Math.sin(hit.heading), z: -Math.cos(hit.heading) };
    const right = { x: Math.cos(hit.heading), z: -Math.sin(hit.heading) };
    const side = (building.x - hit.x) * right.x + (building.z - hit.z) * right.z >= 0 ? 1 : -1;
    for (const slide of [0, 10, -10, 20, -20, 30, -30, 45, -45]) {
      const road = nearestRoadPoint(map, { x: hit.x + along.x * slide, z: hit.z + along.z * slide });
      if (!road) continue;
      const r = { x: Math.cos(road.heading), z: -Math.sin(road.heading) };
      const sign = r.x * right.x + r.z * right.z >= 0 ? side : -side;
      const offset = road.road.width / 2 + 1;
      const p = { x: round(road.x + r.x * offset * sign), z: round(road.z + r.z * offset * sign) };
      if (taken.every((t) => distance(t, p) >= CLEAR) && placed.every((t) => distance(t, p) >= APART)) return p;
    }
    return { x: round(hit.x), z: round(hit.z) };
  };
  const make = (kind: PlaceKind, building: Point): Place => {
    const at = entrance(building);
    placed.push(at);
    return { id: kind, kind, name: PLACE_NAMES[kind], x: at.x, z: at.z, radius: ENTRANCE_RADIUS };
  };
  const poi = (kinds: readonly string[], fallback: Point): Point => {
    const found = map.pois.find((p) => kinds.includes(p.kind) && !/eye|optical|dental/i.test(p.name ?? ""));
    return found ? { x: found.x, z: found.z } : fallback;
  };

  // Home: a building across the street from where the game starts, a few doors back.
  const { spawn } = content;
  const forward = { x: -Math.sin(spawn.yaw), z: -Math.cos(spawn.yaw) };
  const left = { x: -Math.cos(spawn.yaw), z: Math.sin(spawn.yaw) };
  const home = make("home", { x: spawn.x - forward.x * 12 + left.x * 15, z: spawn.z - forward.z * 12 + left.z * 15 });
  const hospital = make("hospital", poi(["hospital"], { x: 320, z: 56 }));
  const cinema = make("cinema", poi(["cinema", "theatre"], { x: 327, z: -29 }));
  const gym = make("gym", { x: -130, z: -150 });
  const mall = make("mall", { x: 180, z: -300 });
  const places = [home, hospital, gym, mall, cinema];

  const onRoad = (p: Point): Point => {
    const hit = nearestRoadPoint(map, p);
    return hit ? { x: round(hit.x), z: round(hit.z) } : p;
  };
  /** Seconds to drive or run from a to b at `speed`, with the roads' detours and a margin. */
  const allow = (a: Point, b: Point, speed: number, margin: number) => Math.round((distance(a, b) * 1.5) / speed + margin);
  const juiceShop = onRoad({ x: gym.x - 20, z: gym.z - 110 });
  const ravi = onRoad({ x: home.x + 140, z: home.z - 120 });

  const stories: Story[] = [
    {
      id: "paati-checkup",
      title: "Paati's check-up",
      brief: "Your grandmother has a check-up at Sugam Hospital and has been ready since six in the morning. Drive her there, and home again before her TV serial starts.",
      reward: 400,
      offeredAt: home.id,
      ending: "Paati gives you ₹400 and the rest of her tiffin. The doctor's advice for you: fewer vadas.",
      steps: [
        { type: "enter", label: "Get in a car: Paati is waiting", vehicle: "car" },
        { type: "reach", label: `Drive Paati to ${hospital.name}. Gently: she is holding a tiffin box`, x: hospital.x, z: hospital.z, radius: 10, mode: "car", stop: true },
        { type: "activity", label: `Walk Paati in for her check-up (ENTER ${hospital.name})`, place: hospital.id, activity: "checkup", x: hospital.x, z: hospital.z, radius: hospital.radius },
        { type: "reach", label: "Drive Paati home before her serial starts", x: home.x, z: home.z, radius: 10, mode: "car", stop: true, timeLimit: allow(hospital, home, 9, 90) },
      ],
    },
    {
      id: "gym-bet",
      title: "Selva's gym bet",
      brief: "Your friend Selva bets you can't match his four good reps, then beat him to the juice shop on foot. Loser buys the sugarcane juice.",
      reward: 300,
      offeredAt: gym.id,
      ending: "Selva pays for the juice and the bet, and books a rematch for next week.",
      steps: [
        { type: "activity", label: "Match Selva: 4 good reps out of 5 (in the gym)", place: gym.id, activity: "gym-bet", x: gym.x, z: gym.z, radius: gym.radius },
        { type: "reach", label: "Race Selva to the juice shop, on foot", x: juiceShop.x, z: juiceShop.z, radius: 5, mode: "foot", timeLimit: allow(gym, juiceShop, 6, 20) },
      ],
    },
    {
      id: "first-show",
      title: "First day, first show",
      brief: "Ravi got two tickets for the first show of a new film at Minnal Cinemas. Pick him up on the motorbike and get there before the hero's entry.",
      reward: 250,
      offeredAt: home.id,
      ending: "Ravi pays you back for the petrol. He has already booked the second show.",
      steps: [
        { type: "enter", label: "Get on a motorbike: the show starts soon", vehicle: "bike" },
        { type: "reach", label: "Pick up Ravi (he is still choosing a shirt)", x: ravi.x, z: ravi.z, radius: 7, mode: "bike", stop: true },
        { type: "reach", label: `Ride to ${cinema.name} before the hero's entry`, x: cinema.x, z: cinema.z, radius: 10, mode: "bike", stop: true, timeLimit: allow(ravi, cinema, 9, 40) },
        { type: "activity", label: `Go in for the first show (ENTER ${cinema.name})`, place: cinema.id, activity: "first-show", x: cinema.x, z: cinema.z, radius: cinema.radius },
      ],
    },
  ];
  return { places, stories };
}

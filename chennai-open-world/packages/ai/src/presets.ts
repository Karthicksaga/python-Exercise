/** Ready-made settings for the two kinds of agents. */
import type { AgentSettings } from "./Agents";

const ROAD_SPEED = { secondary: 11, tertiary: 9, residential: 6.5, service: 4, footway: 3 } as const;

export function trafficSettings(count: number): AgentSettings {
  return {
    count,
    speed: (edge, variation) => ROAD_SPEED[edge.kind] * (0.8 + variation * 0.35),
    // The middle of the left-hand lane; narrow lanes are driven nearer the centre.
    lane: (edge) => Math.min(edge.width / 4, 2.6),
    lookAhead: 6,
    turnRate: 2.4,
    acceleration: 2.6,
    braking: 9,
    halfWidth: 1.0,
    gap: 4.5,
    stopsForOncoming: true,
    spawnMin: 70,
    spawnMax: 230,
    despawn: 300,
  };
}

export function pedestrianSettings(count: number): AgentSettings {
  return {
    count,
    speed: (_edge, variation) => 1.1 + variation * 0.5,
    // On the verge beside the carriageway, on either side depending on the person.
    lane: (edge, variation) => (edge.width / 2 + 1.4) * (variation < 0.5 ? 1 : -1),
    lookAhead: 2.5,
    turnRate: 4.5,
    acceleration: 3,
    braking: 6,
    halfWidth: 0.35,
    gap: 0.9,
    stopsForOncoming: false,
    spawnMin: 25,
    spawnMax: 120,
    despawn: 160,
  };
}

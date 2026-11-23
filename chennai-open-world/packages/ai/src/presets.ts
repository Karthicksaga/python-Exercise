/** Ready-made settings for the two kinds of agents. */
import type { RoadKind } from "@cow/game-world";
import type { AgentKind, AgentSettings } from "./Agents";

const ROAD_SPEED: Record<RoadKind, number> = { primary: 13, secondary: 11, tertiary: 9, residential: 6.5, service: 4, footway: 3 };

/**
 * Chennai's traffic mix: two-wheelers and cars, plenty of auto-rickshaws, the odd bus.
 * Sizes here are estimates; the game replaces them with its vehicle models' real footprints.
 * `name` matches the game's vehicle kinds.
 */
export const TRAFFIC_KINDS: readonly AgentKind[] = [
  { name: "car", share: 0.35, speedFactor: 1, maxSpeed: 16, accelerationFactor: 1, halfWidth: 0.82, halfLength: 1.95, gap: 1.8 },
  { name: "bike", share: 0.3, speedFactor: 1.12, maxSpeed: 15, accelerationFactor: 1.25, halfWidth: 0.32, halfLength: 1.0, gap: 1.2 },
  { name: "auto", share: 0.25, speedFactor: 0.82, maxSpeed: 11, accelerationFactor: 0.8, halfWidth: 0.66, halfLength: 1.3, gap: 1.4 },
  { name: "bus", share: 0.1, speedFactor: 0.78, maxSpeed: 11, accelerationFactor: 0.55, halfWidth: 1.25, halfLength: 5.0, gap: 2.5 },
];

export function trafficSettings(count: number, kinds: readonly AgentKind[] = TRAFFIC_KINDS): AgentSettings {
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
    kinds,
    takesTurnsAtJunctions: true,
    retireBeyond: 70,
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
    // Beyond the distance people are drawn at.
    retireBeyond: 90,
    // About a person's half-width (shoulders) plus a little: they pass the player and each other.
    personalSpace: 0.3,
  };
}

/**
 * Where people wait for a ride: on the pavement beside a stop's marker. OSM maps no pavements, so
 * the spot is an estimate: just past the carriageway's edge (half the road's width plus about a
 * metre, beyond the kerb stone), on the side the stop's real place is on, and never on another
 * road's carriageway (at a junction it slides along the road). Buildings in Chennai often start a
 * metre or two back from the carriageway, so the spot stays close to it (`fareSpots.test.ts`
 * checks none lands inside a building).
 */
import { nearestRoadPoint, onOtherRoad, type Point, type WorldMap } from "@cow/game-world";
import type { Fare } from "@cow/missions";

/** Metres past the carriageway's edge where people stand (estimated: just past the kerb). */
export const KERB_STEP = 0.6;

const round = (p: Point): Point => ({ x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 });

/**
 * The pavement spot for a stop at road point `stop`. `side` is a point on the side to wait on
 * (the real hospital, bus stop or address the stop stands for); without one, the left of the
 * road's direction (India drives on the left). `shift` moves the spot that many metres along the
 * road (to a gate where the frontage is built right up to the carriageway).
 */
export function kerbSpot(roads: Pick<WorldMap, "roads">, stop: Point, side?: Point, shift = 0): Point {
  const hit = nearestRoadPoint(roads, stop);
  if (!hit) return stop;
  // Right of the road's direction is (cos h, -sin h) for heading h (0 = north, -Z).
  const right = { x: Math.cos(hit.heading), z: -Math.sin(hit.heading) };
  const wanted = side && Math.hypot(side.x - hit.x, side.z - hit.z) > 0.5 ? Math.sign((side.x - hit.x) * right.x + (side.z - hit.z) * right.z) || -1 : -1;
  const out = hit.road.width / 2 + KERB_STEP;
  const forward = { x: -Math.sin(hit.heading), z: -Math.cos(hit.heading) };
  const same = { roads: roads.roads.filter((r) => r === hit.road || (hit.road.name !== undefined && r.name === hit.road.name && r.kind !== "footway")) };
  for (const slide of [0, 6, -6, 12, -12, 20, -20].map((d) => d + shift)) {
    // Along the road itself (it may bend), then out to the side.
    const at = slide === 0 ? hit : (nearestRoadPoint(same, { x: hit.x + forward.x * slide, z: hit.z + forward.z * slide }) ?? hit);
    const r = { x: Math.cos(at.heading), z: -Math.sin(at.heading) };
    // Keep to the same side of the road when its drawn direction flips between pieces.
    const flip = r.x * right.x + r.z * right.z < 0 ? -1 : 1;
    for (const s of [wanted, -wanted]) {
      const p = { x: at.x + r.x * out * s * flip, z: at.z + r.z * out * s * flip };
      if (!onOtherRoad(roads.roads, p, at.road.id, 0.5)) return round(p);
    }
  }
  return round({ x: hit.x + right.x * out * wanted, z: hit.z + right.z * out * wanted });
}

/** A fare at a stop: people getting in (`board`) and out (`alight`), waiting on the pavement beside it. */
export function fareAt(roads: Pick<WorldMap, "roads">, stop: Point, people: { board?: number; alight?: number; patient?: boolean; shift?: number; party?: "wedding" }, side?: Point): Fare {
  return {
    ...(people.board ? { board: people.board } : {}),
    ...(people.alight ? { alight: people.alight } : {}),
    ...(people.patient ? { patient: true } : {}),
    ...(people.party ? { party: people.party } : {}),
    kerb: kerbSpot(roads, stop, side, people.shift),
  };
}

/** A point 20 m to the right of the road through `p` (its drawn direction): a `side` for `kerbSpot` where the left is built up. */
export function rightOfRoad(roads: Pick<WorldMap, "roads">, p: Point): Point | undefined {
  const hit = nearestRoadPoint(roads, p);
  return hit ? { x: hit.x + Math.cos(hit.heading) * 20, z: hit.z - Math.sin(hit.heading) * 20 } : undefined;
}

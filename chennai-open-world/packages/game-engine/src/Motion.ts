/**
 * Where something moving was at the last two fixed steps, so a frame can draw it part-way
 * between them (`GameLoop` passes how far, `alpha`). Without this, things move in uneven jumps
 * whenever display frames and physics steps don't line up, which looks like shaking.
 */
export interface Pose {
  x: number;
  y: number;
  z: number;
  /** Heading (radians about the vertical axis). */
  heading: number;
}

/** A move larger than this in one step is a teleport or a respawn: drawn at once, not slid. */
const JUMP = 8;

export class Motion {
  private readonly previous: Pose = { x: 0, y: 0, z: 0, heading: 0 };
  private readonly current: Pose = { x: 0, y: 0, z: 0, heading: 0 };
  private readonly drawn: Pose = { x: 0, y: 0, z: 0, heading: 0 };
  private started = false;
  private generation: number | null = null;

  /**
   * Record where it is after a fixed step. A different `generation` (a respawned agent reusing
   * the same slot) or a long jump starts afresh, so it isn't drawn sliding across the map.
   */
  step(x: number, y: number, z: number, heading: number, generation: number | null = null): void {
    const jumped = !this.started || generation !== this.generation || Math.hypot(x - this.current.x, z - this.current.z, y - this.current.y) > JUMP;
    if (jumped) set(this.previous, x, y, z, heading);
    else set(this.previous, this.current.x, this.current.y, this.current.z, this.current.heading);
    set(this.current, x, y, z, heading);
    this.started = true;
    this.generation = generation;
  }

  /** Start afresh here (a teleport): no sliding from the old place. */
  snap(x: number, y: number, z: number, heading: number): void {
    set(this.previous, x, y, z, heading);
    set(this.current, x, y, z, heading);
    this.started = true;
  }

  /** Where to draw it, `alpha` (0 to 1) of the way from the previous step to the last one. The result is reused. */
  at(alpha: number): Pose {
    const a = Math.max(0, Math.min(1, alpha));
    const p = this.previous;
    const c = this.current;
    // The short way round, so a heading crossing ±π doesn't spin the long way.
    const turn = Math.atan2(Math.sin(c.heading - p.heading), Math.cos(c.heading - p.heading));
    return set(this.drawn, p.x + (c.x - p.x) * a, p.y + (c.y - p.y) * a, p.z + (c.z - p.z) * a, p.heading + turn * a);
  }
}

function set(pose: Pose, x: number, y: number, z: number, heading: number): Pose {
  pose.x = x;
  pose.y = y;
  pose.z = z;
  pose.heading = heading;
  return pose;
}

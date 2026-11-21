/**
 * The people of a share auto shift: animated figures standing at the kerb for those waiting
 * (only the few near the player), and baked seated figures in the auto for those aboard. The
 * rules (who waits where, who is aboard) are `ShareShift` in `@cow/missions`.
 */
import type * as THREE from "three";
import { SHARE_AUTO, type ShareShift } from "@cow/missions";
import type { HumanAssets, HumanFigure } from "@cow/player";

/** Waiting people farther than this from the player are not drawn (metres). */
const SHOW_RADIUS = 160;
/** Clothing tints for passengers (multiplied with the model's own colours). */
const CLOTHES = [0xe0c29f, 0x9fb8e0, 0xd9a0a0, 0xa9d6a9, 0xe6dd9a, 0xb7a3d6];
/**
 * Where people sit in the auto, relative to its chassis centre (feet, like `VehicleType.driver`):
 * three across the rear bench, then the fourth squeezed beside the driver. Estimated by eye.
 */
export const SEATS: ReadonlyArray<{ x: number; y: number; z: number }> = [
  // Hip centres (seated figures are placed by their hips, as `VehicleType.driver` is), estimated from
  // the Blender auto: bench top about 0.07 m and floor about -0.30 m in the model frame, bench 0.88 m
  // behind the centre; the fourth passenger shares the driver's saddle, on the left.
  { x: -0.36, y: 0.17, z: 0.8 },
  { x: 0.36, y: 0.17, z: 0.8 },
  { x: 0, y: 0.17, z: 0.8 },
  { x: -0.3, y: 0.22, z: -0.4 },
];

/** Passengers sit back with their hands loosely closed on their laps and feet on the floor (estimated). */
export const PASSENGER: Parameters<HumanAssets["seatedStatic"]>[1] = { lean: -0.08, hand: { x: 0.15, y: 0.05, z: -0.28 }, foot: { x: 0.15, y: -0.37, z: -0.42 }, grip: 0.35 };

export class ShareRiders {
  private readonly standing: HumanFigure[] = [];
  private readonly seated: THREE.Object3D[] = [];
  /** The auto the seated people are in. */
  private seatedIn: THREE.Object3D | null = null;
  private shownCount = 0;

  constructor(
    private readonly scene: THREE.Object3D,
    private readonly humans: HumanAssets,
  ) {}

  /** People drawn now: waiting at the kerb, and seated in the auto (for tests). */
  get drawn(): { waiting: number; seated: number } {
    return { waiting: this.shownCount, seated: this.seated.length };
  }

  /**
   * Once per rendered frame.
   * @param auto the auto the player is driving on the shift, or null
   */
  frame(dt: number, shift: ShareShift | null, at: { x: number; z: number }, auto: THREE.Object3D | null): void {
    let shown = 0;
    if (shift) {
      for (const p of shift.waiting) {
        if (shown >= SHARE_AUTO.maxWaiting) break;
        if (Math.hypot(p.x - at.x, p.z - at.z) > SHOW_RADIUS) continue;
        const figure = this.figure(shown++);
        figure.object.visible = true;
        figure.object.position.set(p.x, 0, p.z);
        // Facing the road, towards where the auto will pull up.
        figure.object.rotation.y = Math.atan2(-(p.stop.x - p.x), -(p.stop.z - p.z));
        figure.update(dt, 0, true);
      }
    }
    for (let i = shown; i < this.standing.length; i++) this.standing[i]!.object.visible = false;
    this.shownCount = shown;
    this.seat(shift && auto ? shift.aboard : 0, auto);
  }

  private figure(i: number): HumanFigure {
    let figure = this.standing[i];
    if (!figure) {
      figure = this.humans.create(CLOTHES[i % CLOTHES.length]!, true);
      this.scene.add(figure.object);
      this.standing.push(figure);
    }
    return figure;
  }

  /** Seat `count` people in the auto (none when it is null). */
  private seat(count: number, auto: THREE.Object3D | null): void {
    if (auto !== this.seatedIn) {
      for (const person of this.seated) person.removeFromParent();
      this.seated.length = 0;
      this.seatedIn = auto;
    }
    if (!auto) return;
    while (this.seated.length > count) this.seated.pop()!.removeFromParent();
    while (this.seated.length < Math.min(count, SEATS.length)) {
      const seat = SEATS[this.seated.length]!;
      // Copies share the baked geometry per tint, so a passenger costs a few draw calls and no skeleton.
      const person = this.humans.seatedStatic(CLOTHES[(this.seated.length + 3) % CLOTHES.length]!, PASSENGER);
      person.position.set(seat.x, seat.y, seat.z);
      auto.add(person);
      this.seated.push(person);
    }
  }
}

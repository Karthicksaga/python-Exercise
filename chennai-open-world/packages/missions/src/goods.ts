/**
 * Goods: things handed over at a stage's or a job's pick-up and drop (a courier's parcel, lunch
 * boxes, a bag of biryani, the gang's bag of money). Like a fare (`fares.ts`), a pick-up used to
 * be only a marker to stop at; now someone waits at the kerb holding the goods, walks to the
 * vehicle once it has stopped and puts them in its cargo place, and only then is the stop done.
 * At a drop someone walks up and takes them. One person per stop, carrying everything handed
 * over there in one trip.
 *
 * Pure logic, one `GoodsStop` per stop, so the game can draw the person and the goods
 * (`GoodsFigures` in the game) from `person()` and `cargoAboard`. All times are estimates.
 *
 * Rules:
 * - Nobody moves until the vehicle is stopped in the marker (`ready`).
 * - Someone walking to the vehicle walks back if it drives off before they reach it. Once at the
 *   vehicle they finish the handover whatever happens.
 * - The stop is done once the goods have changed hands; the person walks off on their own after.
 */
import { FARES, walkTime, type FarePoint, type FareVehicle } from "./fares";

/** What is carried. The game draws each one (`goodsModels.ts`). */
export type GoodsKind =
  /** A taped cardboard parcel. */
  | "parcel"
  /** An insulated food-delivery bag. */
  | "food-bag"
  /** A steel tiffin carrier (lunch box). */
  | "tiffin"
  /** A small white box of medicine. */
  | "medicine"
  /** A cloth sack of cash. */
  | "cash-bag"
  /** A harmonium in its wooden case. */
  | "harmonium";

/** Who stands at the kerb, for how they are drawn only (no effect on the rules). */
export type GoodsPerson = "sender" | "recipient" | "shopkeeper";

export interface Goods {
  /** "load": the person at the kerb hands the goods over; "unload": they take them. */
  readonly action: "load" | "unload";
  /** Everything handed over here, in one trip. */
  readonly items: readonly GoodsKind[];
  /** Where the person waits, on the pavement beside the marker. */
  readonly kerb: FarePoint;
  readonly who?: GoodsPerson;
  /**
   * For a drop whose goods were not loaded at an earlier stop: "start", aboard from the start of
   * the stage (parcels already in the car); "here", aboard only while this stop is current (got
   * back in a chase just before).
   */
  readonly aboard?: "start" | "here";
}

/** Every timing in one place. Estimates. */
export const GOODS = {
  /** Seconds at the vehicle to put the goods in its cargo place, or take them out, by vehicle. */
  hand: { auto: 1.4, car: 1.8, ambulance: 1.8, bus: 1.4, bike: 1.6 } as Readonly<Record<FareVehicle, number>>,
  /** Share of the handover at which the goods leave one pair of hands for the other place. */
  swap: 0.5,
} as const;

export type GoodsStage =
  /** At the kerb, walking to the vehicle, handing over, done (walking off). */
  "waiting" | "walking" | "handing" | "done";

export interface GoodsPersonState {
  readonly stage: GoodsStage;
  /** How far through the stage, 0 to 1 (0 for waiting and done). */
  readonly share: number;
  /** Seconds the walk to the vehicle takes. */
  readonly walkSeconds: number;
  /** Who holds the goods now: the person ("hands") or the vehicle ("vehicle"). */
  readonly holder: "hands" | "vehicle";
}

export class GoodsStop {
  private t = 0;
  private walk = 0;
  private readonly hand: number;

  constructor(
    readonly goods: Goods,
    readonly vehicle: FareVehicle,
  ) {
    this.hand = GOODS.hand[vehicle];
  }

  /** The person has started moving: the stage's clock waits while the goods change hands. */
  get started(): boolean {
    return this.t > 0;
  }

  get done(): boolean {
    return this.walk > 0 && this.t >= this.walk + this.hand;
  }

  /** The goods are in the vehicle (loaded) or out of it (unloaded) already. */
  get swapped(): boolean {
    return this.walk > 0 && this.t >= this.walk + this.hand * GOODS.swap;
  }

  /**
   * One step.
   * @param ready the vehicle is stopped in the marker, with the player driving it
   * @param at the vehicle's position (the walk is measured from the kerb point to it)
   * @returns true once the goods have changed hands
   */
  step(dt: number, ready: boolean, at: FarePoint): boolean {
    if (this.done) return true;
    const atVehicle = this.walk > 0 && this.t >= this.walk;
    if (atVehicle) {
      this.t += dt;
    } else if (ready) {
      // The walk is measured as they set off, from where the vehicle stands then.
      if (this.t === 0) this.walk = walkTime(Math.max(0, Math.hypot(at.x - this.goods.kerb.x, at.z - this.goods.kerb.z) - FARES.doorOffset));
      this.t += dt;
    } else if (this.t > 0) {
      // The vehicle moved off before they reached it: they walk back to the kerb.
      this.t = Math.max(0, this.t - dt);
    }
    return this.done;
  }

  person(): GoodsPersonState {
    const loaded = this.goods.action === "load";
    const holder = this.swapped === loaded ? "vehicle" : "hands";
    const base = { walkSeconds: this.walk, holder } as const;
    if (this.t <= 0 || this.walk <= 0) return { ...base, stage: "waiting", share: 0 };
    if (this.t < this.walk) return { ...base, stage: "walking", share: this.t / this.walk };
    if (this.t < this.walk + this.hand) return { ...base, stage: "handing", share: (this.t - this.walk) / this.hand };
    return { ...base, stage: "done", share: 0 };
  }

  /** A line for the HUD while the goods change hands, or null. */
  note(): string | null {
    if (!this.started || this.done) return null;
    const what = goodsName(this.goods.items);
    return this.goods.action === "load" ? `${capital(what)} being loaded` : `${capital(what)} being collected`;
  }
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "the parcel", "the lunch boxes", for the HUD. */
export function goodsName(items: readonly GoodsKind[]): string {
  const kinds = new Set(items);
  const many = items.length > 1;
  if (kinds.size !== 1) return "the goods";
  const NAMES: Record<GoodsKind, [string, string]> = {
    parcel: ["the parcel", "the parcels"],
    "food-bag": ["the order", "the orders"],
    tiffin: ["the lunch box", "the lunch boxes"],
    medicine: ["the medicine", "the medicine"],
    "cash-bag": ["the money", "the money"],
    harmonium: ["the harmonium", "the harmoniums"],
  };
  return NAMES[items[0]!][many ? 1 : 0];
}

/**
 * What is in the vehicle now, in the order it will be taken out: everything still to be dropped
 * at this or a later stop, less what is still to be loaded there.
 * @param stops each stop's goods, in order (undefined for a stop without any)
 * @param index the current stop
 * @param current the current stop's handover, when it has goods
 */
export function cargoAboard(stops: ReadonlyArray<Goods | undefined>, index: number, current: GoodsStop | null): GoodsKind[] {
  const aboard: GoodsKind[] = [];
  const toLoad = new Map<GoodsKind, number>();
  for (let i = Math.max(0, index); i < stops.length; i++) {
    const goods = stops[i];
    if (!goods) continue;
    const here = i === index;
    const swapped = here && current?.goods === goods && current.swapped;
    if (goods.action === "unload") {
      // Recovered goods are aboard only once their stop is current (`aboard: "here"`).
      if (goods.aboard === "here" && !here) continue;
      if (!swapped) aboard.push(...goods.items);
    } else if (!swapped) {
      for (const item of goods.items) toLoad.set(item, (toLoad.get(item) ?? 0) + 1);
    }
  }
  // Goods still to be loaded are not aboard yet: take them off the end (the last to be dropped).
  for (let i = aboard.length - 1; i >= 0; i--) {
    const item = aboard[i]!;
    const n = toLoad.get(item) ?? 0;
    if (n > 0) {
      toLoad.set(item, n - 1);
      aboard.splice(i, 1);
    }
  }
  return aboard;
}

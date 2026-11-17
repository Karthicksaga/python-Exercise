/** Mission data. Missions are plain data so new ones need no code. */

export type TravelMode = "foot" | "car" | "auto" | "bike" | "ambulance" | "bus";

export type Objective =
  | {
      readonly type: "reach";
      /** Instruction shown to the player. */
      readonly label: string;
      readonly x: number;
      readonly z: number;
      readonly radius: number;
      /** Required way of travelling; any when omitted. */
      readonly mode?: TravelMode;
      /** The player must come to a stop inside the marker (pick-ups and drop-offs). */
      readonly stop?: boolean;
      /** Seconds allowed for this objective; running out fails the mission. */
      readonly timeLimit?: number;
      /** An enemy group the game places while this objective is current (an ambush on the way); it need not be beaten. */
      readonly hostiles?: string;
    }
  | {
      /**
       * Catch someone getting away (a gang courier on a motorbike): they flee along `path` at
       * `speed` from the moment the objective starts; get within `radius` of them in a vehicle.
       * Reaching the end of the path fails the mission.
       */
      readonly type: "chase";
      readonly label: string;
      /** Road points the quarry follows, in order (metres). */
      readonly path: readonly { readonly x: number; readonly z: number }[];
      /** The quarry's speed, m/s. */
      readonly speed: number;
      readonly radius: number;
      /** Vehicle kind the quarry rides, for drawing it. */
      readonly quarry: Exclude<TravelMode, "foot">;
    }
  | {
      readonly type: "defeat";
      readonly label: string;
      /** Name of the enemy group that must be beaten; the game places it when this objective starts. */
      readonly group: string;
      /** Where the group is, for the marker. */
      readonly x: number;
      readonly z: number;
      readonly radius: number;
    }
  | {
      readonly type: "enter";
      readonly label: string;
      readonly vehicle: Exclude<TravelMode, "foot">;
    };

export interface Mission {
  readonly id: string;
  /** Stage number shown to the player, starting at 1. */
  readonly stage: number;
  readonly title: string;
  /** One or two sentences of story. */
  readonly brief: string;
  /** Rupees paid on completion. */
  readonly reward: number;
  /** Weapons (and rounds) handed over on completion: weapon ids as `@cow/combat` names them. */
  readonly weapons?: readonly { readonly id: string; readonly ammo: number }[];
  readonly objectives: readonly Objective[];
}

/** What the mission system needs to know about the player each step. */
export interface PlayerStatus {
  readonly x: number;
  readonly z: number;
  readonly mode: TravelMode;
  /** Speed in m/s. */
  readonly speed: number;
  /** Enemy groups that have been completely beaten. */
  readonly cleared?: ReadonlySet<string>;
}

export interface Progress {
  readonly completed: readonly string[];
  readonly money: number;
}

export type MissionEvent =
  | { readonly type: "objective"; readonly label: string }
  | { readonly type: "completed"; readonly mission: Mission }
  | { readonly type: "failed"; readonly mission: Mission; readonly reason: string }
  | { readonly type: "allDone" };

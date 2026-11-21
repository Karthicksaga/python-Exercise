/**
 * Places the player can go into (home, hospital, gym, mall, cinema) and the short stories that
 * use them. Offers ENTER at an entrance, shows each place's screen, applies what an activity
 * did (money through the shared total, health, the game clock, clothes, fitness), runs the
 * current story and saves the life state inside the stage save. The rules are in
 * `@cow/missions` (`Life`, `StoryRunner`); this file connects them to the game.
 */
import type { Sound } from "@cow/audio";
import {
  FILMS,
  GYM_PASS,
  Life,
  MAX_FITNESS,
  OUTFITS,
  POPCORN_PRICE,
  SNACKS,
  StoryRunner,
  TICKET_PRICE,
  WORKOUT_REPS,
  WORKOUT_ZONE,
  clockText,
  lifeFromSave,
  needleAt,
  nextShow,
  saveWithLife,
  sleepHours,
  treatmentFee,
  type LifeState,
  type MissionRunner,
  type Now,
  type Objective,
  type Outcome,
  type Place,
  type PlayerStatus,
  type Story,
  type StoryEvent,
  type TravelMode,
} from "@cow/missions";
import { PLACE_COLORS, PlaceScreen, type Hud, type MinimapMarker, type MissionView, type PlaceChoice, type SceneLine } from "@cow/ui";

/** The stage save; the life state is kept inside it under `life`. */
export const PROGRESS_KEY = "cow-progress-v1";

function readSave(): unknown {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    return raw ? (JSON.parse(raw) as unknown) : undefined;
  } catch {
    return undefined;
  }
}

/** What the desk needs from the game. */
export interface PlaceHost {
  /** Stop the game behind a screen (no pause screen). */
  hold(): void;
  release(): void;
  health(): number;
  setHealth(health: number): void;
  /** Game time, 0–24. */
  hour(): number;
  /** Move the clock on (and save it). */
  passHours(hours: number): void;
  /** Save the stage progress and money (after the life state is saved). */
  saveMoney(): void;
  /** Save everything (sleeping at home saves the game). */
  saveAll(): void;
  /** Colour of the player's clothes. */
  dress(tint: number): void;
  /** Multiplier on the player's sprint speed. */
  sprint(factor: number): void;
  /** True while a city job is being worked. */
  jobActive(): boolean;
}

/** What tests and debugging read about places and life. */
export interface PlaceSnapshot {
  readonly places: Array<{ id: string; kind: string; name: string; x: number; z: number; radius: number }>;
  readonly life: LifeState;
  readonly story: string | null;
  readonly storyStep: number;
  readonly placeOpen: string | null;
  readonly sprint: number;
}

const FIRST_SHOW_FILM = "roundtana-thunder";

export class PlaceDesk {
  private readonly life = new Life(lifeFromSave(readSave()));
  readonly stories: StoryRunner;
  private readonly screen: PlaceScreen;
  private open: Place | null = null;
  /** The last vehicle the player drove (an ambulance makes treatment free). */
  private lastVehicle: TravelMode | null = null;
  private lastHour: number;

  constructor(
    readonly places: readonly Place[],
    stories: readonly Story[],
    private readonly money: MissionRunner,
    private readonly hud: Hud,
    private readonly sound: Sound,
    private readonly host: PlaceHost,
  ) {
    this.stories = new StoryRunner(stories, this.life.state().stories);
    this.screen = new PlaceScreen(hud.root);
    this.lastHour = host.hour();
    this.applyLook();
  }

  /** Clothes and sprint speed follow the life state. */
  private applyLook(): void {
    this.host.dress(this.life.outfit.tint);
    this.host.sprint(this.life.sprint);
  }

  get story(): Story | null {
    return this.stories.story;
  }

  /** The place whose entrance the player is standing at, on foot. */
  near(at: { x: number; z: number }): Place | null {
    for (const place of this.places) if (Math.hypot(place.x - at.x, place.z - at.z) <= place.radius) return place;
    return null;
  }

  private now(): Now {
    return { hour: this.host.hour(), money: this.money.balance, health: this.host.health() };
  }

  /** Take what an activity did: money, health, time. Returns its message. */
  private apply(outcome: Outcome): string {
    if (!outcome.ok) {
      this.sound.click();
      return outcome.message;
    }
    if (outcome.cost > 0) {
      this.money.charge(outcome.cost);
      this.sound.cash();
    }
    if (outcome.health !== undefined) this.host.setHealth(outcome.health);
    if (outcome.hours > 0) this.passHours(outcome.hours);
    this.applyLook();
    this.save();
    return outcome.message;
  }

  private passHours(hours: number): void {
    this.host.passHours(hours);
    // The days were counted by the rules; don't count this jump again as the clock passing midnight.
    this.lastHour = this.host.hour();
  }

  // Screens --------------------------------------------------------------------------------

  enter(place: Place): void {
    this.open = place;
    this.host.hold();
    this.sound.door();
    if (place.kind === "mall") {
      this.menu(this.apply(this.life.escalator(this.now())));
      return;
    }
    this.menu();
  }

  private leave(): void {
    this.screen.close();
    this.open = null;
    this.host.release();
  }

  /** Show the open place's menu, with `message` (what just happened) at the top. */
  private menu(message?: string): void {
    const place = this.open;
    if (!place) return;
    const rows: PlaceChoice[] = [...this.storyRows(place)];
    const now = this.now();
    const run = (outcome: () => Outcome) => () => this.menu(this.apply(outcome()));
    let text = message ?? "";
    switch (place.kind) {
      case "home":
        text ||= `Your flat in Anna Nagar. It is ${clockText(now.hour)}.`;
        rows.push(
          { title: "Sleep until morning", detail: "Wake up at 07:00 with full health. The game is saved.", meta: `${sleepHours(now.hour).toFixed(1)} h`, button: "Sleep", testId: "home-sleep", run: () => this.sleep() },
          { title: "Change clothes", detail: `Wearing the ${this.life.outfit.name.toLowerCase()}.`, meta: `${OUTFITS.filter((o) => this.life.owns(o.id)).length} outfits`, button: "Change", testId: "home-clothes", run: run(() => this.life.changeClothes()) },
        );
        break;
      case "hospital": {
        text ||= `${place.name}. The waiting room TV is showing a cooking show at full volume.`;
        const free = this.lastVehicle === "ambulance";
        const fee = treatmentFee(now.health, free);
        rows.push(
          {
            title: "Get treated",
            detail: free ? "You came with the ambulance: treatment is free." : "Restores your health. Fee by how hurt you are.",
            meta: `${fee > 0 ? `₹${fee}` : "free"} · 30 min · health ${Math.round(now.health)}`,
            button: "Treat",
            testId: "hospital-treat",
            run: () => {
              const outcome = this.life.treat(this.now(), free);
              if (outcome.ok && free) this.lastVehicle = null;
              this.menu(this.apply(outcome));
            },
          },
          { title: "Free counter", detail: "No fee. Take a token and wait.", meta: "free · 3 h", button: "Queue", testId: "hospital-queue", run: run(() => this.life.freeQueue(this.now())) },
        );
        break;
      }
      case "gym":
        text ||= `${place.name}. Someone is grunting very loudly at a very small dumbbell.`;
        rows.push({
          title: "Workout",
          detail: `Tap when the needle is in the green, ${WORKOUT_REPS} reps. The first good workout of a day raises fitness (faster sprint).`,
          meta: `₹${GYM_PASS} day pass · fitness ${this.life.fitness}/${MAX_FITNESS}${this.life.trainedToday() ? " · trained today" : ""}`,
          button: "Train",
          testId: "gym-workout",
          run: () => this.workout(false),
        });
        break;
      case "mall":
        text ||= `${place.name}.`;
        text += " A banner over the shops: BUY 1 GET 1*.";
        for (const snack of SNACKS) {
          rows.push({ title: snack.name, detail: `+${snack.health} health`, meta: `₹${snack.price}`, button: "Buy", testId: `buy-${snack.id}`, run: run(() => this.life.buySnack(this.now(), snack.id)) });
        }
        for (const outfit of OUTFITS.filter((o) => o.price > 0)) {
          rows.push({
            title: outfit.name,
            detail: "Clothes: you wear them at once. Change at home.",
            meta: `₹${outfit.price}`,
            button: "Buy",
            testId: `buy-${outfit.id}`,
            ...(this.life.owns(outfit.id) ? { disabled: "You own this one." } : {}),
            run: run(() => this.life.buyOutfit(this.now(), outfit.id)),
          });
        }
        break;
      case "cinema": {
        const show = nextShow(now.hour);
        text ||= `${place.name}. Next show at ${clockText(show.start)}. Tickets ₹${TICKET_PRICE}.`;
        for (const film of FILMS) {
          rows.push({
            title: `${film.title} · ${film.genre}`,
            detail: film.plot,
            meta: `${clockText(show.start)} · ₹${TICKET_PRICE} · ${film.runtime} h${this.life.state().films.includes(film.id) ? " · seen" : ""}`,
            button: "Ticket",
            testId: `film-${film.id}`,
            run: () => this.watch(film.id, false),
          });
        }
        break;
      }
    }
    const actions = [{ label: "Leave", run: () => this.leave(), testId: "place-leave" }];
    if (this.stories.story) actions.push({ label: "Quit story", run: () => this.handle(this.stories.quit(), true), testId: "story-quit" });
    this.screen.menu(place.name, text, rows, actions);
  }

  /** The current story's step here, then the stories this place offers. */
  private storyRows(place: Place): PlaceChoice[] {
    const rows: PlaceChoice[] = [];
    const story = this.stories.story;
    const wanted = this.stories.wanted(place.id);
    if (story && wanted) {
      rows.push({ title: `Story · ${story.title}`, detail: wanted.label, button: "Go", testId: "story-step", run: () => this.storyActivity(place, wanted.activity) });
    }
    for (const offered of this.stories.offeredAt(place.id)) {
      const busy = this.stories.story ? "Finish the story you are on first." : this.host.jobActive() ? "Finish your job first." : undefined;
      rows.push({ title: `Story · ${offered.title}`, detail: offered.brief, meta: `₹${offered.reward}`, button: "Start", testId: `story-${offered.id}`, ...(busy ? { disabled: busy } : {}), run: () => this.startStory(place, offered.id) });
    }
    return rows;
  }

  private sleep(): void {
    const message = this.apply(this.life.sleep(this.now()));
    this.host.saveAll();
    this.menu(message);
  }

  /** The gym's tap-timing workout. @param bet Selva's bet: 4 good reps needed, he pays */
  private workout(bet: boolean): void {
    if (!bet && this.money.balance < GYM_PASS) {
      this.menu(this.apply(this.life.workout(this.now(), 0)));
      return;
    }
    const intro = bet ? "Selva did 4 good reps. Your turn: tap when the needle is in the green." : "Tap when the needle is in the green.";
    this.screen.workout("Workout", intro, { reps: WORKOUT_REPS, needle: needleAt, zone: WORKOUT_ZONE }, (good) => {
      const message = this.apply(this.life.workout(this.now(), good, bet));
      if (!bet) {
        this.menu(message);
        return;
      }
      if (good >= 4) {
        this.handle(this.stories.activity("gym", "gym-bet"));
        this.menu(`You matched Selva with ${good} good reps! ${message} Now he says: last one to the juice shop pays.`);
      } else {
        this.menu(`Only ${good} good reps. Selva flexes. Try again: tap Go.`);
      }
    });
  }

  /** Buy a ticket and watch. @param free a story pays for it */
  private watch(filmId: string, free: boolean, after?: () => void): void {
    const outcome = this.life.watch(this.now(), filmId, free);
    const message = this.apply(outcome);
    if (!outcome.ok || !outcome.film) {
      this.menu(message);
      return;
    }
    const lines: SceneLine[] = outcome.lines.map((line) =>
      line.startsWith("INTERVAL")
        ? { text: line, extra: { label: `Popcorn ₹${POPCORN_PRICE}`, testId: "buy-popcorn", run: () => this.apply(this.life.popcorn(this.now())) } }
        : line,
    );
    if (free) lines.splice(1, 0, "First day, first show: fans burst into cheers at the opening card, and Ravi films the screen on his phone.");
    this.screen.scene(outcome.film.title, lines, () => {
      after?.();
      this.menu(message);
    });
  }

  private storyActivity(place: Place, activity: string): void {
    if (activity === "gym-bet") {
      this.workout(true);
      return;
    }
    if (activity === "first-show") {
      this.watch(FIRST_SHOW_FILM, true, () => this.handle(this.stories.activity(place.id, activity)));
      return;
    }
    if (activity === "checkup") {
      const lines = [
        "Paati tells the receptionist your whole family history, including your exam marks.",
        "The doctor says her blood pressure is perfect. Paati says it is because she doesn't watch the news.",
        "On the way out she books you an appointment too: \"for his vada problem\".",
      ];
      this.screen.scene("Paati's check-up", lines, () => {
        this.passHours(1);
        this.handle(this.stories.activity(place.id, activity));
        this.menu("Check-up done. Paati is already waiting by the car.");
      });
    }
  }

  private startStory(place: Place, id: string): void {
    this.handle(this.stories.start(id));
    const step = this.stories.step;
    // A story that begins inside this place carries on here; otherwise go and do it.
    if (step?.type === "activity" && step.place === place.id) this.menu(this.stories.story?.brief);
    else this.leave();
  }

  private handle(events: StoryEvent[], reopen = false): void {
    for (const event of events) {
      switch (event.type) {
        case "started":
          this.sound.chime();
          this.hud.showToast(event.story.title, event.story.brief, 5);
          break;
        case "step":
          this.sound.chime();
          break;
        case "completed":
          this.money.earn(event.reward);
          this.life.finishStory(event.story.id);
          this.save();
          this.host.saveMoney();
          this.sound.fanfare();
          this.sound.cash();
          this.hud.showToast(`${event.story.title} complete · +₹${event.reward}`, event.story.ending, 6);
          break;
        case "failed":
          this.sound.fail();
          this.hud.showToast(event.reason, `${event.story.title}: start it again from where it began.`, 4);
          break;
      }
    }
    if (reopen) this.menu();
  }

  // Each step --------------------------------------------------------------------------------

  /** One fixed step: count midnights, note the vehicle, run the story. */
  fixedUpdate(dt: number, player: PlayerStatus): void {
    const hour = this.host.hour();
    this.life.tick(this.lastHour, hour);
    this.lastHour = hour;
    if (player.mode !== "foot") this.lastVehicle = player.mode;
    if (this.stories.story && !this.host.jobActive()) this.handle(this.stories.update(dt, player));
  }

  /** The story's current step as a stage objective, for the marker (an activity is its entrance). */
  objective(): Objective | null {
    const step = this.stories.step;
    if (!step) return null;
    if (step.type === "activity") return { type: "reach", label: step.label, x: step.x, z: step.z, radius: step.radius };
    return step;
  }

  view(distance: number | null): MissionView | null {
    const story = this.stories.story;
    const step = this.stories.step;
    if (!story || !step) return null;
    return { title: `Story · ${story.title}`, objective: step.label, distance, secondsLeft: this.stories.secondsLeft };
  }

  markers(): MinimapMarker[] {
    return this.places.map((p) => ({ x: p.x, z: p.z, color: PLACE_COLORS[p.kind], icon: p.kind, size: 6 }));
  }

  snapshot(): PlaceSnapshot {
    return {
      places: this.places.map((p) => ({ id: p.id, kind: p.kind, name: p.name, x: p.x, z: p.z, radius: p.radius })),
      life: this.life.state(),
      story: this.stories.story?.id ?? null,
      storyStep: this.stories.stepNumber,
      placeOpen: this.open?.id ?? null,
      sprint: this.life.sprint,
    };
  }

  /** Write the life state into the stage save, keeping its other fields. */
  save(): void {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(saveWithLife(readSave(), this.life.state())));
    } catch {
      // No storage: play on without saving.
    }
  }

  /** New game. */
  reset(): void {
    this.screen.close();
    this.open = null;
    this.life.reset();
    this.stories.reset();
    this.lastVehicle = null;
    this.applyLook();
    this.save();
  }
}

/**
 * Composition root: builds the world, physics, player, vehicles, missions, camera and
 * controls, and runs the loop. Each concern lives in its own package; this file connects them
 * and owns the one piece of state they share: whether the player is on foot or driving.
 */
import * as THREE from "three";
import { Beacon, ChunkManager, FollowCamera, GameLoop, HAZE, MapView, Motion, SceneRenderer, createChunkAssets, facadeAtlas, loadPropAssets, type Quality } from "@cow/game-engine";
import { Sound, soundKind, type SoundState } from "@cow/audio";
import { COMBAT_FEEL, chooseLock, type CivilianOutcome } from "@cow/combat";
import { Combat, PLAYER_MAX_HEALTH, hitPenalty, isPoliceGroup, type CasualtyState, type CombatEvent, type HitOutcome, type PlayerState, type WeaponId } from "@cow/combat";
import { DistrictIndex, GameClock, VisitedDistricts, boundarySolids, chunkFurniture, chunkProps, chunkSolids, propSolids, coastSolids, furnitureSolids, distanceToCoast, nearestRoadPoint, type WorldMap } from "@cow/game-world";
import { MissionRunner, type MissionEvent, type Objective, type Progress } from "@cow/missions";
import { PhysicsWorld, type StaticGroup, type VehicleControls } from "@cow/physics";
import { CrowdFigures, HumanAssets, PLAYER_HEIGHT, PLAYER_RADIUS, PlayerController, platformCast, type HumanFigure } from "@cow/player";
import { CombatMarks, Hud, Minimap, TouchControls, type MinimapMarker } from "@cow/ui";
import { Gearbox, Vehicle, loadVehicleModels, setVehicleNightLights, shiftedUp } from "@cow/vehicles";
import { buildContent, type GameContent } from "./content";
import { Boarder, type BoardingSnapshot } from "./Boarder";
import { Fighters, combatWorld } from "./Fighters";
import { Arms, type ArmsSnapshot } from "./Arms";
import { JobDesk, type ShareSnapshot } from "./JobDesk";
import { PlaceDesk, type PlaceSnapshot } from "./PlaceDesk";
import { buildPlaces } from "./places";
import { PlaceMarkers } from "@cow/game-engine";
import { PLACE_COLORS, placeIconCanvas } from "@cow/ui";
import { insideShell, onShellMessage, sendToShell } from "./nativeBridge";
import { Population, type DrivenVehicle, type PedestrianHit } from "./Population";
import { Police, type PoliceView } from "./Police";
import { ShareRiders } from "./ShareRiders";
import { FareFigures, type FareFiguresSnapshot } from "./FareFigures";
import { LandmarkView } from "@cow/game-engine";
import { landmarkSolids } from "@cow/game-world";
import { LandmarkLabels } from "@cow/ui";
import { loadRail, loadWorld } from "./WorldFiles";
import { Railway, type RailSnapshot } from "./Railway";
import { CityMapDesk } from "./CityMapDesk";
import { CONTROLS, TitleDesk } from "./TitleDesk";
import type { LoadStep, StreetSketch, TitleModel } from "@cow/ui";
import type { CityMapState } from "@cow/ui";
import { RidePanel } from "@cow/ui";
import { STATION_FONT_HI, loadStationFont } from "@cow/game-engine";
import stationFont from "../../../assets/fonts/noto-sans-tamil-stations.woff2?inline";
import stationFontHindi from "../../../assets/fonts/noto-sans-devanagari-stations.woff2?inline";
import playerModel from "../../../assets/optimized/player.glb?inline";
import locomotion from "../../../assets/optimized/locomotion.glb?inline";
// Everyone else: the people manifest and their models, loaded per person when first needed.
import { peopleSources } from "./peopleFiles";
import { loadSignFont } from "@cow/game-engine";
import signFont from "../../../assets/fonts/noto-sans-tamil-signs.woff2?inline";
import acUnit from "../../../assets/optimized/props/ac_unit.glb?inline";
import barrel from "../../../assets/optimized/props/barrel.glb?inline";
import clayPots from "../../../assets/optimized/props/clay_pots.glb?inline";
import crates from "../../../assets/optimized/props/crates.glb?inline";
import dish from "../../../assets/optimized/props/dish_antenna.glb?inline";
import handcart from "../../../assets/optimized/props/handcart.glb?inline";
import autoRickshaw from "../../../assets/optimized/vehicles/auto_rickshaw_lod1.glb?inline";

/**
 * The named steps of `Game.create`, in order, shown on the loading screen. Each is reported when
 * it starts; the bar fills a segment as each one finishes. No percentage is invented.
 */
export const LOAD_STEPS: readonly LoadStep[] = [
  { id: "world", label: "Reading the map of Chennai" },
  { id: "physics", label: "Starting the physics" },
  { id: "streets", label: "Building the streets around you" },
  { id: "people", label: "Bringing people onto the streets" },
  { id: "traffic", label: "Parking vehicles and starting traffic" },
  { id: "rail", label: "Opening the railway stations" },
];

/** What `Game.create` tells the loading screen as it goes. */
export interface LoadProgress {
  step(id: (typeof LOAD_STEPS)[number]["id"]): void;
  /** The world file has been read: its streets can be drawn behind the loading screen. */
  world?(map: StreetSketch): void;
}

/** What tests and the debug console can read about the running game (places and life included). */
export interface GameSnapshot extends PlaceSnapshot, ArmsSnapshot {
  /** The title menu is showing (`title`), or the game is (`game`, playing or paused). */
  readonly screen: "title" | "game";
  /** What the sound system is playing (engine, traffic voices, ambience, one-shots heard). */
  readonly audio: SoundState;
  /** The fight as the player sees it (combat redesign): mode, lock-on, guard, the player's move. */
  readonly fightView: {
    readonly combatMode: boolean;
    readonly locked: number | null;
    readonly blocking: boolean;
    readonly dodging: boolean;
    readonly lastSwing: string | null;
    readonly playerMove: string | null;
    readonly lastAssault: { readonly id: number; readonly outcome: CivilianOutcome } | null;
    /** Pedestrians who can be hit within 4 m: id and distance (tests). */
    readonly civiliansNear: ReadonlyArray<{ readonly id: number; readonly distance: number }>;
  };
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly cameraYaw: number;
  /** The camera's position and distance from what it follows (jitter checks). */
  readonly camera: { x: number; y: number; z: number; distance: number };
  readonly cameraPitch: number;
  readonly grounded: boolean;
  readonly speed: number;
  readonly fps: number;
  readonly paused: boolean;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly gpu: string;
  readonly mode: "foot" | "car" | "auto" | "bike" | "ambulance" | "bus";
  readonly money: number;
  readonly mission: string | null;
  readonly objective: string | null;
  readonly target: { x: number; z: number } | null;
  /** Game seconds simulated, and frames drawn, since start: slow machines run behind the wall clock. */
  readonly simTime: number;
  readonly frames: number;
  readonly chunksLoaded: number;
  /** Grid keys ("col,row") of the loaded chunks. */
  readonly chunkKeys: string[];
  /** Each vehicle; `door` is how far its driver's door is open (0 shut, 1 open). */
  readonly vehicles: Array<{ id: string; kind: string; x: number; z: number; yaw: number; door: number }>;
  /** Getting in or out of a vehicle (the animated sequence), or null. */
  readonly boarding: BoardingSnapshot | null;
  readonly traffic: Array<{ x: number; z: number; speed: number; kind: string }>;
  readonly pedestrians: number;
  /** AI vehicles the time of day and area call for (`traffic` catches up as they go out of sight). */
  readonly trafficWanted: number;
  /** Signalled junctions, and AI vehicles held at their lights or crossings. */
  readonly signals: number;
  readonly waitingAtSignals: number;
  readonly health: number;
  readonly ammo: number;
  readonly enemies: Array<{ x: number; z: number; health: number; armed: boolean; group: string; calm: boolean; weapon: string }>;
  readonly street: string;
  /** Named area the player is in (nearest OSM place point, estimated), and those visited. */
  readonly district: string;
  readonly visitedDistricts: string[];
  /** City job being worked, its next stop and the reputation. */
  readonly job: string | null;
  readonly jobStop: number;
  readonly reputation: number;
  /** The share auto shift being worked (people waiting and aboard, fares), or null. */
  readonly share: ShareSnapshot | null;
  /** Share auto passengers drawn: figures at the kerb and seated in the auto. */
  readonly shareFigures: { waiting: number; seated: number };
  readonly gear: string;
  readonly siren: boolean;
  /** True while a menu (job board, job result) holds the game. */
  readonly held: boolean;
  /** Time of day, 0 to 24. */
  readonly hour: number;
  /** Weather chosen in the pause menu. */
  readonly weather: Weather;
  /** How much the driven vehicle is sliding, 0 (gripping or on foot) to 1 (a full drift). */
  readonly drift: number;
  /** Landmarks on the map and whether each one's name label is on screen. */
  readonly landmarks: Array<{ id: string; name: string; x: number; z: number; radius: number; label: boolean }>;
  /** The suburban railway: trains near the player, stops, and the ride (null without the rail file). */
  readonly rail: RailSnapshot | null;
  /** The player's top running speed (m/s, raised by fitness) and clothing colour. */
  readonly runSpeed: number;
  readonly clothes: number | null;
  /** People the player's vehicle has hit and their state, and the last hit with what it cost (tests). */
  readonly casualties: Array<{ x: number; z: number; state: CasualtyState; speed: number }>;
  readonly lastPedestrianHit: { outcome: HitOutcome; speed: number; fine: number; reputation: number } | null;
  /** The full-screen city map (opened by tapping the minimap). */
  readonly cityMap: CityMapState;
  /** The wanted level, police cars and officers, the last arrest (`Police.ts`). */
  readonly police: ReturnType<Police["snapshot"]>;
  /** People getting in and out at the current pick-up or drop (`FareFigures.ts`), or null. */
  readonly fare: (FareFiguresSnapshot & { readonly aboard: number; readonly kerb: { x: number; z: number }; readonly stages: string[]; readonly note: string | null }) | null;
}

const SAVE_KEY = "cow-progress-v1";
const MINIMAP_COLORS: Record<Vehicle["kind"], string> = { car: "#e9eef5", auto: "#f5c400", bike: "#5aa9ff", ambulance: "#ff5d5d", bus: "#3fc1b0" };
/** How close the player must be to a vehicle to get in, metres. */
const ENTER_RANGE = 3.6;

function pickQuality(): Quality {
  // The game runs on Android phones only (TD-20): the phone tier by default. `?quality=lite`
  // (the tests) or `high` (a capable phone, for comparison) overrides it.
  const asked = new URLSearchParams(location.search).get("quality");
  if (asked === "lite" || asked === "low" || asked === "high") return asked;
  return "low";
}

function loadProgress(): Progress | undefined {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return undefined;
    const data = JSON.parse(raw) as Partial<Progress>;
    if (Array.isArray(data.completed) && typeof data.money === "number") return { completed: data.completed.map(String), money: data.money };
  } catch {
    // A missing or damaged save simply starts a new game.
  }
  return undefined;
}

const DISTRICTS_KEY = "cow-districts-v1";
function loadDistricts(): VisitedDistricts {
  try {
    return new VisitedDistricts(JSON.parse(localStorage.getItem(DISTRICTS_KEY) ?? "[]"));
  } catch {
    return new VisitedDistricts();
  }
}

const SOUND_KEY = "cow-sound-v1";
function loadSoundOn(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

const HOUR_KEY = "cow-hour-v1";
function loadHour(): number | undefined {
  try {
    const raw = localStorage.getItem(HOUR_KEY);
    return raw === null ? undefined : Number(raw);
  } catch {
    return undefined;
  }
}

type Weather = "clear" | "rain";
const WEATHER_KEY = "cow-weather-v1";
function loadWeather(): Weather {
  try {
    return localStorage.getItem(WEATHER_KEY) === "rain" ? "rain" : "clear";
  } catch {
    return "clear";
  }
}

function saveProgress(progress: Progress): void {
  try {
    // Keep the save's other fields (the life state from places, under `life`).
    let saved: unknown = null;
    try {
      saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null");
    } catch {
      saved = null;
    }
    const rest = saved !== null && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...rest, ...progress }));
  } catch {
    // Storage can be unavailable (private mode); the game still plays, without saving.
  }
}

/**
 * Let the page draw before the next loading step. The steps are long stretches of work with no
 * break; on a slow phone the loading screen's new step label (and anything else that changed)
 * never got drawn, and showed as white boxes. One frame per step costs a few frames in all.
 * Bounded by a timeout so a hidden page (no animation frames) does not wait.
 */
function shown(): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      window.clearTimeout(timer);
      // After the frame is drawn, not before it: a task queued from the frame callback.
      window.setTimeout(resolve, 0);
    };
    // A slow phone can take far longer than 100 ms to draw a frame; a second is still cheap
    // next to the steps themselves, and the screen must show which step is running.
    const timer = window.setTimeout(resolve, 1000);
    requestAnimationFrame(done);
  });
}

export class Game {
  private readonly loop: GameLoop;
  private paused = false;
  /** The vehicle being driven, or null on foot. */
  private driving: Vehicle | null = null;
  private nearby: Vehicle | null = null;
  /** Enemy groups the player has beaten during the current stage. */
  private readonly cleared = new Set<string>();
  /** Seconds the pistol stays raised after a shot. */
  private aimFor = 0;
  private sinceClick = 1;
  private street = "";
  private sinceStreet = 1;
  private sinceHaze = 1;
  /** Seconds simulated and frames drawn since start (tests wait on these, not the wall clock). */
  private simTime = 0;
  private frames = 0;
  /**
   * The player's place (on foot, in a vehicle or on a train) at the last two fixed steps: the
   * figure and the camera are drawn in between, so they move evenly whatever the display rate.
   */
  private readonly playerMotion = new Motion();
  /** Named areas of the city (OSM place points) and the ones the player has been to. */
  private readonly districtIndex: DistrictIndex;
  private readonly visited = loadDistricts();
  private district = "";
  /** A new-area message waiting for the screen to be free of other messages. */
  private areaNews: string | null = null;
  private readonly parkedObstacles: Array<{ x: number; z: number; radius: number }> = [];
  private readonly desk: JobDesk;
  /** A menu is open over the game (job board or a job's result). */
  private held = false;
  /** The P / R / D selector of whatever the player drives (reset to D on getting in). */
  private readonly gearbox = new Gearbox();
  /** Gear shown last frame, to hear a change up. */
  private lastGear = "";
  /** Time of day. Systems that change with it read `clock.hour`. */
  private readonly clock = new GameClock(loadHour());
  /** Clear or light rain, from the pause menu; the renderer draws it. */
  private weather = loadWeather();
  /** Landmark models (always loaded) and their name labels. */
  private readonly landmarks: LandmarkView;
  private readonly landmarkLabels: LandmarkLabels;
  /** Suburban trains and stations (`Railway.ts`); null if the rail file could not be read. */
  railway: Railway | null = null;
  /** The character models (the player's and the people of the manifest), for the people report. */
  humans: HumanAssets | null = null;
  /** Places the player can go into (home, hospital, gym, mall, cinema) and the short stories. */
  private readonly placeDesk: PlaceDesk;
  private readonly placeMarkers: PlaceMarkers;
  /** A place whose entrance ENTER was pressed at; its screen opens on the next frame. */
  private enteringPlace: PlaceDesk["places"][number] | null = null;
  private lastPedestrianHit: GameSnapshot["lastPedestrianHit"] = null;
  /** Getting in and out of vehicles as an animated sequence (`Boarder.ts`). */
  private readonly boarder: Boarder;
  /** The controls are hidden for a walk through a train's doorway. */
  private railWalk = false;
  /** Police and the wanted level (`Police.ts`); made in `create`, once the road graph and HUD exist. */
  private police!: Police;
  /** Weapons in the world, gang crews, the chase courier and the weapon button (set in `create`). */
  private arms!: Arms;
  /** The full-screen city map (`CityMapDesk.ts`), opened by tapping the minimap. */
  private readonly cityMap: CityMapDesk;
  /** Passengers getting in and out at pick-ups and drops (set in `create`). */
  private fareFigures!: FareFigures;
  /** The stage objective seen last step, to notice one starting (`storyPolice`). */
  private lastObjective: Objective | null = null;
  /** The title menu over the live city (`TitleDesk.ts`). */
  private readonly title: TitleDesk;
  /** `start` has run once (the first PLAY from the title menu, or straight away in tests). */
  private started = false;
  /** Accelerator sent to the driven vehicle at the last step, 0..1 (the engine's load). */
  private pedal = 0;
  /** Seconds the player has been off the ground (a landing thud after a jump or drop). */
  private airborne = 0;
  /** Seconds since the traffic and ambience sound was last updated (it runs at 20 Hz). */
  private sinceSound = 0;
  /** The enemy the player's attacks turn to (`chooseLock`), by id. */
  private lock: number | null = null;
  /** A fight is on near the player: JUMP dodges, BLOCK shows (`TouchControls.setCombat`). */
  private combatMode = false;
  /** Seconds since the player last hit anyone or was hit (keeps fight mode on for a moment). */
  private sinceViolence = 99;
  /** Holding BLOCK this step. */
  private blocking = false;
  /** The last pedestrian the player hit, and what it did to them (tests and the debug snapshot). */
  private lastAssault: GameSnapshot["fightView"]["lastAssault"] = null;
  /** Health bars, lock-on brackets and hit markers over the people in a fight. */
  private readonly marks: CombatMarks;
  private sightWorld: ReturnType<typeof combatWorld> | null = null;
  /** Line-of-sight questions about the world, for the lock-on. */
  private sight(): ReturnType<typeof combatWorld> {
    return (this.sightWorld ??= combatWorld(this.physics));
  }

  private constructor(
    private readonly map: WorldMap,
    private readonly content: GameContent,
    private readonly renderer: SceneRenderer,
    private readonly mapView: MapView,
    private readonly chunks: ChunkManager,
    private readonly physics: PhysicsWorld,
    private readonly player: PlayerController,
    private readonly avatar: HumanFigure,
    private readonly vehicles: Vehicle[],
    private readonly population: Population,
    private readonly combat: Combat,
    private readonly fighters: Fighters,
    private readonly sound: Sound,
    private readonly missions: MissionRunner,
    private readonly beacon: Beacon,
    private readonly camera: FollowCamera,
    private readonly controls: TouchControls,
    private readonly hud: Hud,
    private readonly minimap: Minimap,
    private readonly riders: ShareRiders,
  ) {
    this.loop = new GameLoop({ fixedUpdate: (dt) => this.fixedUpdate(dt), frame: (dt, alpha) => this.frame(dt, alpha) });
    this.boarder = new Boarder(avatar, (x, z, vehicle) => {
      // The ground under a point beside the vehicle: a ray down from above its roof.
      const top = vehicle.body.position().y + 2;
      const hit = physics.raycast({ x, y: top, z }, { x: 0, y: -1, z: 0 }, 5, vehicle.body);
      return hit === null ? null : top - hit;
    });
    this.desk = new JobDesk(content.jobs, missions, hud, sound, {
      hold: () => this.hold(),
      release: () => this.release(),
      saveMoney: () => saveProgress(this.missions.progress()),
      hour: () => this.clock.hour,
    });
    this.landmarks = new LandmarkView(map.landmarks ?? []);
    renderer.scene.add(this.landmarks.object);
    this.landmarkLabels = new LandmarkLabels(hud.root, map.landmarks ?? []);
    this.districtIndex = new DistrictIndex(map.districts ?? []);
    const placeContent = buildPlaces(map, content);
    this.placeDesk = new PlaceDesk(placeContent.places, placeContent.stories, missions, hud, sound, {
      hold: () => this.hold(),
      release: () => this.release(),
      health: () => this.combat.health,
      setHealth: (health) => {
        this.combat.health = health;
      },
      hour: () => this.clock.hour,
      passHours: (hours) => {
        this.clock.hour = this.clock.hour + hours;
        this.saveHour();
      },
      saveMoney: () => saveProgress(this.missions.progress()),
      saveAll: () => {
        saveProgress(this.missions.progress());
        this.desk.save();
        this.saveHour();
        this.saveDistricts();
      },
      dress: (tint) => this.avatar.setClothes(tint),
      sprint: (factor) => {
        this.player.runScale = factor;
      },
      jobActive: () => this.desk.active !== null,
    });
    this.placeMarkers = new PlaceMarkers(placeContent.places.map((p) => ({ x: p.x, z: p.z, radius: p.radius, icon: placeIconCanvas(p.kind), color: Number.parseInt(PLACE_COLORS[p.kind].slice(1), 16) })));
    renderer.scene.add(this.placeMarkers.object);
    this.cityMap = this.makeCityMap();
    minimap.onTap(() => this.cityMap.open());
    sound.setMuted(!loadSoundOn());
    this.marks = new CombatMarks(hud.root);
    this.title = this.makeTitle();
  }

  /** Sound on or off, from the title menu or the pause menu, and remembered. */
  private toggleSound(): void {
    this.sound.setMuted(!this.sound.isMuted);
    try {
      localStorage.setItem(SOUND_KEY, this.sound.isMuted ? "off" : "on");
    } catch {
      // Not saved; the setting still applies now.
    }
  }

  /** The title menu and what it reads from, and does to, the game. */
  private makeTitle(): TitleDesk {
    return new TitleDesk(this.hud.root.parentElement ?? document.body, {
      model: () => this.titleModel(),
      centre: () => ({ ...this.where(), yaw: this.driving ? this.driving.body.yaw() : this.player.yaw }),
      draw: (dt, eye, target) => this.drawTitle(dt, eye, target),
      play: () => void this.leaveTitle(false),
      newGame: () => void this.leaveTitle(true),
      nextTime: () => {
        this.clock.next();
        this.saveHour();
        this.renderer.setTimeOfDay(this.clock.hour);
        this.title.refresh();
      },
      toggleWeather: () => {
        this.setWeather(this.weather === "rain" ? "clear" : "rain");
        this.title.refresh();
      },
      toggleSound: () => {
        this.toggleSound();
        this.title.refresh();
      },
      // Only the Android app can close itself; a browser tab has nothing to quit to.
      ...(insideShell() ? { quit: () => sendToShell({ type: "exit" }) } : {}),
    });
  }

  private titleModel(): TitleModel {
    const missions = this.missions;
    const mission = missions.mission;
    const stage = mission ? `Stage ${mission.stage} · ${mission.title}` : "Free roam";
    const at = this.where();
    const road = nearestRoadPoint(this.map, at, false);
    const street = road && road.distance < road.road.width / 2 + 6 && road.road.name ? road.road.name : "";
    const saved = missions.stagesDone > 0 || missions.balance > 0;
    const date = this.map.dataDate ? `, extract of ${this.map.dataDate.slice(0, 10)}` : "";
    return {
      save: saved ? { headline: stage, detail: `₹${missions.balance.toLocaleString("en-IN")} · ${missions.stagesDone} of ${missions.stageCount} stages` } : null,
      firstStage: stage,
      place: { area: this.districtIndex.at(at)?.name ?? this.map.name, street },
      time: `${this.clock.label} · ${this.clock.text()}`,
      weather: this.weather === "rain" ? "Rain" : "Clear",
      sound: this.sound.isMuted ? "Off" : "On",
      controls: CONTROLS,
      about: [
        "An original open-world game set on the real streets of Chennai, from Anna Nagar to the Marina. Early build.",
        `Map data ${this.map.attribution}${date}. Building heights, colours and road widths that the map does not record are estimated.`,
        "Characters, stories, jobs and shop signs are invented; no real business is named. Tamil and Hindi lettering: Noto Sans (SIL Open Font Licence).",
      ],
      credit: `Map data ${this.map.attribution}`,
    };
  }

  /** One frame of the city behind the title menu: the rules stand still, only the camera moves. */
  private drawTitle(dt: number, eye: { x: number; y: number; z: number }, target: { x: number; y: number; z: number }): void {
    // Keep the camera out of buildings: pull it in front of the first solid between it and the player.
    const dx = eye.x - target.x;
    const dy = eye.y - target.y;
    const dz = eye.z - target.z;
    const length = Math.hypot(dx, dy, dz) || 1;
    const hit = this.physics.raycast(target, { x: dx / length, y: dy / length, z: dz / length }, length, this.player.body);
    const reach = hit === null ? length : Math.max(4, hit - 1.2);
    const camera = this.renderer.camera;
    camera.position.set(target.x + (dx / length) * reach, target.y + (dy / length) * reach, target.z + (dz / length) * reach);
    camera.lookAt(target.x, target.y, target.z);
    if (!this.driving) {
      this.avatar.object.position.set(this.player.position.x, this.player.position.y, this.player.position.z);
      this.avatar.object.rotation.y = this.player.yaw;
      this.avatar.update(dt, 0, true);
    }
    for (const vehicle of this.vehicles) vehicle.sync(0, 1);
    // The city's background plays behind the menu (once a first touch has allowed sound).
    this.sinceSound += dt;
    if (this.sinceSound >= 0.05) {
      const at = this.where();
      this.sound.setListener(camera.position.x, camera.position.z, this.camera.yaw);
      this.sound.setAmbience(this.sinceSound, { hour: this.clock.hour, rain: this.weather === "rain" ? 1 : 0, coast: distanceToCoast(this.map.sea, at), traffic: 0.5, enclosed: false });
      this.sinceSound = 0;
    }
    this.mapView.follow(camera);
    this.renderer.focusShadows(target.x, target.z);
    this.renderer.setTimeOfDay(this.clock.hour);
    this.renderer.update(dt, 0, null);
    this.renderer.render();
  }

  /** Show the title menu: at launch (after loading), or from the pause menu. */
  showTitle(): Promise<void> | void {
    const stop = (): void => {
      this.cityMap.close();
      this.hud.hideOverlay();
      this.paused = true;
      this.held = false;
      this.loop.stop();
      this.sound.suspend();
      this.controls.setVisible(false);
      this.hud.root.hidden = true;
      this.renderer.setRain(this.weather === "rain", true);
      sendToShell({ type: "paused", paused: true });
    };
    // At launch the loading screen fades out over it; later, fade through black from the game.
    if (!this.started) {
      stop();
      this.title.open();
      return;
    }
    return this.title.show(stop);
  }

  /** PLAY / CONTINUE (or NEW GAME after the player confirmed) on the title menu. */
  private leaveTitle(fresh: boolean): Promise<void> {
    return this.title.close(async () => {
      if (fresh) await this.resetProgress();
      this.hud.root.hidden = false;
      this.paused = false;
      this.controls.setVisible(true);
      if (!this.started) this.start();
      else {
        this.loop.start();
        sendToShell({ type: "paused", paused: false });
        const mission = this.missions.mission;
        if (fresh && mission) this.hud.showToast(`Stage ${mission.stage}: ${mission.title}`, mission.brief, 5);
      }
      document.documentElement.dataset.ready = "true";
    });
  }

  /** The city map and what it reads from the game when it opens. */
  private makeCityMap(): CityMapDesk {
    return new CityMapDesk(this.hud.root, this.map, {
      hold: () => this.hold(),
      release: () => this.release(),
      canOpen: () => !this.paused && !this.held,
      player: () => ({ ...this.where(), heading: this.driving ? this.driving.body.yaw() : this.player.yaw }),
      target: () => this.currentTarget(this.where()),
      vehicles: () => this.vehicles.filter((v) => v !== this.driving).map((v) => ({ x: v.body.position().x, z: v.body.position().z, kind: v.kind, color: MINIMAP_COLORS[v.kind] })),
      markers: () => [...this.placeDesk.markers(), ...this.desk.markers()],
      route: () => this.desk.route(),
      buildings: () => this.chunks.loaded(),
      district: () => this.district,
      street: () => this.street,
    });
  }

  private saveHour(): void {
    try {
      localStorage.setItem(HOUR_KEY, String(this.clock.hour));
    } catch {
      // Not saved; the game still keeps time.
    }
  }

  /** For tests and debugging only: set the player's health. */
  debugSetHealth(health: number): void {
    this.combat.health = Math.max(1, Math.min(PLAYER_MAX_HEALTH, health));
  }

  /**
   * Tests and debugging only: who plays whom (`people.ts`): the manifest, the people loaded, and
   * each pedestrian, driver and enemy shown, with how high their soles are off the ground.
   */
  debugPeople(): unknown {
    const manifest = this.humans?.manifest ?? null;
    return {
      fixture: manifest?.fixture ?? null,
      manifest: manifest?.people.map((p) => ({ id: p.id, sex: p.sex, age: p.age, roles: p.roles })) ?? [],
      loaded: this.humans?.loadedPeople() ?? [],
      ...this.population.peopleReport(),
      enemies: this.fighters.peopleReport(),
      player: { feet: this.driving ? null : this.avatar.feetHeight(), speed: this.player.speed, grounded: this.player.grounded },
      crowd: this.railway?.crowdPeople ?? 0,
    };
  }

  /** For tests and debugging only: give a weapon and rounds, and take it in hand if it is a gun. */
  debugGiveWeapon(id: WeaponId, ammo: number): void {
    this.combat.arsenal.give(id, ammo);
    this.combat.arsenal.select(id);
  }

  static async create(canvas: HTMLCanvasElement, stage: HTMLElement, progress?: LoadProgress): Promise<Game> {
    progress?.step("world");
    await shown();
    // The Tamil font for shop signs loads while the world does; the game starts without it.
    const signFontLoaded = loadSignFont(signFont);
    // Street props made in Blender (assets/README.md), baked once and merged per chunk.
    const propsLoaded = loadPropAssets({ handcart, crates, barrel, clayPots, acUnit, dish });
    // Vehicles modelled in Blender (tools/blender); ground = ride height plus settled suspension below the chassis centre.
    const vehiclesLoaded = loadVehicleModels({ auto: { url: autoRickshaw, ground: -0.68 } });
    // Station names in Tamil on the platform boards (a separate subset of the font).
    const stationFontLoaded = loadStationFont(stationFont);
    // Hindi on the three-language boards (Tamil, Hindi, English).
    const stationFontHindiLoaded = loadStationFont(stationFontHindi, STATION_FONT_HI);
    const railLoaded = loadRail();
    // The world files are produced from OpenStreetMap by `npm run build:world` (TD-16).
    const world = await loadWorld();
    const map = world.map;
    progress?.world?.(map);
    progress?.step("physics");
    await shown();
    const content = buildContent(map);
    const { spawn } = content;

    const renderer = new SceneRenderer({ canvas, quality: pickQuality() });
    const mapView = new MapView(map, new THREE.Color(HAZE), renderer.sunOffset);
    renderer.scene.add(mapView.object);
    renderer.reflect(mapView.dome);

    const physics = await PhysicsWorld.create();
    const boundary = physics.createStaticGroup();
    for (const box of boundarySolids(map.bounds)) boundary.addBox(box);
    // An invisible wall a few metres out to sea.
    for (const box of coastSolids(map.sea, map.bounds)) boundary.addBox(box);
    // Landmarks are always loaded, so their solids are added once.
    const landmarkData = landmarkSolids(map.landmarks ?? []);
    physics.createStaticGroup().addMesh(landmarkData.vertices, landmarkData.indices);

    // Solids are streamed with the meshes: a chunk is solid exactly while it is visible.
    const solids = new Map<string, StaticGroup>();
    let minimap: Minimap | undefined;
    progress?.step("streets");
    await shown();
    await signFontLoaded;
    const props = await propsLoaded;
    const chunks = new ChunkManager(map, world.chunks, renderer.scene, createChunkAssets(facadeAtlas(), props), {
      loaded: (chunk) => {
        minimap?.addBuildings(chunk.key, chunk.buildings);
        const group = physics.createStaticGroup();
        const data = chunkSolids(chunk);
        group.addMesh(data.vertices, data.indices);
        for (const box of data.boxes) group.addBox(box);
        // Poles and bus-shelter posts (kerbs are not solid, TD-8).
        for (const box of furnitureSolids(chunkFurniture(map, chunk))) group.addBox(box);
        // Handcarts, crates, barrels and pots on the pavement.
        for (const box of propSolids(chunkProps(map, chunk))) group.addBox(box);
        solids.set(chunk.key, group);
      },
      unloaded: (chunk) => {
        minimap?.removeBuildings(chunk.key);
        const group = solids.get(chunk.key);
        if (group) physics.removeStaticGroup(group);
        solids.delete(chunk.key);
      },
    }, renderer.tier.loadDistance, renderer.tier.unloadDistance);
    // Start with the chunks round the spawn in place, so the player stands in a finished street.
    const nearby = chunks.whenLoaded(spawn.x, spawn.z);
    chunks.update(spawn.x, spawn.z, true);
    await nearby;

    const body = physics.createCharacter({ radius: PLAYER_RADIUS, height: PLAYER_HEIGHT, feet: { x: spawn.x, y: 0.1, z: spawn.z } });
    const player = new PlayerController(body, spawn.yaw);
    progress?.step("people");
    await shown();
    const people = peopleSources();
    const humans = await HumanAssets.load({ model: playerModel, animations: locomotion, ...(people ? { people } : {}) });
    // The people the street needs from the first frame; everyone else loads when first wanted.
    await humans.prepare(["pedestrian", "auto-driver", "driver"]);
    const avatar = humans.create();
    // Seen up close: no sole sinks into the road, even while starting or stopping.
    avatar.plantsFeet = true;
    renderer.scene.add(avatar.object);

    progress?.step("traffic");
    await shown();
    await vehiclesLoaded;
    const vehicles = content.parking.map((spot) => new Vehicle(spot.id, spot.kind, physics, spot, spot.yaw, spot.color));
    for (const vehicle of vehicles) renderer.scene.add(vehicle.object);

    // Fewer agents on phones: each pedestrian is a full animated skeleton.
    const mobile = pickQuality() !== "high";
    const population = new Population(map, renderer.scene, physics, humans, spawn, { traffic: mobile ? 9 : 12, pedestrians: mobile ? 7 : 10 });

    const combat = new Combat(combatWorld(physics));
    const fighters = new Fighters(combat, renderer.scene, physics, humans);
    const sound = new Sound();
    // Browsers only allow sound after the player has touched the screen or pressed a key.
    for (const type of ["pointerdown", "keydown"] as const) window.addEventListener(type, () => sound.unlock());

    const missions = new MissionRunner(content.missions, loadProgress());
    const beacon = new Beacon();
    renderer.scene.add(beacon.object);

    const camera = new FollowCamera(renderer.camera, spawn.yaw);
    const controls = new TouchControls(stage);

    let game: Game | undefined;
    const hud = new Hud(
      stage,
      { title: map.name, subtitle: "Chennai" },
      () => game?.setPaused(true),
      () => game?.openBoard(),
    );
    minimap = new Minimap(hud.root, map);
    for (const chunk of chunks.loaded()) minimap.addBuildings(chunk.key, chunk.buildings);
    // Sky, wet roads, lit windows and vehicle lamps follow the time of day and the weather.
    renderer.listen((look) => {
      mapView.applyLook(look);
      chunks.applyLook(look);
      setVehicleNightLights(look.night);
    });
    const riders = new ShareRiders(renderer.scene, humans);
    game = new Game(map, content, renderer, mapView, chunks, physics, player, avatar, vehicles, population, combat, fighters, sound, missions, beacon, camera, controls, hud, minimap, riders);
    game.police = new Police(map, renderer.scene, physics, combat, sound, hud.root, { graph: () => population.roadGraph, traffic: () => population.trafficPositions() }, {
      busted: (fine, stars, station) => game?.arrested(fine, stars, station),
    });
    game.arms = new Arms(content, combat, renderer.scene, humans, hud, controls);
    game.fareFigures = new FareFigures(renderer.scene, humans);
    game.humans = humans;
    progress?.step("rail");
    await shown();
    const railFile = await railLoaded;
    if (railFile) {
      const railway = new Railway(railFile, renderer.scene, physics, new RidePanel(hud.root), {
        player,
        avatar,
        camera,
        money: () => missions.balance,
        pay: (rupees) => {
          missions.charge(rupees);
          saveProgress(missions.progress());
        },
        toast: (title, detail, seconds) => hud.showToast(title, detail, seconds),
        door: () => sound.door(),
        horn: (level) => sound.trainHorn(level),
        announce: () => sound.stationChime(),
      }, { drawDistance: renderer.tier.loadDistance, tamil: await stationFontLoaded, hindi: await stationFontHindiLoaded });
      // Platform crowds: a few of the city's people (adults, elderly, students, children) and the
      // tea-stall seller, each baked into a few cheap instanced poses, near a station only.
      railway.crowdWhenNeeded(async () => {
        await humans.prepare(["platform", "tea-seller"]);
        return CrowdFigures.create(humans, 48, humans.manifest ? platformCast(humans.manifest.people) : undefined);
      });
      minimap.addLines(railway.minimapLines());
      game.cityMap.setRail(railFile);
      game.railway = railway;
    }

    window.addEventListener("resize", () => renderer.resize());
    // Stop simulating while the app is in the background: saves battery and avoids a time jump.
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) game.loop.stop();
      else if (!game.paused && !game.held) game.loop.start();
    });
    // Android Back: closes the city map when it is open, otherwise pauses.
    onShellMessage((message) => (message.type === "back" ? game.back() : game.setPaused(message.type === "pause")));
    return game;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.hud.root.hidden = false;
    this.controls.setVisible(true);
    this.renderer.setRain(this.weather === "rain", true);
    // Drawn from the spawn point until the first fixed steps have run.
    const at = this.where();
    this.playerMotion.snap(at.x, at.y, at.z, this.player.yaw);
    this.loop.start();
    const mission = this.missions.mission;
    if (mission) this.hud.showToast(`Stage ${mission.stage}: ${mission.title}`, mission.brief, 5);
    else this.hud.showToast("Free roam", "Every stage is complete. The city is yours.", 4);
    sendToShell({ type: "ready", gpu: this.renderer.gpu() });
  }

  /** Android Back (sent by the shell only while the city map is open). */
  back(): void {
    if (this.title.isOpen) {
      // Back on the title menu leaves a sub-page, then closes the app (as on any Android home screen).
      if (!this.title.back() && insideShell()) sendToShell({ type: "exit" });
      return;
    }
    if (this.cityMap.isOpen) this.cityMap.close();
    // A second Back while paused goes to the title menu (it used to leave to the shell's menu).
    else if (this.paused) void this.showTitle();
    else this.setPaused(true);
  }

  /** Open the job board (the JOBS button). */
  openBoard(): void {
    if (this.paused) return;
    // No new jobs while wanted at two stars or more (a job in progress can still be quit).
    const refusal = this.police.jobRefusal(this.desk.active !== null);
    if (refusal) this.hud.showToast("Job board closed", refusal, 3);
    else this.desk.openBoard();
  }

  private hold(): void {
    if (this.held) return;
    this.held = true;
    this.loop.stop();
    this.sound.suspend();
    this.controls.setVisible(false);
  }

  private release(): void {
    if (!this.held) return;
    this.held = false;
    this.controls.setVisible(true);
    if (!this.paused) this.loop.start();
  }

  /** A short summary of progress, copied or shared so the player can send it to friends. */
  private share(): void {
    const record = this.desk.runner.record();
    const areas = this.visited.count > 0 ? ` Explored ${this.visited.count} ${this.visited.count === 1 ? "area" : "areas"} of Chennai: ${this.visited.summary()}.` : "";
    const text = `Chennai Open World: ₹${this.missions.balance.toLocaleString("en-IN")} earned, stages ${this.missions.stagesDone}/${this.missions.stageCount}, ${record.done} city jobs done, reputation ${record.reputation}/100.${areas}`;
    const done = () => this.hud.showToast("Progress copied", text, 4);
    const fallback = () => {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.append(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      if (ok) done();
      else this.hud.showToast("Copy this", text, 8);
    };
    const share = (navigator as Navigator & { share?: (data: { text: string }) => Promise<void> }).share;
    if (share) {
      share.call(navigator, { text }).catch(() => undefined);
      return;
    }
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  /** Pause menu: jump to the next named time of day, and remember it. */
  private nextTimeOfDay(): void {
    this.clock.next();
    try {
      localStorage.setItem(HOUR_KEY, String(this.clock.hour));
    } catch {
      // Not saved; the game still changes time.
    }
    // Show the new light behind the pause screen, which is not animating.
    this.renderer.setTimeOfDay(this.clock.hour);
    this.renderer.render();
    // Rebuild the pause screen so the button shows the new time.
    this.paused = false;
    this.setPaused(true);
  }

  /** Pause menu: switch between clear weather and light rain, and remember it. */
  private toggleWeather(): void {
    this.setWeather(this.weather === "rain" ? "clear" : "rain");
    this.renderer.render();
    this.paused = false;
    this.setPaused(true);
  }

  /** Clear or rain, remembered, and drawn at once. */
  private setWeather(weather: Weather): void {
    this.weather = weather;
    try {
      localStorage.setItem(WEATHER_KEY, this.weather);
    } catch {
      // Not saved; the weather still changes.
    }
    this.renderer.setRain(this.weather === "rain", true);
  }

  setPaused(paused: boolean): void {
    // The title menu keeps the game paused: only its PLAY / CONTINUE resumes it.
    if (this.title.isOpen) return;
    if (paused === this.paused) return;
    this.paused = paused;
    if (paused) this.arms.save();
    // Pausing (the app went to the background) closes the city map; the pause screen shows instead.
    if (paused) this.cityMap.close();
    this.held = false;
    this.controls.setVisible(!paused);
    if (paused) {
      this.loop.stop();
      this.sound.suspend();
      const help = "On foot: left side moves, right side looks. JUMP, HIT to punch, FIRE to shoot where you look, ENTER to get in a vehicle. Driving: left stick steers, GAS and BRAKE on the right (hold BRAKE to reverse); SIREN in the ambulance. JOBS opens the job board.";
      this.hud.showOverlay("Paused", `${help} Map data ${this.map.attribution}.`, { label: "Resume", run: () => this.setPaused(false) });
      this.hud.addOverlayAction({ label: "Share progress", quiet: true, run: () => this.share() });
      this.hud.addOverlayAction({ label: `Time: ${this.clock.label} (${this.clock.text()})`, quiet: true, run: () => this.nextTimeOfDay() });
      this.hud.addOverlayAction({ label: `Weather: ${this.weather === "rain" ? "Rain" : "Clear"}`, quiet: true, run: () => this.toggleWeather() });
      this.hud.addOverlayAction({
        label: `Sound: ${this.sound.isMuted ? "Off" : "On"}`,
        quiet: true,
        run: () => {
          this.toggleSound();
          // Rebuild the pause screen so the button shows the new setting.
          this.paused = false;
          this.setPaused(true);
        },
      });
      this.hud.addOverlayAction({ label: "New game", quiet: true, run: () => this.newGame() });
      this.hud.addOverlayAction({ label: "Main menu", quiet: true, run: () => void this.showTitle() });
    } else {
      this.hud.hideOverlay();
      this.loop.start();
    }
    sendToShell({ type: "paused", paused });
  }

  /**
   * The street's sound round the player, 20 times a second: the nearest traffic's engines and
   * horns, and the city's background (time of day, rain, the sea, how busy the road is).
   */
  private soundFrame(dt: number, at: { x: number; z: number }): void {
    this.sinceSound += dt;
    if (this.sinceSound < 0.05) return;
    const step = this.sinceSound;
    this.sinceSound = 0;
    const eye = this.renderer.camera.position;
    this.sound.setListener(eye.x, eye.z, this.camera.yaw);
    const traffic = this.population.trafficPositions();
    this.sound.setTraffic(traffic, step, this.clock.hour);
    const busy = traffic.filter((t) => Math.hypot(t.x - at.x, t.z - at.z) < 120).length;
    // Windows up in a car, bus or ambulance, or inside a train: the street is muffled.
    const enclosed = Boolean(this.railway?.riding) || (this.driving !== null && this.driving.kind !== "auto" && this.driving.kind !== "bike");
    this.sound.setAmbience(step, {
      hour: this.clock.hour,
      rain: this.renderer.raining ? 1 : 0,
      coast: distanceToCoast(this.map.sea, at),
      traffic: Math.min(1, busy / 6),
      enclosed,
    });
  }

  /** Forget progress and put everything back where it started. */
  private newGame(): void {
    void this.resetProgress();
    this.setPaused(false);
    const mission = this.missions.mission;
    if (mission) this.hud.showToast(`Stage ${mission.stage}: ${mission.title}`, mission.brief, 5);
  }

  /** Forget progress and put the player and vehicles back; resolves once the start is loaded. */
  private resetProgress(): Promise<void> {
    this.missions.reset();
    saveProgress(this.missions.progress());
    this.desk.reset();
    this.placeDesk.reset();
    this.visited.clear();
    this.saveDistricts();
    this.district = "";
    this.areaNews = null;
    this.cleared.clear();
    this.combat.keepOnly([]);
    this.combat.revive();
    this.arms.reset();
    this.police.clear();
    if (this.driving) this.leaveVehicle(true);
    this.content.parking.forEach((spot, i) => this.vehicles[i]?.body.teleport({ x: spot.x, y: (this.vehicles[i]?.type.rideHeight ?? 0.7) + 0.1, z: spot.z }, spot.yaw));
    return this.teleport(this.content.spawn.x, this.content.spawn.z, this.content.spawn.yaw);
  }

  /** Where the player is: their vehicle when driving, otherwise their feet. */
  private where(): { x: number; y: number; z: number } {
    const riding = this.railway?.ridePosition();
    if (riding) return riding;
    const boarding = this.boarder.position();
    if (boarding) return boarding;
    if (!this.driving) return this.player.position;
    const p = this.driving.body.position();
    return { x: p.x, y: p.y - this.driving.type.rideHeight, z: p.z };
  }

  /**
   * Move the player (and the vehicle they are in) somewhere else at once. Resolves when the
   * chunks around the new place are loaded (tests wait for it).
   */
  teleport(x: number, z: number, yaw = 0): Promise<void> {
    this.railway?.endRide(null);
    this.cancelBoarding();
    const ready = this.chunks.whenLoaded(x, z);
    this.chunks.update(x, z, true);
    if (this.driving) this.driving.body.teleport({ x, y: this.driving.type.rideHeight + 0.1, z }, yaw);
    else this.player.respawn({ x, y: 0.1, z }, yaw);
    this.camera.yaw = yaw;
    this.playerMotion.snap(x, 0, z, yaw);
    // Name the street at the new place as soon as it is loaded, not at the next half-second
    // lookup: a frame may not run before the caller looks.
    return ready.then(() => {
      const road = nearestRoadPoint(this.map, { x, z }, false);
      this.street = road && road.distance < road.road.width / 2 + 6 && road.road.name ? road.road.name : "";
      this.hud.setStreet(this.street);
    });
  }

  /** Distance to the first solid from a point 1 m above the ground, for tests and debugging. */
  probe(x: number, z: number, dx: number, dz: number, max: number): number | null {
    const length = Math.hypot(dx, dz) || 1;
    return this.physics.raycast({ x, y: 1, z }, { x: dx / length, y: 0, z: dz / length }, max, this.driving ? this.driving.body : this.player.body);
  }

  /** Start getting in: the figure walks to the door, opens it, sits down and shuts it (`Boarder`). */
  private getIn(vehicle: Vehicle): void {
    this.avatar.setAiming(false);
    this.player.body.setEnabled(false);
    this.controls.setMode("busy");
    // Pull the camera back far enough to see the whole vehicle and the door (the bus is 10 m long).
    this.camera.reach = Math.max(5.6, vehicle.type.cameraDistance * 0.8);
    this.controls.setAction(null);
    this.boarder.startIn(vehicle, this.player.position, this.player.yaw);
  }

  /** Start getting out; refused while moving. With the door's side blocked, out the other way at once. */
  private getOut(): void {
    const vehicle = this.driving;
    if (!vehicle) return;
    if (Math.abs(vehicle.body.forwardSpeed()) > 2.5) {
      this.hud.showToast("Stop the vehicle first", "", 1.6);
      return;
    }
    const { entry, physics } = vehicle.type;
    const p = vehicle.body.position();
    const yaw = vehicle.body.yaw();
    const side = yaw - entry.side * (Math.PI / 2);
    // From the middle of the body level with the door (local z), out past the entry point.
    const origin = { x: p.x + Math.sin(yaw) * entry.point.z, y: 0.9, z: p.z + Math.cos(yaw) * entry.point.z };
    if (this.physics.raycast(origin, { x: -Math.sin(side), y: 0, z: -Math.cos(side) }, physics.halfExtents.x + 1.4, vehicle.body) !== null) {
      this.leaveVehicle();
      return;
    }
    vehicle.setSiren(false);
    this.sound.setSiren(false);
    this.controls.setMode("busy");
    this.controls.setAction(null);
    this.avatar.visible = true;
    this.boarder.startOut(vehicle);
  }

  /** One step of getting in or out: the door's sounds, and the switch once seated or back on foot. */
  private boardingStep(dt: number): void {
    const vehicle = this.boarder.active;
    const direction = this.boarder.direction;
    for (const event of this.boarder.fixedUpdate(dt)) {
      if (event === "shut") this.sound.door(vehicle ? soundKind(vehicle.kind) : "car");
      else if (event === "done" && direction === "in" && vehicle) this.enterVehicle(vehicle);
      else if (event === "free" && vehicle) {
        const place = this.boarder.exitPlace();
        this.standUp();
        if (place) this.player.respawn({ x: place.x, y: place.y + 0.05, z: place.z }, place.yaw);
      }
    }
  }

  /** Stop a sequence at once (teleport, new game, knocked out): getting in, back on foot; getting out, back in the seat. */
  private cancelBoarding(): void {
    const vehicle = this.boarder.active;
    if (!vehicle) return;
    const busy = this.boarder.busy;
    const direction = this.boarder.direction;
    this.boarder.cancel();
    if (!busy) return;
    if (direction === "in") this.standUp();
    else this.enterVehicle(vehicle);
  }

  /** On foot again: the physics body back, the figure standing, the foot controls. */
  private standUp(): void {
    this.driving = null;
    this.player.body.setEnabled(true);
    this.avatar.visible = true;
    this.avatar.setSeated(null);
    this.avatar.object.quaternion.identity();
    this.camera.reach = 5.6;
    this.controls.setMode("foot");
  }

  /** Seated and in control (the end of getting in, or at once). */
  private enterVehicle(vehicle: Vehicle): void {
    this.driving = vehicle;
    this.avatar.setAiming(false);
    this.player.body.setEnabled(false);
    // Open vehicles show the rider sitting; closed ones hide the driver.
    this.avatar.visible = vehicle.type.openSeat === true;
    this.avatar.setSeated(vehicle.type.pose);
    this.camera.reach = vehicle.type.cameraDistance;
    this.gearbox.reset("D");
    this.controls.setMode("drive");
    this.controls.setHornLabel(vehicle.type.siren ? "SIREN" : "HORN");
  }

  /**
   * Get out at once, beside the vehicle on whichever side has room: forced (knocked out, new
   * game), or when the door's side is blocked. Any sequence running stops.
   */
  private leaveVehicle(force = false): void {
    const vehicle = this.driving;
    if (!vehicle) return;
    if (force) this.boarder.cancel();
    if (!force && Math.abs(vehicle.body.forwardSpeed()) > 2.5) {
      this.hud.showToast("Stop the vehicle first", "", 1.6);
      return;
    }
    const p = vehicle.body.position();
    const yaw = vehicle.body.yaw();
    const reach = vehicle.type.physics.halfExtents.x + 0.9;
    const origin = { x: p.x, y: 0.9, z: p.z };
    // Left, right, then behind: the first direction with nothing in the way.
    const sides = [yaw + Math.PI / 2, yaw - Math.PI / 2, yaw + Math.PI];
    let exit = sides[0]!;
    for (const angle of sides) {
      const dir = { x: -Math.sin(angle), y: 0, z: -Math.cos(angle) };
      if (this.physics.raycast(origin, dir, reach + 0.5, vehicle.body) === null) {
        exit = angle;
        break;
      }
    }
    const out = exit === sides[2] ? vehicle.type.physics.halfExtents.z + 0.9 : reach;
    vehicle.setSiren(false);
    this.sound.setSiren(false);
    this.sound.door(soundKind(vehicle.kind));
    this.standUp();
    this.player.respawn({ x: p.x - Math.sin(exit) * out, y: 0.1, z: p.z - Math.cos(exit) * out }, yaw);
  }

  /** The marker for the current objective: a place, or the nearest vehicle of the wanted kind. */
  private target(objective: Objective | null, at: { x: number; z: number }): { x: number; z: number; radius: number } | null {
    if (!objective) return null;
    if (objective.type === "reach" || objective.type === "defeat") return { x: objective.x, z: objective.z, radius: objective.radius };
    // Losing the police has no marker: the stars on the HUD show how it is going.
    if (objective.type === "evade") return null;
    if (objective.type === "chase") {
      const quarry = this.missions.quarry;
      return quarry ? { x: quarry.x, z: quarry.z, radius: objective.radius } : null;
    }
    let best: { x: number; z: number; radius: number } | null = null;
    let bestDistance = Infinity;
    for (const vehicle of this.vehicles) {
      if (vehicle.kind !== objective.vehicle) continue;
      const p = vehicle.body.position();
      const d = Math.hypot(p.x - at.x, p.z - at.z);
      if (d < bestDistance) {
        bestDistance = d;
        best = { x: p.x, z: p.z, radius: 2.6 };
      }
    }
    return best;
  }

  /** The marker: the job's next stop or vehicle while on a job, otherwise the stage objective. */
  private currentTarget(at: { x: number; z: number }): { x: number; z: number; radius: number } | null {
    const job = this.desk.active;
    if (!job) return this.target(this.placeDesk.objective() ?? this.missions.objective, at);
    if (this.driving?.kind !== job.vehicle) return this.target({ type: "enter", label: "", vehicle: job.vehicle }, at);
    return this.desk.stopTarget();
  }

  private announce(events: MissionEvent[]): void {
    for (const event of events) {
      if (event.type === "objective") this.sound.chime();
      if (event.type === "completed") {
        this.sound.fanfare();
        this.cleared.clear();
        // Weapons the stage hands over are given (and saved) by `Arms`, and named in the message.
        const weapons = this.arms.reward(event.mission);
        const reputation = this.stageReputation(event.mission.reputation ?? 0);
        this.hud.showToast(`Stage ${event.mission.stage} complete`, `${event.mission.title} · +₹${event.mission.reward}${reputation}${weapons}`, 4);
        saveProgress(this.missions.progress());
        this.arms.save();
        const next = this.missions.mission;
        if (next) window.setTimeout(() => this.hud.showToast(`Stage ${next.stage}: ${next.title}`, next.brief, 5), 4200);
      } else if (event.type === "failed") {
        this.sound.fail();
        this.cleared.clear();
        this.combat.keepOnly([]);
        this.hud.showToast(`${event.reason}`, `${event.mission.title} starts again`, 3.5);
      } else if (event.type === "allDone") {
        window.setTimeout(() => this.hud.showToast("All stages complete", "Free roam: the city is yours.", 6), 4200);
      }
    }
  }

  snapshot(): GameSnapshot {
    const p = this.where();
    const stats = this.renderer.stats();
    const objective = this.missions.objective;
    const target = this.currentTarget(p);
    return {
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: this.driving ? this.driving.body.yaw() : this.player.yaw,
      cameraYaw: this.camera.yaw,
      camera: this.camera.pose(),
      cameraPitch: this.camera.pitch,
      grounded: this.driving ? true : this.player.grounded,
      speed: this.driving ? Math.abs(this.driving.body.forwardSpeed()) : this.player.speed,
      fps: this.loop.fps,
      audio: this.sound.state(),
      fightView: {
        combatMode: this.combatMode,
        locked: this.lock,
        blocking: this.blocking,
        dodging: this.combat.dodgingNow,
        lastSwing: this.combat.lastSwing,
        playerMove: this.avatar.playing,
        lastAssault: this.lastAssault,
        civiliansNear: this.population.civilians(p, 4).map((c) => ({ id: c.id, distance: Math.round(Math.hypot(c.x - p.x, c.z - p.z) * 100) / 100 })),
      },
      paused: this.paused,
      screen: this.title.isOpen ? "title" : "game",
      drawCalls: stats.calls,
      triangles: stats.triangles,
      gpu: this.renderer.gpu(),
      mode: this.driving ? this.driving.kind : "foot",
      money: this.missions.balance,
      mission: this.missions.mission?.id ?? null,
      objective: objective?.label ?? null,
      target: target ? { x: target.x, z: target.z } : null,
      simTime: this.simTime,
      frames: this.frames,
      chunksLoaded: this.chunks.loadedCount,
      chunkKeys: this.chunks.loadedKeys(),
      vehicles: this.vehicles.map((v) => ({ id: v.id, kind: v.kind, x: v.body.position().x, z: v.body.position().z, yaw: v.body.yaw(), door: v.door })),
      boarding: this.boarder.snapshot(),
      traffic: this.population.trafficPositions(),
      pedestrians: this.population.pedestrianCount,
      trafficWanted: this.population.trafficWanted,
      signals: this.population.signalCount,
      waitingAtSignals: this.population.waitingAtSignals,
      health: this.combat.health,
      ammo: this.combat.ammo,
      // Story and gang enemies only; police officers are under `police`.
      enemies: this.combat.enemies.filter((e) => !isPoliceGroup(e.group)).map((e) => ({ x: e.x, z: e.z, health: e.health, armed: e.armed, group: e.group, calm: e.calm, weapon: e.weapon })),
      street: this.street,
      district: this.district,
      visitedDistricts: [...this.visited.list()],
      job: this.desk.active?.id ?? null,
      jobStop: this.desk.runner.stopNumber,
      reputation: this.desk.runner.reputation,
      share: this.desk.shareSnapshot(),
      shareFigures: this.riders.drawn,
      gear: this.driving ? this.gearbox.label(this.driving.type, this.driving.body.forwardSpeed()) : "",
      siren: this.driving?.siren ?? false,
      held: this.held,
      hour: this.clock.hour,
      weather: this.weather,
      drift: this.driving?.body.drifting() ?? 0,
      landmarks: (this.map.landmarks ?? []).map((l) => ({ id: l.id, name: l.name, x: l.x, z: l.z, radius: l.radius ?? 0, label: this.landmarkLabels.isShown(l.id) })),
      rail: this.railway?.snapshot(p) ?? null,
      ...this.placeDesk.snapshot(),
      runSpeed: this.player.runSpeed,
      clothes: this.avatar.clothesColor,
      casualties: this.population.casualtyList(),
      lastPedestrianHit: this.lastPedestrianHit,
      police: this.police.snapshot(),
      fare: this.fareSnapshot(),
      ...this.arms.snapshot(this.avatar, this.fighters.heldWeapons(), this.missions.quarry),
      cityMap: this.cityMap.state(),
    };
  }

  /** Tests and debugging only: hold a pedestrian standing at a point until a vehicle hits them. */
  stagePedestrian(x: number, z: number, heading: number): boolean {
    return this.population.stagePedestrian(x, z, heading);
  }

  /** The driven vehicle as the pedestrian-hit rules see it. */
  private drivenMotion(vehicle: Vehicle): DrivenVehicle {
    const { body } = vehicle;
    const p = body.position();
    // The speed it came in at, even if a person's collision box already stopped it.
    const v = vehicle.approachVelocity();
    const spec = vehicle.type.physics;
    return { x: p.x, z: p.z, yaw: body.yaw(), vx: v.x, vz: v.z, halfWidth: spec.halfExtents.x, halfLength: spec.halfExtents.z, mass: spec.mass, body };
  }

  /** The player's vehicle hit a pedestrian: it slows a little, a thud, and a fine and lost reputation. */
  private pedestrianHit(hit: PedestrianHit): void {
    this.police.pedestrianHit(hit.outcome);
    this.driving?.knock(hit.keep);
    this.sound.crash(Math.min(8, 1 + hit.speed * 0.4));
    if (hit.outcome === "stumble") {
      this.lastPedestrianHit = { outcome: hit.outcome, speed: hit.speed, fine: 0, reputation: 0 };
      this.hud.showToast("You bumped a pedestrian", "They step out of the way.", 2.5);
      return;
    }
    const penalty = hitPenalty(hit.outcome);
    const fine = this.missions.charge(penalty.fine);
    const lost = this.desk.runner.loseReputation(penalty.reputation);
    saveProgress(this.missions.progress());
    this.desk.save();
    this.lastPedestrianHit = { outcome: hit.outcome, speed: hit.speed, fine, reputation: lost };
    this.hud.showToast(`You hit a pedestrian: ${hit.outcome}`, `${fine > 0 ? `Fine ₹${fine.toLocaleString("en-IN")}` : "No money for the fine"} · reputation -${lost}`, 4);
  }

  /** Note the named area the player is in; a first visit gets a toast and is saved. */
  private trackDistrict(at: { x: number; z: number }): void {
    const district = this.districtIndex.at(at);
    if (!district || district.name === this.district) return;
    this.district = district.name;
    if (this.visited.visit(district.name)) {
      this.saveDistricts();
      // The first area is where the game starts: no need to announce it.
      if (this.visited.count > 1) this.areaNews = district.name;
    }
  }

  /** Show a waiting new-area message once no stage or job message is on screen. */
  private announceArea(): void {
    if (!this.areaNews || this.hud.toastShowing) return;
    this.hud.showToast(`New area: ${this.areaNews}`, `${this.visited.count} areas of Chennai explored`, 3);
    this.areaNews = null;
  }

  private saveDistricts(): void {
    try {
      localStorage.setItem(DISTRICTS_KEY, JSON.stringify(this.visited.list()));
    } catch {
      // Not saved; the game goes on.
    }
  }

  /** One step of combat: place the enemies an objective calls for, the player's attacks, the enemies' turn. */
  private fight(dt: number, at: { x: number; z: number }): void {
    // Enemies exist only while their objective is the current one.
    const objective = this.missions.objective;
    // No fights while on a city job or a story. A reach objective can bring an ambush with it.
    const free = !this.desk.active && !this.placeDesk.story;
    const group = !free ? null : objective?.type === "defeat" ? objective.group : objective?.type === "reach" ? (objective.hostiles ?? null) : null;
    // Gang crews on their corners near the player, kept clear of the stage's own fight.
    const marker = free && (objective?.type === "reach" || objective?.type === "defeat") ? objective : null;
    const crews = this.arms.fixedUpdate(dt, at, !this.driving, marker);
    // Police officers on foot (`Police.ts`) are enemies too, and stay.
    this.combat.keepOnly([...(group ? [group] : []), ...crews, ...this.police.groups()]);
    if (group && !this.cleared.has(group) && this.combat.remaining(group) === 0) {
      const spots = this.content.enemies[group] ?? [];
      this.combat.spawnGroup(group, spots);
      // Enough rounds for the armed ones, with some to spare.
      const armed = spots.filter((spot) => spot.armed).length;
      if (armed > 0) this.combat.ammo = Math.max(this.combat.ammo, armed * 8 + 8);
    }

    const events: CombatEvent[] = [];
    // Holding BLOCK: forearms up, no attacking, melee hits cut to a fifth.
    this.blocking = this.combatMode && !this.driving && this.controls.state.block && !this.boarder.busy;
    const state: PlayerState = {
      x: at.x,
      z: at.z,
      heading: this.player.yaw,
      inVehicle: this.driving !== null,
      speed: this.driving ? Math.abs(this.driving.body.forwardSpeed()) : this.player.speed,
      armed: !this.driving && this.arms.armed(),
      blocking: this.blocking,
    };
    // Lock-on: the hostile enemy the player's attacks turn to (near, in front of the camera, in sight).
    const hostiles = this.driving ? [] : this.combat.enemies.filter((e) => e.health > 0 && e.alerted && !e.calm);
    this.lock = chooseLock({ x: at.x, z: at.z, heading: this.camera.yaw }, hostiles, this.lock, (e) => this.sight().lineOfSight(at.x, at.z, e.x, e.z));
    const target = this.lock === null ? null : hostiles.find((e) => e.id === this.lock) ?? null;
    // Fight mode: a hostile close by, or a fight just now (hitting a passer-by counts).
    this.sinceViolence += dt;
    const near = hostiles.some((e) => Math.hypot(e.x - at.x, e.z - at.z) < 15);
    this.combatMode = !this.driving && (near || this.sinceViolence < 4);
    this.controls.setCombat(this.combatMode);
    // People on the pavement can be hit too (the user's decision, 22 Nov 2026).
    const civilians = this.driving ? [] : this.population.civilians(at, 25);
    if (this.controls.consumeWeaponSwitch() && !this.driving) this.arms.switchWeapon();
    const punch = this.controls.consumePunch();
    const fire = this.controls.state.fire;
    this.aimFor = Math.max(0, this.aimFor - dt);
    this.sinceClick += dt;

    if (!this.driving && !this.boarder.busy && !this.blocking && (punch || fire)) {
      // Attacks go to the locked-on enemy when there is one, otherwise where the camera looks;
      // the player turns to face that way first.
      const yaw = target ? Math.atan2(-(target.x - at.x), -(target.z - at.z)) : this.camera.yaw;
      this.player.yaw = yaw;
      const facing = { ...state, heading: yaw };
      if (punch) {
        const before = events.length;
        const hit = this.combat.punch(facing, events, civilians);
        if (hit !== undefined) {
          this.arms.swung();
          this.avatar.play(this.combat.lastSwing ?? "jab");
          // A landed blow sounds from its hit event below; a swing at nothing whooshes.
          if (!hit && !events.slice(before).some((e) => e.type === "civilianHit")) this.sound.whiff();
        }
      }
      if (fire) {
        const shot = this.combat.shoot(facing, events, civilians);
        if (shot.fired) {
          this.aimFor = 0.7;
          this.sound.shot();
          this.avatar.play("recoil");
          this.fighters.muzzleFlash(at.x - Math.sin(yaw) * 0.45, at.z - Math.cos(yaw) * 0.45, yaw);
          this.population.scareAt(at.x, at.z);
          const muzzle = { x: at.x - Math.sin(yaw) * 0.7, z: at.z - Math.cos(yaw) * 0.7 };
          // One tracer per pellet: the shotgun's spread is visible.
          for (const pellet of shot.pellets) this.fighters.tracer(muzzle.x, muzzle.z, pellet.toX, pellet.toZ);
          this.police.gunfire(at.x, at.z, shot.toX, shot.toZ);
        } else if (this.combat.arsenal.ammoOf(this.combat.arsenal.gun.id) === 0 && this.sinceClick > 0.4) {
          this.sinceClick = 0;
          this.sound.click();
        }
      }
    }

    // Enemies hold still while the streets round the player are still loading: right after a
    // long move (a teleport, a respawn) a fight can start before its buildings have walls, and an
    // enemy charging through a building not yet solid ended up sealed inside it once it loaded
    // (seen in CI on stage 15, on a slow runner).
    if (this.chunks.isLoaded(state.x, state.z)) events.push(...this.combat.update(dt, state));
    for (const event of events) {
      if (event.type === "enemyShot") {
        this.sound.shot(true);
        this.fighters.tracer(event.fromX, event.fromZ, event.toX, event.toZ);
        const yaw = Math.atan2(-(event.toX - event.fromX), -(event.toZ - event.fromZ));
        this.fighters.muzzleFlash(event.fromX - Math.sin(yaw) * 0.45, event.fromZ - Math.cos(yaw) * 0.45, yaw);
      } else if (event.type === "enemyPunch") {
        this.fighters.enemyPunch(event.enemy);
        this.sinceViolence = 0;
        // Blocked or dodged blows have their own sound (below); a clean one lands with a thud.
        if (!this.blocking && !this.combat.dodgingNow) this.sound.impact(event.enemy.weapon === "bat" ? "bat" : "light");
      } else if (event.type === "enemyWindup") {
        this.fighters.enemyWindup(event.enemy);
        this.sound.windup();
      } else if (event.type === "enemyHit") {
        this.sinceViolence = 0;
        this.fighters.enemyHit(event.enemy, event.heavy);
        if (event.weapon === "fists" || event.weapon === "bat") this.sound.impact(event.weapon === "bat" ? "bat" : event.heavy ? "heavy" : "light");
        if (event.heavy || event.enemy.health <= 0) this.sound.grunt(true);
      } else if (event.type === "civilianHit") {
        this.sinceViolence = 0;
        const outcome = this.population.assault(event.id, event.damage, event.weapon, { x: event.fromX, z: event.fromZ });
        if (outcome) {
          this.lastAssault = { id: event.id, outcome };
          if (event.weapon === "fists" || event.weapon === "bat") this.sound.impact(event.weapon === "bat" ? "bat" : event.heavy ? "heavy" : "light");
          this.sound.grunt();
          // Hurting people in the street is a crime: the police hear about it.
          this.police.report(outcome === "killed" ? "pedestrianKilled" : outcome === "injured" ? "pedestrianInjured" : "pedestrianAssaulted");
        }
      } else if (event.type === "blocked") {
        this.sound.block();
      } else if (event.type === "dodged") {
        // The dash already made its sound.
      } else if (event.type === "playerHurt") {
        this.hud.flashHurt();
        this.sound.hurt();
      } else if (event.type === "groupCleared") {
        this.cleared.add(event.group);
      } else if (event.type === "playerDied") {
        this.knockedOut();
      }
    }
    this.arms.handle(events);
  }

  /** The player ran out of health: a hospital bill, and the stage starts again. */
  private knockedOut(): void {
    const bill = this.missions.charge(100);
    this.missions.restartStage();
    saveProgress(this.missions.progress());
    this.cleared.clear();
    this.combat.keepOnly([]);
    this.combat.revive();
    // Wasted clears the wanted level too.
    this.police.clear();
    if (this.driving) this.leaveVehicle(true);
    this.teleport(this.content.spawn.x, this.content.spawn.z, this.content.spawn.yaw);
    this.sound.fail();
    this.hud.showToast("Knocked out", bill > 0 ? `Hospital bill ₹${bill}. The stage starts again.` : "The stage starts again.", 4.5);
  }

  /**
   * Busted (`Police.ts` decided it): a fine, the pistol rounds taken, and the player let go
   * outside the nearest police station. Like a knock-out, the stage objective starts again.
   */
  private arrested(fine: number, stars: number, station: { x: number; z: number; yaw: number }): void {
    const paid = this.missions.charge(fine);
    // Every weapon is confiscated (`Arms.confiscate`); the pickups in the world stay.
    this.arms.confiscate();
    this.missions.restartStage();
    saveProgress(this.missions.progress());
    this.cleared.clear();
    this.combat.keepOnly([]);
    this.combat.revive();
    if (this.driving) this.leaveVehicle(true);
    this.teleport(station.x, station.z, station.yaw);
    this.sound.fail();
    this.hud.showToast("Busted", `${"★".repeat(stars)} · ${paid > 0 ? `Fine ₹${paid.toLocaleString("en-IN")}` : "No money for the fine"} · weapons taken. Released at the police station.`, 5);
  }

  /** The player as the police see them (`Police.ts`). */
  private policeView(at: { x: number; z: number }, impact: number): PoliceView {
    const v = this.driving ? this.driving.body.planarVelocity() : { x: -Math.sin(this.player.yaw) * this.player.speed, z: -Math.cos(this.player.yaw) * this.player.speed };
    const objective = this.placeDesk.objective() ?? this.missions.objective;
    const allowedKinds: string[] = [];
    if (this.desk.active) allowedKinds.push(this.desk.active.vehicle);
    if (objective?.type === "enter") allowedKinds.push(objective.vehicle);
    const driving = this.driving;
    return {
      x: at.x,
      z: at.z,
      speed: driving ? Math.abs(driving.body.forwardSpeed()) : this.player.speed,
      vx: v.x,
      vz: v.z,
      vehicle: driving ? { id: driving.id, kind: driving.kind, halfLength: driving.type.physics.halfExtents.z } : null,
      impact,
      allowedKinds,
      body: driving ? driving.body : this.player.body,
    };
  }

  /** The pick-up or drop under way: the city job's when on one, else the stage's (none during a story). */
  private fareScene(): { stop: NonNullable<MissionRunner["fare"]>; aboard: number; kind: Vehicle["kind"]; marker: { x: number; z: number } } | null {
    const job = this.desk.active;
    if (job) {
      const stop = this.desk.runner.fare;
      const at = this.desk.runner.stop;
      return stop && at ? { stop, aboard: this.desk.runner.aboard, kind: job.vehicle, marker: at } : null;
    }
    const objective = this.missions.objective;
    const stop = this.missions.fare;
    if (this.placeDesk.story || !stop || objective?.type !== "reach") return null;
    return { stop, aboard: this.missions.aboard, kind: stop.vehicle, marker: objective };
  }

  /** Each drawn frame: the fare's people, given the vehicle when the player drives the fare's kind. */
  private fareFrame(dt: number, at: { x: number; z: number }): void {
    const scene = this.fareScene();
    const vehicle = this.driving && scene && this.driving.kind === scene.kind ? this.driving : null;
    this.fareFigures.frame(dt, scene, at, vehicle);
  }

  private fareSnapshot(): GameSnapshot["fare"] {
    const scene = this.fareScene();
    if (!scene) return null;
    return { ...this.fareFigures.snapshot(), aboard: scene.aboard, kerb: scene.stop.fare.kerb, stages: scene.stop.people().map((p) => p.stage), note: scene.stop.note() };
  }

  /** A stage objective that has just started may call for the police: an "evade" raises the wanted level. */
  private storyPolice(): void {
    const objective = this.missions.objective;
    if (objective === this.lastObjective) return;
    this.lastObjective = objective;
    if (objective?.type === "evade") this.police.setStars(Math.max(this.police.wanted.stars, objective.stars));
  }

  /** Reputation a stage pays (the city jobs' score); the toast's text for it. */
  private stageReputation(points: number): string {
    if (points <= 0) return "";
    const gained = this.desk.runner.gainReputation(points);
    this.desk.save();
    return gained > 0 ? ` · reputation +${gained}` : "";
  }

  /** For tests and debugging only: set the wanted level, and give pistol rounds. */
  debugSetWanted(stars: number): void {
    this.police.setStars(stars);
  }

  debugGiveAmmo(rounds: number): void {
    this.combat.ammo = Math.max(0, Math.floor(rounds));
  }

  private fixedUpdate(dt: number): void {
    this.simTime += dt;
    this.clock.advance(dt);
    const stick = this.controls.state;
    const moveX = stick.moveX;
    const moveY = stick.moveY;
    // In a fight JUMP is DODGE: a short dash along the stick (or straight back), untouchable for a moment.
    const jumpPressed = this.controls.consumeJump();
    const dodge = jumpPressed && this.combatMode && !this.driving && !this.boarder.busy && this.player.grounded;
    const jump = jumpPressed && !dodge;
    if (dodge && this.combat.dodge()) {
      const yaw = this.camera.yaw;
      const held = Math.hypot(moveX, moveY) > 0.2;
      // Camera-relative like walking; with no stick, back away from where the player faces.
      const dx = held ? moveX * Math.cos(yaw) - moveY * Math.sin(yaw) : Math.sin(this.player.yaw);
      const dz = held ? -moveX * Math.sin(yaw) - moveY * Math.cos(yaw) : Math.cos(this.player.yaw);
      this.player.dash(dx, dz, COMBAT_FEEL.dodgeDistance, COMBAT_FEEL.dodgeFor);
      this.avatar.play("dodge");
      this.sound.dodge();
    }
    const action = this.controls.consumeAction();
    const gearAsked = this.controls.consumeGear();
    // Getting in or out: the presses above are used up and ignored until it is over.
    const boarding = this.boarder.busy;
    this.boardingStep(dt);

    if (boarding) {
      // The sequence has the player.
    } else if (action && !this.driving && this.railway?.act(this.where())) {
      // Boarded or stepped off a train.
    } else if (action) {
      if (this.driving) this.getOut();
      else if (this.nearby) this.getIn(this.nearby);
      else this.enteringPlace = this.placeDesk.near(this.player.position);
    }

    let driverInput: VehicleControls | null = null;
    if (boarding && this.driving) {
      // Getting out: the vehicle stays where it is, brake held.
      driverInput = { throttle: 0, steer: 0, brake: 1 };
    } else if (boarding || this.boarder.busy) {
      // Getting in: the figure is placed by the sequence, not the physics.
    } else if (this.driving) {
      const speed = this.driving.body.forwardSpeed();
      // Gear rules (P / R / D, braking before a shift) are in the Gearbox (@cow/vehicles).
      if (gearAsked) this.gearbox.select(gearAsked, speed);
      driverInput = this.gearbox.controls({ gas: stick.gas, brake: stick.brake, steer: moveX }, speed);
      const hint = this.gearbox.consumeHint();
      if (hint) this.hud.showToast(hint, "", 2.4);
    } else if (!this.railway?.riding && !this.railway?.walking) {
      this.player.update({ moveX, moveY, jump, cameraYaw: this.camera.yaw }, dt);
    }
    for (const vehicle of this.vehicles) vehicle.update(vehicle === this.driving ? driverInput : null, dt);
    this.pedal = driverInput ? Math.abs(driverInput.throttle) : 0;
    // Crashes: a thump, and a bump on the job's record. Parked vehicles' knocks are forgotten.
    let impact = 0;
    for (const vehicle of this.vehicles) {
      const hit = vehicle.consumeImpact();
      if (vehicle === this.driving) impact = hit;
    }
    if (impact > 0) this.sound.crash(impact);

    const before = this.where();
    this.parkedObstacles.length = 0;
    for (const vehicle of this.vehicles) if (vehicle !== this.driving) this.parkedObstacles.push(...vehicle.footprint());
    this.parkedObstacles.push(...this.police.obstacles());
    const room = this.driving ? this.driving.footprint() : [{ x: before.x, z: before.z, radius: 0.5 }];
    // Traffic pulls over for the player's siren, or else for the nearest police car's.
    const siren = this.driving?.siren ? { x: before.x, z: before.z, heading: this.driving.body.yaw() } : this.police.siren(before);
    // Rush hours are busy, late nights quiet.
    this.population.setHour(this.clock.hour);
    const driven = this.driving ? this.drivenMotion(this.driving) : null;
    for (const hit of this.population.fixedUpdate(dt, before, room, this.parkedObstacles, siren, driven)) this.pedestrianHit(hit);
    this.police.fixedUpdate(dt, this.policeView(before, impact));
    this.fight(dt, before);
    this.fighters.fixedUpdate();
    this.railway?.fixedUpdate(dt, before);
    this.physics.step(dt);

    const at = this.where();
    this.playerMotion.step(at.x, at.y, at.z, this.driving ? this.driving.body.yaw() : this.player.yaw);
    const status = {
      x: at.x,
      z: at.z,
      mode: this.driving ? this.driving.kind : ("foot" as const),
      speed: this.driving ? Math.abs(this.driving.body.forwardSpeed()) : this.player.speed,
    };
    // A city job or a story puts the stage on hold until it is finished or quit.
    this.placeDesk.fixedUpdate(dt, status);
    if (this.desk.active) this.desk.fixedUpdate(dt, status, impact);
    else if (!this.placeDesk.story) this.announce(
      this.missions.update(dt, {
        x: at.x,
        z: at.z,
        mode: this.driving ? this.driving.kind : "foot",
        speed: this.driving ? Math.abs(this.driving.body.forwardSpeed()) : this.player.speed,
        cleared: this.cleared,
        onTrain: this.railway?.riding ?? false,
        wanted: this.police.wanted.stars,
      }),
    );
    this.storyPolice();

    // Safety net: anything that ends up under the world goes back to the start.
    if (at.y < -20) this.teleport(this.content.spawn.x, this.content.spawn.z, this.content.spawn.yaw);
  }

  /** Once per display frame. `alpha` (0 to 1): how far the clock is past the last fixed step (`GameLoop`). */
  private frame(dt: number, alpha = 1): void {
    this.frames++;
    if (this.enteringPlace) {
      const place = this.enteringPlace;
      this.enteringPlace = null;
      if (!this.driving && !this.paused) {
        this.placeDesk.enter(place);
        return;
      }
    }
    const look = this.controls.consumeLook();
    this.camera.look(look.dx, look.dy);

    // Drawn part-way between the last two steps (see `playerMotion`).
    const drawn = this.playerMotion.at(alpha);
    const at = { x: drawn.x, y: drawn.y, z: drawn.z };
    for (const vehicle of this.vehicles) vehicle.sync(dt, alpha);

    const ride = this.railway?.rideChase();
    const boarding = this.boarder.active;
    if (boarding && this.boarder.busy) {
      // Getting in or out: the figure is placed by the sequence and the camera follows it.
      this.boarder.frame(dt);
      this.camera.update(dt, this.boarder.position() ?? at, this.physics, boarding.body);
      this.hud.setSpeed(null);
      this.sound.setEngine(null);
      this.sound.setSkid(null);
      this.nearby = null;
      this.controls.setAction(null);
    } else if (this.railway?.walking) {
      // Walking through a coach's doorway, getting on or off a train.
      this.railway.walkFrame(dt);
      this.camera.update(dt, at, this.physics, this.player.body);
      this.hud.setSpeed(null);
      this.nearby = null;
      if (!this.railWalk) this.controls.setMode("busy");
      this.railWalk = true;
      this.controls.setAction(this.railway.action);
    } else if (this.railWalk) {
      // The walk through the doorway is over: the foot controls come back.
      this.railWalk = false;
      this.controls.setMode("foot");
    }
    if (this.boarder.busy || this.railway?.walking) {
      // Drawn above.
    } else if (ride) {
      // On a train: the camera follows it; the rider is inside, out of sight.
      this.camera.chase(ride, dt);
      this.camera.update(dt, at, this.physics, this.player.body);
      this.hud.setSpeed(null);
      this.sound.setEngine(null);
      this.sound.setSkid(null);
      this.nearby = null;
      this.controls.setAction(this.railway?.action ?? null);
    } else if (this.driving) {
      const body = this.driving.body;
      this.camera.chase({ velocity: body.planarVelocity(), heading: body.yaw(), forwardSpeed: body.forwardSpeed(), topSpeed: this.driving.type.physics.maxSpeed }, dt);
      this.camera.update(dt, at, this.physics, this.driving.body);
      const gear = this.gearbox.label(this.driving.type, this.driving.body.forwardSpeed());
      this.controls.setGear(this.gearbox.gear, this.gearbox.pending);
      this.hud.setSpeed(this.driving.speedKmh, gear);
      if (shiftedUp(this.lastGear, gear)) this.sound.gearChange();
      this.lastGear = gear;
      const top = this.driving.type.physics.maxSpeed;
      // Each vehicle's own engine (profiles in @cow/audio): revs follow speed, gear and accelerator.
      this.sound.setEngine({ kind: soundKind(this.driving.kind), speed: Math.min(top, Math.abs(this.driving.body.forwardSpeed())), throttle: this.pedal });
      this.sound.setSkid(body.drifting());
      if (this.controls.consumeHorn()) {
        // The ambulance's button switches the siren; everything else has a horn.
        if (this.driving.type.siren) {
          this.driving.setSiren(!this.driving.siren);
          this.sound.setSiren(this.driving.siren);
        } else this.sound.horn(soundKind(this.driving.kind));
      }
      const seat = this.driving.riderPose();
      this.avatar.object.position.set(seat.x, seat.y, seat.z);
      this.avatar.object.quaternion.copy(seat.quaternion);
      this.nearby = null;
      this.controls.setAction("EXIT");
    } else {
      this.avatar.object.position.set(at.x, at.y, at.z);
      this.avatar.object.rotation.y = drawn.heading;
      // In a fight: forearms up while blocking, fists up when bare-handed.
      this.avatar.setStance(this.blocking ? "block" : this.combatMode && this.avatar.shownWeapon === null ? "guard" : null);
      this.avatar.update(dt, this.player.speed, this.player.grounded);
      this.avatar.setAiming(this.aimFor > 0);
      this.camera.update(dt, at, this.physics, this.player.body);
      this.hud.setSpeed(null);
      this.sound.setEngine(null);
      this.sound.setSkid(null);
      this.lastGear = "";
      // Footsteps at the stride's cadence (splashier in the rain), and a thud on landing.
      this.sound.walk(dt, this.player.speed, this.player.grounded, this.renderer.raining ? 1 : 0);
      if (!this.player.grounded) this.airborne += dt;
      else {
        if (this.airborne > 0.3) this.sound.land(Math.min(1, this.airborne / 1.2));
        this.airborne = 0;
      }

      // Offer to get in the closest vehicle within reach.
      this.nearby = null;
      let closest = ENTER_RANGE;
      for (const vehicle of this.vehicles) {
        const p = vehicle.body.position();
        const d = Math.hypot(p.x - at.x, p.z - at.z);
        if (d < closest) {
          closest = d;
          this.nearby = vehicle;
        }
      }
      // The train's BOARD / STEP OFF comes first, then a vehicle within reach, then a place's entrance.
      const railAction = this.railway?.action ?? null;
      const place = railAction || this.nearby ? null : this.placeDesk.near(at);
      this.controls.setAction(railAction ?? (this.nearby || place ? "ENTER" : null), place ? "Go inside" : undefined);
    }

    // Mission marker, panel and minimap.
    const mission = this.missions.mission;
    const objective = this.missions.objective;
    const target = this.currentTarget(at);
    // Inside the marker its column of light would tint the whole view, so it is hidden there.
    this.beacon.place(target && Math.hypot(target.x - at.x, target.z - at.z) > target.radius ? target : null);
    this.beacon.update(dt);
    this.placeMarkers.update(dt);
    this.hud.setMoney(this.missions.balance, this.missions.stagesDone, this.missions.stageCount);
    this.hud.setReputation(this.desk.runner.reputation);
    const job = this.desk.active;
    const distance = target ? Math.hypot(target.x - at.x, target.z - at.z) : null;
    this.hud.setMission(
      job
        ? this.desk.view(this.driving?.kind === job.vehicle, distance)
        : this.placeDesk.story
        ? this.placeDesk.view(distance)
        : mission && objective
        ? {
            title: `Stage ${mission.stage} · ${mission.title}`,
            objective: this.missions.fare?.note() ? `${objective.label} · ${this.missions.fare.note()}` : objective.label,
            distance: target ? Math.hypot(target.x - at.x, target.z - at.z) : null,
            secondsLeft: this.missions.secondsLeft,
          }
        : null,
    );
    const markers: MinimapMarker[] = this.vehicles
      .filter((v) => v !== this.driving)
      .map((v) => ({ x: v.body.position().x, z: v.body.position().z, color: MINIMAP_COLORS[v.kind], size: v.kind === "bus" ? 5 : 3.5 }));
    for (const enemy of this.combat.enemies) if (enemy.health > 0 && !isPoliceGroup(enemy.group)) markers.push({ x: enemy.x, z: enemy.z, color: "#ff4d4d", size: 4 });
    markers.push(...this.police.markers());
    if (this.railway) markers.push(...this.railway.stations);
    markers.push(...this.placeDesk.markers());
    markers.push(...this.desk.markers());
    if (target) markers.push({ x: target.x, z: target.z, color: "#ffb703", pinned: true, size: 6 });
    this.minimap.setRoute(this.desk.route());
    this.minimap.update(dt, at.x, at.z, this.driving ? this.driving.body.yaw() : this.player.yaw, this.camera.yaw, markers);

    this.fighters.frame(dt, alpha, at);
    this.police.frame(dt, at, alpha);
    this.hud.setHealth(this.combat.health / PLAYER_MAX_HEALTH);
    const quarry = this.missions.quarry;
    const chase = objective?.type === "chase" ? objective : null;
    this.arms.frame(dt, at, this.avatar, !this.driving && !ride, quarry && chase ? { ...quarry, kind: chase.quarry } : null);
    // The name of the street underfoot, from the map. Looked up twice a second.
    this.sinceStreet += dt;
    if (this.sinceStreet > 0.5) {
      this.sinceStreet = 0;
      const road = nearestRoadPoint(this.map, at, false);
      this.street = road && road.distance < road.road.width / 2 + 6 && road.road.name ? road.road.name : "";
      this.hud.setStreet(this.street);
      this.trackDistrict(at);
      this.announceArea();
    }
    this.population.frame(dt, at, alpha);
    this.railway?.frame(at, dt, this.clock.hour);
    // Share auto passengers: waiting at the kerb near the player, and seated in the auto.
    const shareAuto = this.driving && job?.share && this.driving.kind === job.vehicle ? this.driving.object : null;
    this.riders.frame(dt, this.desk.runner.share, at, shareAuto);
    this.fareFrame(dt, at);
    this.chunks.update(at.x, at.z);
    // Sea haze: thicker air within about 600 m of the coast.
    this.sinceHaze += dt;
    if (this.sinceHaze > 0.5) {
      this.sinceHaze = 0;
      const coast = distanceToCoast(this.map.sea, at);
      this.renderer.setHaze(1 + 0.6 * Math.max(0, 1 - coast / 600));
    }
    this.soundFrame(dt, at);
    this.marks.update(this.fighters.marks(this.renderer.camera, this.driving ? null : this.lock, at));
    this.mapView.follow(this.renderer.camera);
    this.renderer.focusShadows(at.x, at.z);
    // Light and sky follow the clock; rain, headlight pool and speed blur follow the player.
    this.renderer.setTimeOfDay(this.clock.hour);
    const lamps = this.driving ? { ...this.driving.body.position(), yaw: this.driving.body.yaw() } : null;
    this.renderer.update(dt, this.driving ? Math.abs(this.driving.body.forwardSpeed()) : 0, lamps);
    this.renderer.render();
    // After rendering, so the labels use this frame's camera.
    this.landmarkLabels.update(this.landmarks.place(this.renderer.camera, at));
    this.hud.setFps(this.loop.fps);
  }
}

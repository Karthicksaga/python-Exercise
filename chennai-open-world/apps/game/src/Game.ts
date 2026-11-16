/**
 * Composition root: builds the world, physics, player, vehicles, missions, camera and
 * controls, and runs the loop. Each concern lives in its own package; this file connects them
 * and owns the one piece of state they share: whether the player is on foot or driving.
 */
import * as THREE from "three";
import { Beacon, ChunkManager, FollowCamera, GameLoop, HAZE, MapView, SceneRenderer, createChunkAssets, facadeAtlas, type Quality } from "@cow/game-engine";
import { Sound } from "@cow/audio";
import { Combat, PLAYER_MAX_HEALTH, type CombatEvent, type PlayerState } from "@cow/combat";
import { DistrictIndex, GameClock, VisitedDistricts, boundarySolids, chunkSolids, coastSolids, distanceToCoast, nearestRoadPoint, type WorldMap } from "@cow/game-world";
import { MissionRunner, type MissionEvent, type Objective, type Progress } from "@cow/missions";
import { PhysicsWorld, type StaticGroup, type VehicleControls } from "@cow/physics";
import { HumanAssets, PLAYER_HEIGHT, PLAYER_RADIUS, PlayerController, type HumanFigure } from "@cow/player";
import { Hud, Minimap, TouchControls, type MinimapMarker } from "@cow/ui";
import { Vehicle, gearFor, setVehicleNightLights, shiftedUp } from "@cow/vehicles";
import { buildContent, type GameContent } from "./content";
import { Fighters, combatWorld } from "./Fighters";
import { JobDesk } from "./JobDesk";
import { KeyboardInput } from "./KeyboardInput";
import { insideShell, onShellMessage, sendToShell } from "./nativeBridge";
import { Population } from "./Population";
import { LandmarkView } from "@cow/game-engine";
import { landmarkSolids } from "@cow/game-world";
import { LandmarkLabels } from "@cow/ui";
import { loadWorld } from "./WorldFiles";
import playerModel from "../../../assets/models/player.glb?inline";
import locomotion from "../../../assets/animations/locomotion.glb?inline";
import { loadSignFont } from "@cow/game-engine";
import signFont from "../../../assets/fonts/noto-sans-tamil-signs.woff2?inline";

/** What tests and the debug console can read about the running game. */
export interface GameSnapshot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly cameraYaw: number;
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
  readonly vehicles: Array<{ id: string; kind: string; x: number; z: number }>;
  readonly traffic: Array<{ x: number; z: number; speed: number; kind: string }>;
  readonly pedestrians: number;
  /** AI vehicles the time of day and area call for (`traffic` catches up as they go out of sight). */
  readonly trafficWanted: number;
  /** Signalled junctions, and AI vehicles held at their lights or crossings. */
  readonly signals: number;
  readonly waitingAtSignals: number;
  readonly health: number;
  readonly ammo: number;
  readonly enemies: Array<{ x: number; z: number; health: number; armed: boolean }>;
  readonly street: string;
  /** Named area the player is in (nearest OSM place point, estimated), and those visited. */
  readonly district: string;
  readonly visitedDistricts: string[];
  /** City job being worked, its next stop and the reputation. */
  readonly job: string | null;
  readonly jobStop: number;
  readonly reputation: number;
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
}

const SAVE_KEY = "cow-progress-v1";
const MINIMAP_COLORS: Record<Vehicle["kind"], string> = { car: "#e9eef5", auto: "#f5c400", bike: "#5aa9ff", ambulance: "#ff5d5d", bus: "#3fc1b0" };
/** How close the player must be to a vehicle to get in, metres. */
const ENTER_RANGE = 3.6;

function pickQuality(): Quality {
  // `?quality=lite` (or low/high) overrides the automatic choice; the tests use lite.
  const asked = new URLSearchParams(location.search).get("quality");
  if (asked === "lite" || asked === "low" || asked === "high") return asked;
  return /Android|iPhone|iPad/i.test(navigator.userAgent) ? "low" : "high";
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
    localStorage.setItem(SAVE_KEY, JSON.stringify(progress));
  } catch {
    // Storage can be unavailable (private mode); the game still plays, without saving.
  }
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
  private throttle = 0;
  /** Gear shown last frame, to hear a change up. */
  private lastGear = "";
  /** Time of day. Systems that change with it read `clock.hour`. */
  private readonly clock = new GameClock(loadHour());
  /** Clear or light rain, from the pause menu; the renderer draws it. */
  private weather = loadWeather();
  /** Landmark models (always loaded) and their name labels. */
  private readonly landmarks: LandmarkView;
  private readonly landmarkLabels: LandmarkLabels;

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
    private readonly keyboard: KeyboardInput,
    private readonly hud: Hud,
    private readonly minimap: Minimap,
  ) {
    this.loop = new GameLoop({ fixedUpdate: (dt) => this.fixedUpdate(dt), frame: (dt) => this.frame(dt) });
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
  }

  static async create(canvas: HTMLCanvasElement, stage: HTMLElement): Promise<Game> {
    // The Tamil font for shop signs loads while the world does; the game starts without it.
    const signFontLoaded = loadSignFont(signFont);
    // The world files are produced from OpenStreetMap by `npm run build:world` (TD-16).
    const world = await loadWorld();
    const map = world.map;
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
    await signFontLoaded;
    const chunks = new ChunkManager(map, world.chunks, renderer.scene, createChunkAssets(facadeAtlas()), {
      loaded: (chunk) => {
        minimap?.addBuildings(chunk.key, chunk.buildings);
        const group = physics.createStaticGroup();
        const data = chunkSolids(chunk);
        group.addMesh(data.vertices, data.indices);
        for (const box of data.boxes) group.addBox(box);
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
    const humans = await HumanAssets.load({ model: playerModel, animations: locomotion });
    const avatar = humans.create();
    renderer.scene.add(avatar.object);

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
    const keyboard = new KeyboardInput();

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
    game = new Game(map, content, renderer, mapView, chunks, physics, player, avatar, vehicles, population, combat, fighters, sound, missions, beacon, camera, controls, keyboard, hud, minimap);

    window.addEventListener("resize", () => renderer.resize());
    // Stop simulating while the app is in the background: saves battery and avoids a time jump.
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) game.loop.stop();
      else if (!game.paused && !game.held) game.loop.start();
    });
    onShellMessage((message) => game.setPaused(message.type === "pause"));
    return game;
  }

  start(): void {
    this.renderer.setRain(this.weather === "rain", true);
    this.loop.start();
    const mission = this.missions.mission;
    if (mission) this.hud.showToast(`Stage ${mission.stage}: ${mission.title}`, mission.brief, 5);
    else this.hud.showToast("Free roam", "Every stage is complete. The city is yours.", 4);
    sendToShell({ type: "ready", gpu: this.renderer.gpu() });
  }

  /** Open the job board (the JOBS button, or J on a keyboard). */
  openBoard(): void {
    if (!this.paused) this.desk.openBoard();
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
    this.weather = this.weather === "rain" ? "clear" : "rain";
    try {
      localStorage.setItem(WEATHER_KEY, this.weather);
    } catch {
      // Not saved; the weather still changes.
    }
    this.renderer.setRain(this.weather === "rain", true);
    this.renderer.render();
    this.paused = false;
    this.setPaused(true);
  }

  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
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
      this.hud.addOverlayAction({ label: "New game", quiet: true, run: () => this.newGame() });
      if (insideShell()) this.hud.addOverlayAction({ label: "Main menu", quiet: true, run: () => sendToShell({ type: "exit" }) });
    } else {
      this.hud.hideOverlay();
      this.loop.start();
    }
    sendToShell({ type: "paused", paused });
  }

  /** Forget progress and put everything back where it started. */
  private newGame(): void {
    this.missions.reset();
    saveProgress(this.missions.progress());
    this.desk.reset();
    this.visited.clear();
    this.saveDistricts();
    this.district = "";
    this.areaNews = null;
    this.cleared.clear();
    this.combat.keepOnly([]);
    this.combat.revive();
    this.combat.ammo = 0;
    if (this.driving) this.leaveVehicle(true);
    this.content.parking.forEach((spot, i) => this.vehicles[i]?.body.teleport({ x: spot.x, y: (this.vehicles[i]?.type.rideHeight ?? 0.7) + 0.1, z: spot.z }, spot.yaw));
    this.teleport(this.content.spawn.x, this.content.spawn.z, this.content.spawn.yaw);
    this.setPaused(false);
    const mission = this.missions.mission;
    if (mission) this.hud.showToast(`Stage ${mission.stage}: ${mission.title}`, mission.brief, 5);
  }

  /** Where the player is: their vehicle when driving, otherwise their feet. */
  private where(): { x: number; y: number; z: number } {
    if (!this.driving) return this.player.position;
    const p = this.driving.body.position();
    return { x: p.x, y: p.y - this.driving.type.rideHeight, z: p.z };
  }

  /**
   * Move the player (and the vehicle they are in) somewhere else at once. Resolves when the
   * chunks around the new place are loaded (tests wait for it).
   */
  teleport(x: number, z: number, yaw = 0): Promise<void> {
    const ready = this.chunks.whenLoaded(x, z);
    this.chunks.update(x, z, true);
    if (this.driving) this.driving.body.teleport({ x, y: this.driving.type.rideHeight + 0.1, z }, yaw);
    else this.player.respawn({ x, y: 0.1, z }, yaw);
    this.camera.yaw = yaw;
    return ready;
  }

  /** Distance to the first solid from a point 1 m above the ground, for tests and debugging. */
  probe(x: number, z: number, dx: number, dz: number, max: number): number | null {
    const length = Math.hypot(dx, dz) || 1;
    return this.physics.raycast({ x, y: 1, z }, { x: dx / length, y: 0, z: dz / length }, max, this.driving ? this.driving.body : this.player.body);
  }

  private enterVehicle(vehicle: Vehicle): void {
    this.driving = vehicle;
    this.sound.door();
    this.avatar.setAiming(false);
    this.player.body.setEnabled(false);
    // Open vehicles show the rider sitting; closed ones hide the driver.
    const open = vehicle.type.seat !== undefined;
    this.avatar.visible = open;
    this.avatar.setSeated(open);
    this.camera.reach = vehicle.type.cameraDistance;
    this.controls.setMode("drive");
    this.controls.setHornLabel(vehicle.type.siren ? "SIREN" : "HORN");
  }

  /** Get out beside the vehicle, on whichever side has room. */
  private leaveVehicle(force = false): void {
    const vehicle = this.driving;
    if (!vehicle) return;
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
    this.driving = null;
    this.sound.door();
    this.player.body.setEnabled(true);
    this.player.respawn({ x: p.x - Math.sin(exit) * out, y: 0.1, z: p.z - Math.cos(exit) * out }, yaw);
    this.avatar.visible = true;
    this.avatar.setSeated(false);
    this.avatar.object.quaternion.identity();
    this.camera.reach = 5.6;
    this.controls.setMode("foot");
  }

  /** The marker for the current objective: a place, or the nearest vehicle of the wanted kind. */
  private target(objective: Objective | null, at: { x: number; z: number }): { x: number; z: number; radius: number } | null {
    if (!objective) return null;
    if (objective.type === "reach" || objective.type === "defeat") return { x: objective.x, z: objective.z, radius: objective.radius };
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
    if (!job) return this.target(this.missions.objective, at);
    if (this.driving?.kind !== job.vehicle) return this.target({ type: "enter", label: "", vehicle: job.vehicle }, at);
    return this.desk.stopTarget();
  }

  private announce(events: MissionEvent[]): void {
    for (const event of events) {
      if (event.type === "objective") this.sound.chime();
      if (event.type === "completed") {
        this.sound.fanfare();
        this.cleared.clear();
        this.hud.showToast(`Stage ${event.mission.stage} complete`, `${event.mission.title} · +₹${event.mission.reward}`, 4);
        saveProgress(this.missions.progress());
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
      cameraPitch: this.camera.pitch,
      grounded: this.driving ? true : this.player.grounded,
      speed: this.driving ? Math.abs(this.driving.body.forwardSpeed()) : this.player.speed,
      fps: this.loop.fps,
      paused: this.paused,
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
      vehicles: this.vehicles.map((v) => ({ id: v.id, kind: v.kind, x: v.body.position().x, z: v.body.position().z })),
      traffic: this.population.trafficPositions(),
      pedestrians: this.population.pedestrianCount,
      trafficWanted: this.population.trafficWanted,
      signals: this.population.signalCount,
      waitingAtSignals: this.population.waitingAtSignals,
      health: this.combat.health,
      ammo: this.combat.ammo,
      enemies: this.combat.enemies.map((e) => ({ x: e.x, z: e.z, health: e.health, armed: e.armed })),
      street: this.street,
      district: this.district,
      visitedDistricts: [...this.visited.list()],
      job: this.desk.active?.id ?? null,
      jobStop: this.desk.runner.stopNumber,
      reputation: this.desk.runner.reputation,
      gear: this.driving ? gearFor(this.driving.type, this.driving.body.forwardSpeed(), this.throttle) : "",
      siren: this.driving?.siren ?? false,
      held: this.held,
      hour: this.clock.hour,
      weather: this.weather,
      drift: this.driving?.body.drifting() ?? 0,
      landmarks: (this.map.landmarks ?? []).map((l) => ({ id: l.id, name: l.name, x: l.x, z: l.z, radius: l.radius ?? 0, label: this.landmarkLabels.isShown(l.id) })),
    };
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
    // No fights while on a city job.
    const group = objective?.type === "defeat" && !this.desk.active ? objective.group : null;
    this.combat.keepOnly(group ? [group] : []);
    if (group && !this.cleared.has(group) && this.combat.remaining(group) === 0) {
      const spots = this.content.enemies[group] ?? [];
      this.combat.spawnGroup(group, spots);
      // Enough rounds for the armed ones, with some to spare.
      const armed = spots.filter((spot) => spot.armed).length;
      if (armed > 0) this.combat.ammo = Math.max(this.combat.ammo, armed * 8 + 8);
    }

    const events: CombatEvent[] = [];
    const state: PlayerState = {
      x: at.x,
      z: at.z,
      heading: this.player.yaw,
      inVehicle: this.driving !== null,
      speed: this.driving ? Math.abs(this.driving.body.forwardSpeed()) : this.player.speed,
    };
    const punch = [this.controls.consumePunch(), this.keyboard.consumePunch()].some(Boolean);
    const fire = this.controls.state.fire || this.keyboard.fire;
    this.aimFor = Math.max(0, this.aimFor - dt);
    this.sinceClick += dt;

    if (!this.driving && (punch || fire)) {
      // Attacks go where the camera looks, so turn the player to face that way first.
      this.player.yaw = this.camera.yaw;
      const facing = { ...state, heading: this.camera.yaw };
      if (punch) {
        const hit = this.combat.punch(facing, events);
        if (hit !== undefined) {
          this.avatar.punch();
          if (hit) this.sound.punch();
          else this.sound.whiff();
        }
      }
      if (fire) {
        const shot = this.combat.shoot(facing, events);
        if (shot.fired) {
          this.aimFor = 0.7;
          this.sound.shot();
          const muzzle = { x: at.x - Math.sin(this.camera.yaw) * 0.7, z: at.z - Math.cos(this.camera.yaw) * 0.7 };
          this.fighters.tracer(muzzle.x, muzzle.z, shot.toX, shot.toZ);
        } else if (this.combat.ammo === 0 && this.sinceClick > 0.4) {
          this.sinceClick = 0;
          this.sound.click();
        }
      }
    }

    events.push(...this.combat.update(dt, state));
    for (const event of events) {
      if (event.type === "enemyShot") {
        this.sound.shot(true);
        this.fighters.tracer(event.fromX, event.fromZ, event.toX, event.toZ);
      } else if (event.type === "enemyPunch") {
        this.fighters.enemyPunch(event.enemy);
        this.sound.punch();
      } else if (event.type === "playerHurt") {
        this.hud.flashHurt();
        this.sound.hurt();
      } else if (event.type === "groupCleared") {
        this.cleared.add(event.group);
      } else if (event.type === "playerDied") {
        this.knockedOut();
      }
    }
  }

  /** The player ran out of health: a hospital bill, and the stage starts again. */
  private knockedOut(): void {
    const bill = this.missions.charge(100);
    this.missions.restartStage();
    saveProgress(this.missions.progress());
    this.cleared.clear();
    this.combat.keepOnly([]);
    this.combat.revive();
    if (this.driving) this.leaveVehicle(true);
    this.teleport(this.content.spawn.x, this.content.spawn.z, this.content.spawn.yaw);
    this.sound.fail();
    this.hud.showToast("Knocked out", bill > 0 ? `Hospital bill ₹${bill}. The stage starts again.` : "The stage starts again.", 4.5);
  }

  private fixedUpdate(dt: number): void {
    this.simTime += dt;
    this.clock.advance(dt);
    const stick = this.controls.state;
    const moveX = stick.moveX || this.keyboard.moveX;
    const moveY = stick.moveY || this.keyboard.moveY;
    // Read both sources every step, so a press on one is never left pending.
    const jump = [this.controls.consumeJump(), this.keyboard.consumeJump()].some(Boolean);
    const action = [this.controls.consumeAction(), this.keyboard.consumeAction()].some(Boolean);

    if (action) {
      if (this.driving) this.leaveVehicle();
      else if (this.nearby) this.enterVehicle(this.nearby);
    }

    let driverInput: VehicleControls | null = null;
    if (this.driving) {
      const speed = this.driving.body.forwardSpeed();
      const gas = stick.gas || this.keyboard.moveY > 0;
      const brake = stick.brake || this.keyboard.moveY < 0;
      // The brake pedal brakes while rolling forwards and reverses once the vehicle has stopped.
      const reversing = brake && speed < 0.8;
      driverInput = { throttle: gas ? 1 : reversing ? -1 : 0, steer: moveX, brake: brake && !reversing ? 1 : 0 };
      this.throttle = driverInput.throttle;
    } else {
      this.player.update({ moveX, moveY, run: this.keyboard.run, jump, cameraYaw: this.camera.yaw }, dt);
    }
    for (const vehicle of this.vehicles) vehicle.update(vehicle === this.driving ? driverInput : null, dt);
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
    const room = this.driving ? this.driving.footprint() : [{ x: before.x, z: before.z, radius: 0.5 }];
    const siren = this.driving?.siren ? { x: before.x, z: before.z, heading: this.driving.body.yaw() } : null;
    // Rush hours are busy, late nights quiet.
    this.population.setHour(this.clock.hour);
    this.population.fixedUpdate(dt, before, room, this.parkedObstacles, siren);
    this.fight(dt, before);
    this.fighters.fixedUpdate();
    this.physics.step(dt);

    const at = this.where();
    const status = {
      x: at.x,
      z: at.z,
      mode: this.driving ? this.driving.kind : ("foot" as const),
      speed: this.driving ? Math.abs(this.driving.body.forwardSpeed()) : this.player.speed,
    };
    // A city job puts the stage on hold until it is finished or quit.
    if (this.desk.active) this.desk.fixedUpdate(dt, status, impact);
    else this.announce(
      this.missions.update(dt, {
        x: at.x,
        z: at.z,
        mode: this.driving ? this.driving.kind : "foot",
        speed: this.driving ? Math.abs(this.driving.body.forwardSpeed()) : this.player.speed,
        cleared: this.cleared,
      }),
    );

    // Safety net: anything that ends up under the world goes back to the start.
    if (at.y < -20) this.teleport(this.content.spawn.x, this.content.spawn.z, this.content.spawn.yaw);
  }

  private frame(dt: number): void {
    this.frames++;
    if (this.keyboard.consumeBoard()) {
      this.openBoard();
      return;
    }
    const look = this.controls.consumeLook();
    this.camera.look(look.dx, look.dy);

    const at = this.where();
    for (const vehicle of this.vehicles) vehicle.sync(dt);

    if (this.driving) {
      const body = this.driving.body;
      this.camera.chase({ velocity: body.planarVelocity(), heading: body.yaw(), forwardSpeed: body.forwardSpeed(), topSpeed: this.driving.type.physics.maxSpeed }, dt);
      this.camera.update(dt, at, this.physics, this.driving.body);
      const gear = gearFor(this.driving.type, this.driving.body.forwardSpeed(), this.throttle);
      this.hud.setSpeed(this.driving.speedKmh, gear);
      if (shiftedUp(this.lastGear, gear)) this.sound.gearChange();
      this.lastGear = gear;
      const top = this.driving.type.physics.maxSpeed;
      this.sound.setEngine(Math.abs(this.driving.body.forwardSpeed()) / top, this.driving.kind === "auto" || this.driving.kind === "bike");
      this.sound.setSkid(body.drifting());
      if ([this.controls.consumeHorn(), this.keyboard.consumeHorn()].some(Boolean)) {
        // The ambulance's button switches the siren; everything else has a horn.
        if (this.driving.type.siren) {
          this.driving.setSiren(!this.driving.siren);
          this.sound.setSiren(this.driving.siren);
        } else this.sound.horn();
      }
      const seat = this.driving.riderPose();
      if (seat) {
        this.avatar.object.position.set(seat.x, seat.y, seat.z);
        this.avatar.object.quaternion.copy(seat.quaternion);
      }
      this.nearby = null;
      this.controls.setAction("EXIT");
    } else {
      this.avatar.object.position.set(at.x, at.y, at.z);
      this.avatar.object.rotation.y = this.player.yaw;
      this.avatar.update(dt, this.player.speed, this.player.grounded);
      this.avatar.setAiming(this.aimFor > 0);
      this.camera.update(dt, at, this.physics, this.player.body);
      this.hud.setSpeed(null);
      this.sound.setEngine(null);
      this.sound.setSkid(null);
      this.lastGear = "";

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
      this.controls.setAction(this.nearby ? "ENTER" : null);
    }

    // Mission marker, panel and minimap.
    const mission = this.missions.mission;
    const objective = this.missions.objective;
    const target = this.currentTarget(at);
    // Inside the marker its column of light would tint the whole view, so it is hidden there.
    this.beacon.place(target && Math.hypot(target.x - at.x, target.z - at.z) > target.radius ? target : null);
    this.beacon.update(dt);
    this.hud.setMoney(this.missions.balance, this.missions.stagesDone, this.missions.stageCount);
    this.hud.setReputation(this.desk.runner.reputation);
    const job = this.desk.active;
    const distance = target ? Math.hypot(target.x - at.x, target.z - at.z) : null;
    this.hud.setMission(
      job
        ? this.desk.view(this.driving?.kind === job.vehicle, distance)
        : mission && objective
        ? {
            title: `Stage ${mission.stage} · ${mission.title}`,
            objective: objective.label,
            distance: target ? Math.hypot(target.x - at.x, target.z - at.z) : null,
            secondsLeft: this.missions.secondsLeft,
          }
        : null,
    );
    const markers: MinimapMarker[] = this.vehicles
      .filter((v) => v !== this.driving)
      .map((v) => ({ x: v.body.position().x, z: v.body.position().z, color: MINIMAP_COLORS[v.kind], size: v.kind === "bus" ? 5 : 3.5 }));
    for (const enemy of this.combat.enemies) if (enemy.health > 0) markers.push({ x: enemy.x, z: enemy.z, color: "#ff4d4d", size: 4 });
    if (target) markers.push({ x: target.x, z: target.z, color: "#ffb703", pinned: true, size: 6 });
    this.minimap.update(dt, at.x, at.z, this.driving ? this.driving.body.yaw() : this.player.yaw, this.camera.yaw, markers);

    this.fighters.frame(dt);
    this.hud.setHealth(this.combat.health / PLAYER_MAX_HEALTH);
    this.controls.setAmmo(this.combat.ammo);
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
    this.population.frame(dt, at);
    this.chunks.update(at.x, at.z);
    // Sea haze: thicker air within about 600 m of the coast.
    this.sinceHaze += dt;
    if (this.sinceHaze > 0.5) {
      this.sinceHaze = 0;
      const coast = distanceToCoast(this.map.sea, at);
      this.renderer.setHaze(1 + 0.6 * Math.max(0, 1 - coast / 600));
    }
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

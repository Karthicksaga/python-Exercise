/**
 * Composition root: builds the world, physics, player, vehicles, missions, camera and
 * controls, and runs the loop. Each concern lives in its own package; this file connects them
 * and owns the one piece of state they share: whether the player is on foot or driving.
 */
import * as THREE from "three";
import { Beacon, ChunkManager, FollowCamera, GameLoop, HAZE, MapView, SceneRenderer, createChunkAssets, facadeAtlas, type Quality } from "@cow/game-engine";
import { Sound } from "@cow/audio";
import { Combat, PLAYER_MAX_HEALTH, type CombatEvent, type PlayerState } from "@cow/combat";
import { boundarySolids, chunkSolids, nearestRoadPoint, type WorldMap } from "@cow/game-world";
import { MissionRunner, type MissionEvent, type Objective, type Progress } from "@cow/missions";
import { PhysicsWorld, type StaticGroup, type VehicleControls } from "@cow/physics";
import { HumanAssets, PLAYER_HEIGHT, PLAYER_RADIUS, PlayerController, type HumanFigure } from "@cow/player";
import { Hud, Minimap, TouchControls, type MinimapMarker } from "@cow/ui";
import { Vehicle } from "@cow/vehicles";
import { buildContent, type GameContent } from "./content";
import { Fighters, combatWorld } from "./Fighters";
import { KeyboardInput } from "./KeyboardInput";
import { insideShell, onShellMessage, sendToShell } from "./nativeBridge";
import { Population } from "./Population";
import worldJson from "./generated/anna-nagar.json";
import playerModel from "../../../assets/models/player.glb?inline";
import locomotion from "../../../assets/animations/locomotion.glb?inline";

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
  readonly mode: "foot" | "car" | "auto" | "bike";
  readonly money: number;
  readonly mission: string | null;
  readonly objective: string | null;
  readonly target: { x: number; z: number } | null;
  readonly chunksLoaded: number;
  readonly vehicles: Array<{ id: string; kind: string; x: number; z: number }>;
  readonly traffic: Array<{ x: number; z: number; speed: number }>;
  readonly pedestrians: number;
  readonly health: number;
  readonly ammo: number;
  readonly enemies: Array<{ x: number; z: number; health: number; armed: boolean }>;
  readonly street: string;
}

const SAVE_KEY = "cow-progress-v1";
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
  private readonly parkedObstacles: Array<{ x: number; z: number; radius: number }> = [];

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
  }

  static async create(canvas: HTMLCanvasElement, stage: HTMLElement): Promise<Game> {
    // The world file is produced from OpenStreetMap by `npm run build:world`.
    const map = worldJson as unknown as WorldMap;
    const content = buildContent(map);
    const { spawn } = content;

    const renderer = new SceneRenderer({ canvas, quality: pickQuality() });
    const mapView = new MapView(map, new THREE.Color(HAZE), renderer.sunOffset);
    renderer.scene.add(mapView.object);
    renderer.reflect(mapView.dome);

    const physics = await PhysicsWorld.create();
    const boundary = physics.createStaticGroup();
    for (const box of boundarySolids(map.bounds)) boundary.addBox(box);

    // Solids are streamed with the meshes: a chunk is solid exactly while it is visible.
    const solids = new Map<string, StaticGroup>();
    const chunks = new ChunkManager(map, renderer.scene, createChunkAssets(facadeAtlas()), {
      loaded: (chunk) => {
        const group = physics.createStaticGroup();
        const data = chunkSolids(chunk);
        group.addMesh(data.vertices, data.indices);
        for (const box of data.boxes) group.addBox(box);
        solids.set(chunk.key, group);
      },
      unloaded: (chunk) => {
        const group = solids.get(chunk.key);
        if (group) physics.removeStaticGroup(group);
        solids.delete(chunk.key);
      },
    });
    chunks.update(spawn.x, spawn.z, true);

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
    const hud = new Hud(stage, { title: map.name, subtitle: "Chennai" }, () => game?.setPaused(true));
    const minimap = new Minimap(hud.root, map);
    game = new Game(map, content, renderer, mapView, chunks, physics, player, avatar, vehicles, population, combat, fighters, sound, missions, beacon, camera, controls, keyboard, hud, minimap);

    window.addEventListener("resize", () => renderer.resize());
    // Stop simulating while the app is in the background: saves battery and avoids a time jump.
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) game.loop.stop();
      else if (!game.paused) game.loop.start();
    });
    onShellMessage((message) => game.setPaused(message.type === "pause"));
    return game;
  }

  start(): void {
    this.loop.start();
    const mission = this.missions.mission;
    if (mission) this.hud.showToast(`Stage ${mission.stage}: ${mission.title}`, mission.brief, 5);
    else this.hud.showToast("Free roam", "Every stage is complete. The city is yours.", 4);
    sendToShell({ type: "ready", gpu: this.renderer.gpu() });
  }

  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    this.controls.setVisible(!paused);
    if (paused) {
      this.loop.stop();
      this.sound.suspend();
      const help = "On foot: left side moves, right side looks. JUMP, HIT to punch, FIRE to shoot where you look, ENTER to get in a vehicle. Driving: left stick steers, GAS and BRAKE on the right (hold BRAKE to reverse).";
      this.hud.showOverlay("Paused", `${help} Map data ${this.map.attribution}.`, { label: "Resume", run: () => this.setPaused(false) });
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

  /** Move the player (and the vehicle they are in) somewhere else at once. */
  teleport(x: number, z: number, yaw = 0): void {
    this.chunks.update(x, z, true);
    if (this.driving) this.driving.body.teleport({ x, y: this.driving.type.rideHeight + 0.1, z }, yaw);
    else this.player.respawn({ x, y: 0.1, z }, yaw);
    this.camera.yaw = yaw;
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
    const target = this.target(objective, p);
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
      chunksLoaded: this.chunks.loadedCount,
      vehicles: this.vehicles.map((v) => ({ id: v.id, kind: v.kind, x: v.body.position().x, z: v.body.position().z })),
      traffic: this.population.trafficPositions(),
      pedestrians: this.population.pedestrianCount,
      health: this.combat.health,
      ammo: this.combat.ammo,
      enemies: this.combat.enemies.map((e) => ({ x: e.x, z: e.z, health: e.health, armed: e.armed })),
      street: this.street,
    };
  }

  /** One step of combat: place the enemies an objective calls for, the player's attacks, the enemies' turn. */
  private fight(dt: number, at: { x: number; z: number }): void {
    // Enemies exist only while their objective is the current one.
    const objective = this.missions.objective;
    const group = objective?.type === "defeat" ? objective.group : null;
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
    } else {
      this.player.update({ moveX, moveY, run: this.keyboard.run, jump, cameraYaw: this.camera.yaw }, dt);
    }
    for (const vehicle of this.vehicles) vehicle.update(vehicle === this.driving ? driverInput : null, dt);

    const before = this.where();
    this.parkedObstacles.length = 0;
    for (const vehicle of this.vehicles) {
      if (vehicle === this.driving) continue;
      const p = vehicle.body.position();
      this.parkedObstacles.push({ x: p.x, z: p.z, radius: 1.3 });
    }
    this.population.fixedUpdate(dt, { x: before.x, z: before.z, radius: this.driving ? 1.6 : 0.5 }, this.parkedObstacles);
    this.fight(dt, before);
    this.fighters.fixedUpdate();
    this.physics.step(dt);

    const at = this.where();
    this.announce(
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
    const look = this.controls.consumeLook();
    this.camera.look(look.dx, look.dy);

    const at = this.where();
    for (const vehicle of this.vehicles) vehicle.sync(dt);

    if (this.driving) {
      if (Math.abs(this.driving.body.forwardSpeed()) > 1.5) this.camera.trail(this.driving.body.yaw(), dt);
      this.camera.update(dt, at, this.physics, this.driving.body);
      this.hud.setSpeed(this.driving.speedKmh);
      const top = this.driving.type.physics.maxSpeed;
      this.sound.setEngine(Math.abs(this.driving.body.forwardSpeed()) / top, this.driving.kind !== "car");
      if ([this.controls.consumeHorn(), this.keyboard.consumeHorn()].some(Boolean)) this.sound.horn();
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
    const target = this.target(objective, at);
    // Inside the marker its column of light would tint the whole view, so it is hidden there.
    this.beacon.place(target && Math.hypot(target.x - at.x, target.z - at.z) > target.radius ? target : null);
    this.beacon.update(dt);
    this.hud.setMoney(this.missions.balance, this.missions.stagesDone, this.missions.stageCount);
    this.hud.setMission(
      mission && objective
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
      .map((v) => ({ x: v.body.position().x, z: v.body.position().z, color: v.kind === "auto" ? "#f5c400" : v.kind === "bike" ? "#5aa9ff" : "#e9eef5", size: 3.5 }));
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
    }
    this.population.frame(dt, at);
    this.chunks.update(at.x, at.z);
    this.mapView.follow(this.renderer.camera);
    this.renderer.focusShadows(at.x, at.z);
    this.renderer.render();
    this.hud.setFps(this.loop.fps);
  }
}

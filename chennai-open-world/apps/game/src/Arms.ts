/**
 * The game side of weapons and gangs: weapons lying in the world (drawn, and taken by walking
 * over them), the gang crews put on their corners near the player, the courier of a chase stage,
 * mission weapon rewards, the weapon button, and saving the arsenal. The rules are in
 * `@cow/combat` (Weapons, Gangs, Pickups); this connects them to the scene and the HUD.
 */
import * as THREE from "three";
import { GANG_RULES, WEAPONS, WeaponPickups, crewsToField, type Combat, type CombatEvent, type WeaponId } from "@cow/combat";
import type { Mission, QuarryPlace } from "@cow/missions";
import { weaponGeometry, weaponMaterial, type HeldWeapon, type HumanAssets, type HumanFigure } from "@cow/player";
import type { Hud, TouchControls } from "@cow/ui";
import { TrafficCar, type VehicleKind } from "@cow/vehicles";
import type { GameContent } from "./content";

const WEAPONS_KEY = "cow-weapons-v1";
/** Pickups further away than this are not drawn (metres). */
const PICKUP_DRAW = 120;
/** Crews are kept off corners this close to the current objective: the stage has its own people there. */
const STAGE_CLEAR = 150;

/** What tests and the debug console can read about weapons and gangs. */
export interface ArmsSnapshot {
  /** The gun in hand, the weapons owned and the rounds for each gun. */
  readonly weapon: WeaponId;
  readonly weapons: WeaponId[];
  readonly weaponAmmo: Partial<Record<WeaponId, number>>;
  /** The weapon shown in the player's hand, or null. */
  readonly inHand: string | null;
  /** Weapons enemies are holding now (one entry per enemy with something in hand). */
  readonly enemyWeapons: string[];
  readonly pickups: Array<{ id: string; weapon: WeaponId; x: number; z: number; available: boolean }>;
  readonly crews: Array<{ id: string; gang: string; x: number; z: number; out: boolean }>;
  /** The quarry of a chase stage, or null. */
  readonly quarry: { x: number; z: number } | null;
}

const isHeld = (id: WeaponId): id is HeldWeapon => id !== "fists";

export class Arms {
  readonly pickups: WeaponPickups;
  private readonly pickupViews = new Map<string, THREE.Group>();
  private readonly out = new Set<string>();
  private readonly regrouping = new Map<string, number>();
  private courier: { car: TrafficCar; kind: VehicleKind } | null = null;
  private spin = 0;
  /** Seconds the bat stays in hand after a swing, when a gun is usually shown. */
  private swingFor = 0;

  constructor(
    private readonly content: GameContent,
    private readonly combat: Combat,
    private readonly scene: THREE.Object3D,
    private readonly humans: HumanAssets,
    private readonly hud: Hud,
    private readonly controls: TouchControls,
  ) {
    this.pickups = new WeaponPickups(content.pickups);
    this.load();
    // A glowing ring on the ground and the weapon turning above it; shared by every pickup.
    const ringGeometry = new THREE.RingGeometry(0.55, 0.8, 24).rotateX(-Math.PI / 2);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x58e0ff, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    for (const spot of content.pickups) {
      const group = new THREE.Group();
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.position.y = 0.06;
      const weapon = new THREE.Mesh(weaponGeometry(isHeld(spot.weapon) ? spot.weapon : "pistol"), weaponMaterial());
      weapon.name = "pickup-weapon";
      weapon.position.y = 0.85;
      weapon.scale.setScalar(1.4);
      group.add(ring, weapon);
      group.position.set(spot.x, 0, spot.z);
      group.visible = false;
      scene.add(group);
      this.pickupViews.set(spot.id, group);
    }
  }

  // Saving ------------------------------------------------------------------------------

  private load(): void {
    try {
      this.combat.arsenal.load(JSON.parse(localStorage.getItem(WEAPONS_KEY) ?? "null"));
    } catch {
      // A missing or damaged save: fists and an empty pistol.
      this.combat.arsenal.reset();
    }
  }

  save(): void {
    try {
      localStorage.setItem(WEAPONS_KEY, JSON.stringify(this.combat.arsenal.save()));
    } catch {
      // Storage unavailable (private mode): the game plays on without saving.
    }
  }

  /** New game: fists and an empty pistol, every pickup back, no crews out. */
  reset(): void {
    this.combat.arsenal.reset();
    this.pickups.reset();
    this.out.clear();
    this.regrouping.clear();
    this.save();
  }

  // Each step ---------------------------------------------------------------------------

  /** The weapon button: take the next gun. */
  switchWeapon(): void {
    const gun = this.combat.arsenal.cycle();
    this.hud.showToast(WEAPONS[gun].name, `${this.combat.arsenal.ammoOf(gun)} rounds`, 1.2);
    this.save();
  }

  /**
   * Put crews on their corners near the player and take far ones away; pick up weapons walked
   * over. Returns the crew groups now on the street (the combat step keeps these).
   * @param objective where the current stage objective is, or null; crews near it stay off
   */
  fixedUpdate(dt: number, at: { x: number; z: number }, onFoot: boolean, objective: { x: number; z: number } | null): string[] {
    for (const [id, left] of this.regrouping) {
      if (left - dt <= 0) this.regrouping.delete(id);
      else this.regrouping.set(id, left - dt);
    }
    // A crew the combat rules removed (the player was knocked out, a new game) is no longer out.
    for (const id of this.out) if (!this.combat.enemies.some((e) => e.group === id)) this.out.delete(id);
    const blocked = new Set(this.regrouping.keys());
    if (objective) for (const crew of this.content.crews) if (Math.hypot(crew.x - objective.x, crew.z - objective.z) < STAGE_CLEAR) blocked.add(crew.id);
    const wanted = new Set(crewsToField(this.content.crews, at.x, at.z, this.out, blocked));
    for (const id of this.out) {
      if (wanted.has(id)) continue;
      this.combat.removeGroup(id);
      this.out.delete(id);
    }
    for (const crew of this.content.crews) {
      if (!wanted.has(crew.id) || this.out.has(crew.id)) continue;
      this.combat.removeGroup(crew.id);
      this.combat.spawnGroup(crew.id, crew.members);
      this.out.add(crew.id);
    }

    for (const spot of this.pickups.update(dt, at.x, at.z, onFoot)) {
      const added = this.combat.arsenal.give(spot.weapon, spot.ammo);
      const weapon = WEAPONS[spot.weapon];
      // A new gun goes straight into the hand.
      if (weapon.kind === "gun") this.combat.arsenal.select(spot.weapon);
      this.hud.showToast(`Picked up: ${weapon.name}`, weapon.kind === "gun" ? `+${added} rounds · ${this.combat.arsenal.ammoOf(spot.weapon)} carried` : "HIT swings it", 2.5);
      this.save();
    }
    this.swingFor = Math.max(0, this.swingFor - dt);
    return [...this.out];
  }

  /** The player swung or punched (the bat is shown for a moment). */
  swung(): void {
    if (this.combat.arsenal.has("bat")) this.swingFor = 0.5;
  }

  /** React to combat: beaten crews regroup; warnings and provocations get a message. */
  handle(events: readonly CombatEvent[]): void {
    for (const event of events) {
      const crew = "group" in event ? this.content.crews.find((c) => c.id === event.group) : undefined;
      if (!crew) continue;
      const gang = this.content.gangs.find((g) => g.id === crew.gang);
      const name = gang?.name ?? "The gang";
      if (event.type === "groupCleared") {
        this.out.delete(crew.id);
        this.regrouping.set(crew.id, GANG_RULES.regroupTime);
        this.hud.showToast(`${name} crew beaten`, "Their corner is quiet for now.", 3);
      } else if (event.type === "crewWarning") {
        this.hud.showToast(`${name} turf`, "They don't like your weapon on their corner. Move on.", 2.6);
      } else if (event.type === "crewProvoked") {
        this.hud.showToast(`${name} are after you`, gang ? `${gang.meaning} of ${gang.district}` : "", 2.6);
      }
    }
  }

  /** A stage finished: hand over its weapons. Returns a line for the message (" · Shotgun +14"), or "". */
  reward(mission: Mission): string {
    if (!mission.weapons?.length) return "";
    const lines: string[] = [];
    for (const { id, ammo } of mission.weapons) {
      if (!(id in WEAPONS)) continue;
      const weapon = id as WeaponId;
      this.combat.arsenal.give(weapon, ammo);
      if (WEAPONS[weapon].kind === "gun") this.combat.arsenal.select(weapon);
      lines.push(`${WEAPONS[weapon].name}${ammo ? ` +${ammo}` : ""}`);
    }
    this.save();
    return lines.length ? ` · ${lines.join(" · ")}` : "";
  }

  /** The weapon to show in the player's hand: the bat just after a swing, the gun in hand when loaded, else the bat if owned. */
  private shown(): HeldWeapon | null {
    const arsenal = this.combat.arsenal;
    const gun = arsenal.gun.id;
    if (this.swingFor > 0) return "bat";
    if (isHeld(gun) && arsenal.ammoOf(gun) > 0) return gun;
    return arsenal.has("bat") ? "bat" : null;
  }

  /** True when the player has a weapon in hand (gang members don't like that). */
  armed(): boolean {
    return this.shown() !== null;
  }

  // Each frame --------------------------------------------------------------------------

  frame(dt: number, at: { x: number; z: number }, avatar: HumanFigure, onFoot: boolean, quarry: (QuarryPlace & { kind: VehicleKind }) | null): void {
    const arsenal = this.combat.arsenal;
    const gun = arsenal.gun;
    this.controls.setWeapon(gun.name, arsenal.ammoOf(gun.id));
    this.controls.setAmmo(arsenal.ammoOf(gun.id));
    const shown = onFoot ? this.shown() : null;
    avatar.setWeapon(shown, true);

    this.spin += dt;
    for (const spot of this.content.pickups) {
      const view = this.pickupViews.get(spot.id);
      if (!view) continue;
      view.visible = this.pickups.available(spot.id) && Math.hypot(spot.x - at.x, spot.z - at.z) < PICKUP_DRAW;
      const weapon = view.children[1];
      if (view.visible && weapon) {
        weapon.rotation.y = this.spin * 1.6;
        weapon.position.y = 0.85 + Math.sin(this.spin * 2.4) * 0.08;
      }
    }

    // The courier: a gang rider on a motorbike, drawn only during a chase.
    if (quarry && (!this.courier || this.courier.kind !== quarry.kind)) {
      if (this.courier) this.scene.remove(this.courier.car.object);
      const car = new TrafficCar(quarry.kind, 0x2b2b30);
      const gang = this.content.gangs[0];
      car.setDriver(this.humans.seatedStatic(gang?.colour ?? 0xe0b020, car.type.pose));
      this.scene.add(car.object);
      this.courier = { car, kind: quarry.kind };
    }
    if (this.courier) {
      this.courier.car.object.visible = quarry !== null;
      if (quarry) this.courier.car.sync(dt, quarry.x, quarry.z, quarry.heading, 10, 0);
    }
  }

  snapshot(avatar: HumanFigure, enemyWeapons: string[], quarry: { x: number; z: number } | null): ArmsSnapshot {
    const arsenal = this.combat.arsenal;
    const weaponAmmo: Partial<Record<WeaponId, number>> = {};
    for (const id of arsenal.guns()) weaponAmmo[id] = arsenal.ammoOf(id);
    return {
      weapon: arsenal.gun.id,
      weapons: (Object.keys(WEAPONS) as WeaponId[]).filter((id) => arsenal.has(id)),
      weaponAmmo,
      inHand: avatar.shownWeapon,
      enemyWeapons,
      pickups: this.content.pickups.map((p) => ({ id: p.id, weapon: p.weapon, x: p.x, z: p.z, available: this.pickups.available(p.id) })),
      crews: this.content.crews.map((c) => ({ id: c.id, gang: c.gang, x: c.x, z: c.z, out: this.out.has(c.id) })),
      quarry: quarry ? { x: quarry.x, z: quarry.z } : null,
    };
  }
}

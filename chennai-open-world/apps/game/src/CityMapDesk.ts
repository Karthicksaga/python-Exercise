/**
 * The full-screen city map in the game: opened by tapping the minimap, it holds the game (like
 * the job board: the simulation stops, the controls hide) and lets it run again when closed.
 * What the map shows comes from the host as it is at the moment it opens; the world doesn't
 * move while the map is up, so nothing has to be fed to it afterwards.
 *
 * Android Back closes it: the shell is told the map is open and sends "back" instead of
 * pausing (see `apps/mobile/src/GameScreen.tsx`).
 */
import type { WorldMap } from "@cow/game-world";
import type { RailFile } from "@cow/rail";
import { CityMap, type CityMapMarker, type CityMapOpen, type CityMapPlayer, type CityMapState, type MinimapMarker } from "@cow/ui";
import { sendToShell } from "./nativeBridge";

export interface CityMapHost {
  /** Stop and restart the game (the same hold the job board uses). */
  hold(): void;
  release(): void;
  /** False while the game can't open a menu (paused, or another menu holds it). */
  canOpen(): boolean;
  player(): CityMapPlayer;
  target(): { x: number; z: number } | null;
  vehicles(): Array<{ x: number; z: number; kind: string; color: string }>;
  /** Places and job marks, as the minimap gets them. */
  markers(): MinimapMarker[];
  route(): ReadonlyArray<{ readonly x: number; readonly z: number }> | null;
  buildings(): NonNullable<CityMapOpen["buildings"]>;
  district(): string;
  street(): string;
}

export class CityMapDesk {
  private readonly map: CityMap;

  constructor(parent: HTMLElement, world: WorldMap, private readonly host: CityMapHost) {
    this.map = new CityMap(parent, world, () => {
      sendToShell({ type: "cityMap", open: false });
      this.host.release();
    });
  }

  /** The railway's main-line tracks and its stations (when the rail file loaded). */
  setRail(file: RailFile): void {
    const tracks = file.tracks
      .filter((t) => t.kind === "main")
      .map((t) => {
        const points: Array<{ x: number; z: number }> = [];
        for (let i = 0; i + 1 < t.points.length; i += 2) points.push({ x: t.points[i]!, z: t.points[i + 1]! });
        return { points };
      });
    this.map.setRail({ tracks, stations: file.stations });
  }

  get isOpen(): boolean {
    return this.map.isOpen;
  }

  open(): void {
    if (this.map.isOpen || !this.host.canOpen()) return;
    this.host.hold();
    const markers: CityMapMarker[] = this.host.vehicles().map((v) => ({ kind: "vehicle", x: v.x, z: v.z, vehicle: v.kind, color: v.color }));
    for (const m of this.host.markers()) markers.push(m.icon ? { kind: "place", x: m.x, z: m.z, icon: m.icon } : { kind: "dot", x: m.x, z: m.z, color: m.color });
    const target = this.host.target();
    if (target) markers.push({ kind: "target", x: target.x, z: target.z });
    this.map.open({
      player: this.host.player(),
      markers,
      route: this.host.route(),
      buildings: this.host.buildings(),
      district: this.host.district(),
      street: this.host.street(),
    });
    sendToShell({ type: "cityMap", open: true });
  }

  /** Close without asking (the game is being paused, or Back was pressed). */
  close(): void {
    this.map.close();
  }

  state(): CityMapState {
    return this.map.state();
  }
}

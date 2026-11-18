/**
 * The live parts of the station the player is at: the departure board's screen (amber LED
 * lettering on black, redrawn when its text changes) and the clock's hands. Only one station is
 * live at a time, so this is one small texture and two draw calls wherever the player is; the
 * other stations show the board's dark housing and a clock face (`StationKit`).
 */
import type { StationPlatform } from "@cow/rail";
import * as THREE from "three";
import { MeshBuilder } from "./MeshBuilder";
import { CLOCK_AT, DEPARTURE_BOARD_AT, DEPARTURE_BOARD_H, DEPARTURE_BOARD_W, atlasBoard, hangingBoard } from "./StationKit";

const SCREEN_W = 512;
const SCREEN_H = 212;

export class StationLife {
  readonly object = new THREE.Group();
  private readonly canvas: HTMLCanvasElement | null;
  private readonly texture: THREE.CanvasTexture | null;
  private readonly screen: THREE.Mesh | null;
  private readonly hands: THREE.InstancedMesh;
  private text = "";
  private platform: StationPlatform | null = null;
  private readonly matrix = new THREE.Matrix4();

  constructor() {
    this.object.name = "station-life";
    if (typeof document !== "undefined") {
      this.canvas = document.createElement("canvas");
      this.canvas.width = SCREEN_W;
      this.canvas.height = SCREEN_H;
      this.texture = new THREE.CanvasTexture(this.canvas);
      this.texture.colorSpace = THREE.SRGBColorSpace;
      this.texture.anisotropy = 4;
      const b = new MeshBuilder();
      atlasBoard(b, 0, 0, 0, 1, 0, DEPARTURE_BOARD_W / 2, DEPARTURE_BOARD_H / 2, 1, 0, 0);
      // The LEDs glow: unlit, so the board reads at night too.
      this.screen = new THREE.Mesh(b.build()!, new THREE.MeshBasicMaterial({ map: this.texture, side: THREE.DoubleSide, toneMapped: false }));
      this.screen.name = "departure-board";
      this.screen.visible = false;
      this.object.add(this.screen);
    } else {
      this.canvas = null;
      this.texture = null;
      this.screen = null;
    }
    // Hour and minute hands on each face of the clock.
    const hand = new THREE.BoxGeometry(0.035, 1, 0.012);
    hand.translate(0, 0.5, 0);
    this.hands = new THREE.InstancedMesh(hand, new THREE.MeshBasicMaterial({ color: 0x111111 }), 4);
    this.hands.count = 0;
    this.hands.frustumCulled = false;
    this.hands.name = "clock-hands";
    this.object.add(this.hands);
  }

  /** The board's current lines (for tests and the debug snapshot). */
  get lines(): string[] {
    return this.text ? this.text.split("\n") : [];
  }

  get station(): string | null {
    return this.platform?.station.name ?? null;
  }

  /**
   * Show the board and clock at `platform` (or nowhere), with these lines: a header, then trains.
   * @param hour time of day for the clock, 0–24
   */
  show(platform: StationPlatform | null, lines: readonly string[], hour: number): void {
    this.platform = platform;
    if (!platform) {
      if (this.screen) this.screen.visible = false;
      this.hands.count = 0;
      this.text = "";
      return;
    }
    const at = hangingBoard(platform, DEPARTURE_BOARD_AT);
    if (this.screen) {
      this.screen.visible = true;
      this.screen.position.set(at.x, at.y, at.z);
      this.screen.rotation.set(0, at.yaw, 0);
      // The housing is 0.14 m deep: the screen faces sit just outside it.
      this.screen.scale.set(1, 1, 4.2);
    }
    const text = lines.join("\n");
    if (text !== this.text) {
      this.text = text;
      this.draw(lines);
    }
    this.placeHands(platform, hour);
  }

  private draw(lines: readonly string[]): void {
    const g = this.canvas?.getContext("2d");
    if (!g || !this.texture) return;
    g.fillStyle = "#050505";
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    g.textBaseline = "middle";
    const rowH = SCREEN_H / Math.max(4, lines.length);
    lines.forEach((line, i) => {
      const y = rowH * (i + 0.5);
      g.fillStyle = i === 0 ? "#ff5a36" : line.includes("ON PLATFORM") || line.includes("ARRIVING") ? "#7dff6a" : "#ffb02e";
      let px = i === 0 ? 34 : 38;
      g.font = `700 ${px}px "Courier New",monospace`;
      while (px > 14 && g.measureText(line).width > SCREEN_W - 24) {
        px -= 2;
        g.font = `700 ${px}px "Courier New",monospace`;
      }
      g.textAlign = "left";
      g.fillText(line, 12, y);
      if (i === 0) {
        g.fillStyle = "#3a1208";
        g.fillRect(0, rowH - 2, SCREEN_W, 3);
      }
    });
    this.texture.needsUpdate = true;
  }

  private placeHands(platform: StationPlatform, hour: number): void {
    const at = hangingBoard(platform, CLOCK_AT);
    const right = new THREE.Vector3(at.rx, 0, at.rz);
    const up = new THREE.Vector3(0, 1, 0);
    // The face's normal (as `atlasBoard` faces it), and the hands' angles (clockwise from 12).
    const normal = new THREE.Vector3(at.rz, 0, -at.rx);
    const h = ((hour % 24) + 24) % 24;
    const minute = ((h * 60) % 60) / 60;
    const hands: Array<[number, number, number]> = [
      [(h % 12) / 12 + minute / 12, 0.19, 0.012],
      [minute, 0.3, 0.02],
    ];
    let k = 0;
    for (const facing of [1, -1]) {
      // Seen from this face, its right is the board's along-direction turned by the facing.
      const r = right.clone().multiplyScalar(facing);
      const n = normal.clone().multiplyScalar(facing);
      for (const [turn, length, lift] of hands) {
        const a = turn * Math.PI * 2;
        const dir = up.clone().multiplyScalar(Math.cos(a)).addScaledVector(r, Math.sin(a));
        const perp = r.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, -Math.sin(a));
        this.matrix.makeBasis(perp, dir.clone().multiplyScalar(length), n);
        this.matrix.setPosition(at.x + n.x * (0.03 + lift), at.y, at.z + n.z * (0.03 + lift));
        this.hands.setMatrixAt(k++, this.matrix);
      }
    }
    this.hands.count = k;
    this.hands.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.texture?.dispose();
    if (this.screen) {
      this.screen.geometry.dispose();
      (this.screen.material as THREE.Material).dispose();
    }
    this.hands.geometry.dispose();
    (this.hands.material as THREE.Material).dispose();
  }
}

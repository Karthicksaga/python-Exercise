/**
 * Where a blow lands: a quick pale flash and a small puff of dust that spreads and fades, at the
 * point of contact. Non-graphic on purpose (no blood), like the rest of the game's fighting.
 * A small pool of sprites sharing one generated texture: nothing to download, and nothing drawn
 * while no blow is landing.
 */
import * as THREE from "three";

/** Seconds a flash and a puff of dust last. */
const FLASH_TIME = 0.12;
const DUST_TIME = 0.4;
/** At most this many blows show at once; the oldest is reused. */
const POOL = 6;

interface Puff {
  readonly flash: THREE.Sprite;
  readonly dust: THREE.Sprite;
  age: number;
  size: number;
}

/** A soft round spot, white in the middle, fading to clear (one 64 px texture for every puff). */
function spotTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d");
  if (g) {
    const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.45, "rgba(255,255,255,0.55)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gradient;
    g.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class HitPuffs {
  private readonly puffs: Puff[] = [];
  private next = 0;

  constructor(scene: THREE.Object3D) {
    const texture = spotTexture();
    for (let i = 0; i < POOL; i++) {
      const sprite = (color: number, blending: THREE.Blending) => {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, color, transparent: true, depthWrite: false, blending, fog: false }));
        s.visible = false;
        s.renderOrder = 2;
        scene.add(s);
        return s;
      };
      this.puffs.push({ flash: sprite(0xfff1c8, THREE.AdditiveBlending), dust: sprite(0xc9b79a, THREE.NormalBlending), age: Infinity, size: 1 });
    }
  }

  /**
   * A blow lands at this point (world, metres).
   * @param size 1 a punch; more for a bat, less for a bullet
   */
  hit(x: number, y: number, z: number, size = 1): void {
    const puff = this.puffs[this.next]!;
    this.next = (this.next + 1) % this.puffs.length;
    puff.age = 0;
    puff.size = size;
    puff.flash.position.set(x, y, z);
    puff.dust.position.set(x, y, z);
    puff.flash.visible = puff.dust.visible = true;
    this.place(puff);
  }

  /** Once per rendered frame. */
  frame(dt: number): void {
    for (const puff of this.puffs) {
      if (puff.age === Infinity) continue;
      puff.age += dt;
      if (puff.age >= DUST_TIME) {
        puff.age = Infinity;
        puff.flash.visible = puff.dust.visible = false;
        continue;
      }
      this.place(puff);
    }
  }

  /** How many blows are showing (tests and debugging). */
  get showing(): number {
    return this.puffs.filter((p) => p.age !== Infinity).length;
  }

  private place(puff: Puff): void {
    const flash = Math.min(1, puff.age / FLASH_TIME);
    puff.flash.visible = flash < 1;
    puff.flash.scale.setScalar((0.18 + 0.32 * flash) * puff.size);
    (puff.flash.material as THREE.SpriteMaterial).opacity = 0.9 * (1 - flash);
    const dust = puff.age / DUST_TIME;
    puff.dust.scale.setScalar((0.22 + 0.55 * Math.sqrt(dust)) * puff.size);
    puff.dust.position.y = puff.flash.position.y + 0.15 * dust * puff.size;
    (puff.dust.material as THREE.SpriteMaterial).opacity = 0.55 * (1 - dust) * (1 - dust);
  }
}

/**
 * Markers at the entrances of places the player can go into: a soft ring on the pavement and
 * the place's badge floating above it, turned to face the camera. There are only a handful of
 * places, so each is a ring and a sprite; the ring geometry and material are shared.
 */
import * as THREE from "three";

export interface PlaceMarkerSpec {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  /** The badge drawn on a canvas (the game uses the UI's place icons). */
  readonly icon: HTMLCanvasElement;
  /** Ring colour. */
  readonly color: number;
}

export class PlaceMarkers {
  readonly object = new THREE.Group();
  private readonly badges: THREE.Sprite[] = [];
  private time = 0;

  constructor(places: readonly PlaceMarkerSpec[]) {
    const ring = new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2);
    for (const place of places) {
      const ringMaterial = new THREE.MeshBasicMaterial({ color: place.color, transparent: true, opacity: 0.75, depthWrite: false });
      const mesh = new THREE.Mesh(ring, ringMaterial);
      mesh.scale.set(place.radius, 1, place.radius);
      mesh.position.set(place.x, 0.08, place.z);
      const texture = new THREE.CanvasTexture(place.icon);
      texture.colorSpace = THREE.SRGBColorSpace;
      const badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
      badge.scale.setScalar(1.1);
      badge.position.set(place.x, 2.6, place.z);
      this.badges.push(badge);
      this.object.add(mesh, badge);
    }
  }

  /** A gentle bob, so the badges catch the eye. */
  update(dt: number): void {
    this.time += dt;
    const lift = 2.6 + Math.sin(this.time * 2) * 0.12;
    for (const badge of this.badges) badge.position.y = lift;
  }
}

/** A glowing column of light marking where the player has to go. Visible from far away. */
import * as THREE from "three";

export class Beacon {
  readonly object = new THREE.Group();
  private readonly column: THREE.Mesh;
  private readonly ring: THREE.Mesh;
  private time = 0;

  constructor(color = 0xffc933) {
    const glow = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.column = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 40, 20, 1, true), glow);
    this.column.position.y = 20;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
    this.ring.position.y = 0.12;
    this.object.add(this.column, this.ring);
    this.object.visible = false;
    this.object.renderOrder = 5;
  }

  /** Show the beacon at a place with the given radius, or hide it with null. */
  place(target: { x: number; z: number; radius: number } | null): void {
    this.object.visible = target !== null;
    if (!target) return;
    this.object.position.set(target.x, 0, target.z);
    this.column.scale.set(target.radius, 1, target.radius);
    this.ring.scale.set(target.radius, 1, target.radius);
  }

  update(dt: number): void {
    if (!this.object.visible) return;
    this.time += dt;
    (this.column.material as THREE.MeshBasicMaterial).opacity = 0.22 + Math.sin(this.time * 3) * 0.08;
  }
}

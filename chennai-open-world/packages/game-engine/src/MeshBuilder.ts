/**
 * Collects triangles from many small shapes into one geometry, so a whole chunk of buildings
 * or every road in the map is a single draw call.
 */
import * as THREE from "three";

export class MeshBuilder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly uvs: number[] = [];
  private readonly colors: number[] = [];
  private readonly indices: number[] = [];
  /** Optional extra vec3 per vertex (see `setExtra`), only for builders made with an attribute name. */
  private readonly extras: number[] = [];
  private extra: readonly [number, number, number] = [0, 0, 0];

  /** @param extraName name of an extra vec3 attribute that `setExtra` fills (e.g. shutter timing) */
  constructor(private readonly extraName?: string) {}

  /** Extra attribute value for the vertices added from now on (needs `extraName`). */
  setExtra(a: number, b: number, c: number): void {
    this.extra = [a, b, c];
  }

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  /** Add a vertex and return its index. Colour components are linear 0..1. */
  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, r = 1, g = 1, b = 1): number {
    this.positions.push(x, y, z);
    this.normals.push(nx, ny, nz);
    this.uvs.push(u, v);
    this.colors.push(r, g, b);
    if (this.extraName) this.extras.push(this.extra[0], this.extra[1], this.extra[2]);
    return this.positions.length / 3 - 1;
  }

  triangle(a: number, b: number, c: number): void {
    this.indices.push(a, b, c);
  }

  /** Two triangles a-b-c and a-c-d. */
  quad(a: number, b: number, c: number, d: number): void {
    this.indices.push(a, b, c, a, c, d);
  }

  /** Returns null when nothing was added. */
  build(): THREE.BufferGeometry | null {
    if (this.indices.length === 0) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    if (this.extraName) geometry.setAttribute(this.extraName, new THREE.Float32BufferAttribute(this.extras, 3));
    geometry.setIndex(this.indices);
    geometry.computeBoundingSphere();
    return geometry;
  }
}

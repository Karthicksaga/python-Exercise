/** Stable pseudo-random number in [0, 1) so a building looks the same every time it loads. */
export function hash(id: number, salt: number): number {
  let t = (id ^ Math.imul(salt + 1, 0x9e3779b9)) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
  t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
  return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
}

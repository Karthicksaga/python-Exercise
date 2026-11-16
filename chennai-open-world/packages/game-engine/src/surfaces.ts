/**
 * Photographed surface textures (Poly Haven scans, CC0; `scripts/build-textures.mjs`). The app
 * embeds the WebP files with `?inline` (TD-3) and hands their URLs to `loadSurfaces`, which
 * decodes them once at start-up; every chunk then shares the same textures.
 */
import * as THREE from "three";

export type SurfaceName = "asphalt" | "paving" | "earth" | "sand" | "grass" | "plaster" | "roof";

/** URLs (data URLs when embedded) of one surface's colour and, optionally, normal map. */
export interface SurfaceSource {
  readonly albedo: string;
  readonly normal?: string;
}

/** A decoded surface: its colour image (also drawn into canvases) and GPU textures. */
export interface Surface {
  readonly image: HTMLImageElement;
  readonly map: THREE.Texture;
  /** Absent when the source has none, or on tiers that skip normal maps. */
  readonly normalMap?: THREE.Texture;
}

export type Surfaces = Readonly<Record<SurfaceName, Surface>>;

async function decode(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

function texture(image: HTMLImageElement, color: boolean): THREE.Texture {
  const result = new THREE.Texture(image);
  result.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  result.wrapS = result.wrapT = THREE.RepeatWrapping;
  result.anisotropy = 4;
  result.needsUpdate = true;
  return result;
}

/**
 * Decode every surface. `normals: false` (the lite tier) skips the normal maps: less memory,
 * a cheaper shader, and the colour photos alone still carry most of the look.
 */
export async function loadSurfaces(sources: Readonly<Record<SurfaceName, SurfaceSource>>, normals: boolean): Promise<Surfaces> {
  const entries = await Promise.all(
    (Object.keys(sources) as SurfaceName[]).map(async (name): Promise<[SurfaceName, Surface]> => {
      const source = sources[name];
      const [image, normal] = await Promise.all([decode(source.albedo), normals && source.normal ? decode(source.normal) : undefined]);
      return [name, { image, map: texture(image, true), ...(normal ? { normalMap: texture(normal, false) } : {}) }];
    }),
  );
  return Object.fromEntries(entries) as Record<SurfaceName, Surface>;
}

/**
 * A surface's textures for one material, repeated `repeat` times per UV unit. Each material
 * gets its own clone (sharing the image and its GPU upload) so repeats can differ.
 */
export function surfaceMaps(surface: Surface, repeat: number): { map: THREE.Texture; normalMap: THREE.Texture | null } {
  const map = surface.map.clone();
  map.repeat.setScalar(repeat);
  const normalMap = surface.normalMap ? surface.normalMap.clone() : null;
  normalMap?.repeat.setScalar(repeat);
  return { map, normalMap };
}

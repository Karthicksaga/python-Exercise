/**
 * The photographed surface textures, embedded in the script as data URLs (TD-3). Made from
 * Poly Haven scans (CC0) by `npm run build:textures`; sources in `assets/textures/sources.json`
 * and `assets/README.md`.
 */
import type { SurfaceName, SurfaceSource } from "@cow/game-engine";
import asphaltAlbedo from "../../../assets/textures/asphalt-albedo.webp?inline";
import asphaltNormal from "../../../assets/textures/asphalt-normal.webp?inline";
import pavingAlbedo from "../../../assets/textures/paving-albedo.webp?inline";
import pavingNormal from "../../../assets/textures/paving-normal.webp?inline";
import earthAlbedo from "../../../assets/textures/earth-albedo.webp?inline";
import sandAlbedo from "../../../assets/textures/sand-albedo.webp?inline";
import grassAlbedo from "../../../assets/textures/grass-albedo.webp?inline";
import plasterAlbedo from "../../../assets/textures/plaster-albedo.webp?inline";
import roofAlbedo from "../../../assets/textures/roof-albedo.webp?inline";
import roofNormal from "../../../assets/textures/roof-normal.webp?inline";

export const SURFACE_SOURCES: Readonly<Record<SurfaceName, SurfaceSource>> = {
  asphalt: { albedo: asphaltAlbedo, normal: asphaltNormal },
  paving: { albedo: pavingAlbedo, normal: pavingNormal },
  earth: { albedo: earthAlbedo },
  sand: { albedo: sandAlbedo },
  grass: { albedo: grassAlbedo },
  plaster: { albedo: plasterAlbedo },
  roof: { albedo: roofAlbedo, normal: roofNormal },
};

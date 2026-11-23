/**
 * Test helper: load the optimised Blender vehicle models (both levels of detail) the way the game
 * does (`apps/game/src/vehicleFiles.ts`), from the files on disk. Node only.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadVehicleModels } from "./glbModels";
import { groundBelow, type VehicleKind } from "./specs";

const FILES: Readonly<Record<VehicleKind, string>> = { car: "hatchback", auto: "auto_rickshaw", bike: "motorbike", ambulance: "ambulance", bus: "bus" };

const dataUrl = (name: string) => `data:model/gltf-binary;base64,${readFileSync(fileURLToPath(new URL(`../../../assets/optimized/vehicles/${name}.glb`, import.meta.url))).toString("base64")}`;

let loaded: Promise<void> | null = null;

/** Load every vehicle model once (later calls wait for the first). */
export function loadTestVehicleModels(): Promise<void> {
  loaded ??= loadVehicleModels(
    Object.fromEntries(
      (Object.keys(FILES) as VehicleKind[]).flatMap((kind) => [
        [kind, { url: dataUrl(FILES[kind]), ground: groundBelow(kind) }],
        [`${kind}_lod1`, { url: dataUrl(`${FILES[kind]}_lod1`), ground: groundBelow(kind) }],
      ]),
    ),
  );
  return loaded;
}

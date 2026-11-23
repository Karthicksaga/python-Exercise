/**
 * The vehicle models made in Blender (`tools/blender/vehicles.py`, `auto_rickshaw.py`; optimised
 * by `npm run optimize:assets`), embedded in the game script (TD-3). Each kind has a detailed model
 * (the player's and parked vehicles) and a light one, `<kind>_lod1` (traffic and police cars).
 * Each stands on the ground the physics parks it on (`groundBelow`).
 */
import { groundBelow, type VehicleKind } from "@cow/vehicles";
import ambulance from "../../../assets/optimized/vehicles/ambulance.glb?inline";
import ambulanceLod1 from "../../../assets/optimized/vehicles/ambulance_lod1.glb?inline";
import auto from "../../../assets/optimized/vehicles/auto_rickshaw.glb?inline";
import autoLod1 from "../../../assets/optimized/vehicles/auto_rickshaw_lod1.glb?inline";
import bus from "../../../assets/optimized/vehicles/bus.glb?inline";
import busLod1 from "../../../assets/optimized/vehicles/bus_lod1.glb?inline";
import hatchback from "../../../assets/optimized/vehicles/hatchback.glb?inline";
import hatchbackLod1 from "../../../assets/optimized/vehicles/hatchback_lod1.glb?inline";
import motorbike from "../../../assets/optimized/vehicles/motorbike.glb?inline";
import motorbikeLod1 from "../../../assets/optimized/vehicles/motorbike_lod1.glb?inline";

const FILES: Readonly<Record<VehicleKind, readonly [near: string, far: string]>> = {
  car: [hatchback, hatchbackLod1],
  auto: [auto, autoLod1],
  bike: [motorbike, motorbikeLod1],
  ambulance: [ambulance, ambulanceLod1],
  bus: [bus, busLod1],
};

/** `loadVehicleModels` sources: `<kind>` detailed, `<kind>_lod1` light. */
export const VEHICLE_MODEL_FILES: Readonly<Record<string, { readonly url: string; readonly ground: number }>> = Object.fromEntries(
  (Object.keys(FILES) as VehicleKind[]).flatMap((kind) => [
    [kind, { url: FILES[kind][0], ground: groundBelow(kind) }],
    [`${kind}_lod1`, { url: FILES[kind][1], ground: groundBelow(kind) }],
  ]),
);

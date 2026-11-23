/**
 * Riding poses on the real character model: for every vehicle kind the hands land on the grips
 * or the steering wheel and the feet on the footboard, pegs or pedals, and nothing sticks out
 * of a closed cabin.
 */
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";
import { HumanFigure, normalizeBoneNames, PLAYER_HEIGHT, sitWeight } from "@cow/player";
import { VEHICLE_TYPES, type VehicleKind } from "@cow/vehicles";

/** The optimised character, without its textures (Node has no image decoder). */
async function loadCharacter(): Promise<THREE.Object3D> {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  const doc = await io.read(fileURLToPath(new URL("../../../assets/optimized/player.glb", import.meta.url)));
  for (const texture of doc.getRoot().listTextures()) texture.dispose();
  for (const extension of doc.getRoot().listExtensionsUsed()) extension.dispose();
  const glb = await io.writeBinary(doc);
  const buffer = new ArrayBuffer(glb.byteLength);
  new Uint8Array(buffer).set(glb);
  return (await new GLTFLoader().parseAsync(buffer, "")).scene;
}

/** A seated figure the way the game makes one (`HumanAssets.create`): same scale and lift. */
async function seatedFigure(): Promise<HumanFigure> {
  const model = await loadCharacter();
  // As the game loads it (HumanFigure.ts `measure`): bone names without the `mixamorig:` prefix,
  // and a rig without head-top and toe-end bones (MPFB's) measured on its meshes.
  normalizeBoneNames(model);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model, true);
  const end = (name: string) => model.getObjectByName(name)?.getWorldPosition(new THREE.Vector3()).y;
  const top = end("HeadTop_End");
  const toes = end("LeftToe_End");
  const low = top !== undefined && toes !== undefined ? toes : box.min.y;
  const scale = PLAYER_HEIGHT / ((top !== undefined && toes !== undefined ? top : box.max.y) - low);
  const clips = ["idle", "walk", "run"].map((name) => new THREE.AnimationClip(name, 1, []));
  return new HumanFigure(model, clips, scale, -low * scale);
}

/** World position of a bone, or of a palm (60 % from the wrist to the middle knuckle). */
function point(figure: HumanFigure, name: string): THREE.Vector3 {
  const at = (bone: string) => figure.object.getObjectByName(bone)!.getWorldPosition(new THREE.Vector3());
  // Rigs without end bones (MPFB's): the top of the head is the highest point of the posed mesh
  // (hair included), and a fingertip lies one more joint length past the last finger joint.
  if (!figure.object.getObjectByName(name)) {
    if (name === "HeadTop_End") return new THREE.Vector3(0, new THREE.Box3().setFromObject(figure.object, true).max.y, 0);
    const tip = /^(.*)4$/.exec(name);
    if (tip) {
      const last = at(`${tip[1]}3`);
      return last.clone().add(last.clone().sub(at(`${tip[1]}2`)));
    }
  }
  if (name === "LeftPalm" || name === "RightPalm") {
    const hand = name.replace("Palm", "Hand");
    return at(hand).lerp(at(`${hand}Middle1`), 0.6);
  }
  return at(name);
}

const KINDS = Object.keys(VEHICLE_TYPES) as VehicleKind[];

describe("riding poses", async () => {
  const figure = await seatedFigure();
  const posed = (kind: VehicleKind) => {
    const type = VEHICLE_TYPES[kind];
    figure.setSeated(type.pose);
    // Placed as in the game: root at the driver's hip point, in the vehicle's frame.
    figure.object.position.set(type.driver.x, type.driver.y, type.driver.z);
    figure.object.updateMatrixWorld(true);
    return type;
  };

  it.each(KINDS)("%s: hands within 3 cm of the grips or wheel, feet within 3 cm of their rest", (kind) => {
    const { driver, pose } = posed(kind);
    for (const side of [1, -1]) {
      const prefix = side > 0 ? "Right" : "Left";
      const hand = new THREE.Vector3(driver.x + side * pose.hand.x, driver.y + pose.hand.y, driver.z + pose.hand.z);
      const foot = new THREE.Vector3(driver.x + side * pose.foot.x, driver.y + pose.foot.y, driver.z + pose.foot.z);
      expect(point(figure, `${prefix}Palm`).distanceTo(hand), `${kind} ${prefix} hand`).toBeLessThan(0.03);
      expect(point(figure, `${prefix}Foot`).distanceTo(foot), `${kind} ${prefix} foot`).toBeLessThan(0.03);
    }
    // The hips stay on the seat point.
    expect(point(figure, "Hips").distanceTo(new THREE.Vector3(driver.x, driver.y, driver.z))).toBeLessThan(0.01);
  });

  it("puts the auto driver's hands on the Blender model's grips and the feet on its floor", () => {
    // tools/blender/auto_rickshaw.py: grips 0.29–0.38 m out at 0.78 m ahead, 1.15 m up; floor mat
    // top 0.391 m up; the game puts the ground 0.68 m below the chassis centre (+Y forward → -Z).
    posed("auto");
    for (const [name, x] of [["RightPalm", 0.335], ["LeftPalm", -0.335]] as const) {
      expect(point(figure, name).distanceTo(new THREE.Vector3(x, 1.15 - 0.68, -0.78))).toBeLessThan(0.03);
    }
    const floor = 0.391 - 0.68;
    for (const name of ["LeftToeBase", "RightToeBase"]) expect(point(figure, name).y).toBeGreaterThan(floor - 0.02);
    // Head under the canopy: 1.71 m to the top, 14 mm fabric, 1 cm to spare.
    expect(point(figure, "HeadTop_End").y).toBeLessThan(1.71 - 0.014 - 0.68 - 0.01);
  });

  it.each(["auto", "bike"] as const)("%s: the fingers close round the grips instead of lying flat", (kind) => {
    // Grips: a bar across the vehicle through the palm targets (auto: tools/blender/auto_rickshaw.py,
    // 20 mm radius rubber; bike: models.ts). A closed hand keeps every fingertip near the bar's
    // axis; an open, flat hand reaches 8 cm or more past it.
    const { driver, pose } = posed(kind);
    const y = driver.y + pose.hand.y;
    const z = driver.z + pose.hand.z;
    for (const side of ["Left", "Right"]) {
      for (const finger of ["Index", "Middle", "Ring", "Pinky"]) {
        const tip = point(figure, `${side}Hand${finger}4`);
        expect(Math.hypot(tip.y - y, tip.z - z), `${kind} ${side} ${finger} tip from the bar`).toBeLessThan(0.045);
      }
    }
  });

  it("puts the motorbike rider's hands on the grips and feet on the pegs", () => {
    posed("bike");
    for (const [name, x] of [["RightPalm", 0.33], ["LeftPalm", -0.33]] as const) {
      expect(point(figure, name).distanceTo(new THREE.Vector3(x, 0.52, -0.42))).toBeLessThan(0.03);
    }
    // Pegs: a bar 0.5 m wide at y -0.28, z 0.12 (models.ts). Ankles just above and behind.
    for (const name of ["LeftFoot", "RightFoot"]) {
      const ankle = point(figure, name);
      expect(Math.abs(ankle.x)).toBeLessThan(0.25);
      expect(ankle.y - -0.265).toBeGreaterThan(0.05);
      expect(Math.abs(ankle.z - 0.15)).toBeLessThan(0.1);
    }
  });

  it.each(["car", "ambulance", "bus"] as const)("%s: the seated driver stays inside the body", (kind) => {
    const type = posed(kind);
    const half = type.physics.halfExtents;
    // Roof heights above the chassis centre (models.ts): car 0.84, ambulance cab 1.08, bus 1.74.
    const roof = { car: 0.84, ambulance: 1.08, bus: 1.74 }[kind];
    const box = new THREE.Box3();
    figure.object.traverse((node) => {
      if (node instanceof THREE.Bone) box.expandByPoint(node.getWorldPosition(new THREE.Vector3()));
    });
    expect(box.max.y).toBeLessThan(roof - 0.03);
    // Joints are inside the skin; leave 8 cm for flesh and clothes.
    expect(box.max.x).toBeLessThan(half.x - 0.08);
    expect(box.min.x).toBeGreaterThan(-half.x + 0.08);
    expect(box.min.z).toBeGreaterThan(-half.z);
  });

  it("stands up again with the feet at the root", () => {
    figure.setSeated(null);
    figure.object.position.set(0, 0, 0);
    figure.object.updateMatrixWorld(true);
    expect(point(figure, "Hips").y).toBeGreaterThan(0.8);
  });
});

describe("sitting down and standing up (getting in and out)", async () => {
  const figure = await seatedFigure();
  const at = (x: number, y: number, z: number) => {
    figure.object.position.set(x, y, z);
    figure.object.updateMatrixWorld(true);
  };
  figure.sitting(VEHICLE_TYPES.car.pose, 0, 1 / 60);
  at(0, 0, 0);
  const standingHips = point(figure, "Hips").y;

  it("moves the hips in a straight line from standing to the seat as the root moves the same eased share", () => {
    expect(standingHips).toBeGreaterThan(0.8);
    for (const amount of [0.25, 0.5, 0.75]) {
      figure.sitting(VEHICLE_TYPES.car.pose, amount, 1 / 60);
      // Root on the ground at 0 and on the seat's hip point (here also at 0) at 1: the hips drop by the eased share.
      at(0, 0, 0);
      const w = sitWeight(amount);
      expect(point(figure, "Hips").y).toBeCloseTo(standingHips * (1 - w), 2);
    }
  });

  it.each(KINDS)("%s: at the end of sitting down the hands are on the grips or wheel", (kind) => {
    const { driver, pose } = VEHICLE_TYPES[kind];
    figure.sitting(pose, 0.6, 1 / 60);
    figure.sitting(pose, 1, 1 / 60);
    at(driver.x, driver.y, driver.z);
    for (const side of [1, -1]) {
      const hand = new THREE.Vector3(driver.x + side * pose.hand.x, driver.y + pose.hand.y, driver.z + pose.hand.z);
      expect(point(figure, side > 0 ? "RightPalm" : "LeftPalm").distanceTo(hand), `${kind} hand`).toBeLessThan(0.03);
    }
    figure.sitting(pose, 0, 1 / 60);
  });

  it("holds a part-way pose steady frame after frame (bones don't creep towards the seat)", () => {
    const pose = VEHICLE_TYPES.bike.pose;
    figure.sitting(pose, 0.4, 1 / 60);
    at(0, 0, 0);
    const first = point(figure, "RightPalm");
    for (let i = 0; i < 30; i++) figure.sitting(pose, 0.4, 1 / 60);
    at(0, 0, 0);
    expect(point(figure, "RightPalm").distanceTo(first)).toBeLessThan(0.001);
  });

  it("stands fully up again after being seated", () => {
    figure.setSeated(VEHICLE_TYPES.auto.pose);
    figure.sitting(VEHICLE_TYPES.auto.pose, 0.5, 1 / 60);
    figure.sitting(VEHICLE_TYPES.auto.pose, 0, 1 / 60);
    at(0, 0, 0);
    expect(point(figure, "Hips").y).toBeCloseTo(standingHips, 3);
  });
});

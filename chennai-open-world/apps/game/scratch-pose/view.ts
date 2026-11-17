// Temporary pose viewer (not committed).
import * as THREE from "three";
import { HumanAssets } from "@cow/player";
import { TrafficCar, loadVehicleModels, type VehicleKind } from "@cow/vehicles";
import playerModel from "../../../assets/optimized/player.glb?inline";
import locomotion from "../../../assets/optimized/locomotion.glb?inline";
import autoRickshaw from "../../../assets/optimized/vehicles/auto_rickshaw_lod1.glb?inline";

const params = new URLSearchParams(location.search);
const kind = (params.get("kind") ?? "bike") as VehicleKind;
const view = params.get("view") ?? "side";
const xray = params.has("xray");

async function main(): Promise<void> {
  await loadVehicleModels({ auto: { url: autoRickshaw, ground: -0.68 } });
  const humans = await HumanAssets.load({ model: playerModel, animations: locomotion });
  const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("c") as HTMLCanvasElement, antialias: true });
  renderer.setSize(900, 600, false);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fb4c8);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x666655, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(3, 6, 2);
  scene.add(sun);
  const car = new TrafficCar(kind, 0xc0392b);
  car.sync(0.016, 0, 0, 0, 0, 0);
  scene.add(car.object);
  const figure = humans.create();
  figure.setSeated(car.type.pose);
  figure.object.position.set(car.type.driver.x, car.type.driver.y, car.type.driver.z);
  car.object.add(figure.object);
  if (xray) {
    car.object.traverse((n) => {
      if (n instanceof THREE.Mesh && !figure.object.getObjectById(n.id)) {
        const m = (n.material as THREE.Material).clone();
        m.transparent = true;
        m.opacity = 0.35;
        m.depthWrite = false;
        n.material = m;
      }
    });
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x777770 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const size = car.type.physics.halfExtents;
  const span = Math.max(size.z, 1.2) * 2.6;
  const target = new THREE.Vector3(car.type.driver.x, car.type.rideHeight + car.type.driver.y + 0.2, car.type.driver.z);
  const camera = new THREE.PerspectiveCamera(35, 1.5, 0.05, 100);
  const dir = view === "front" ? new THREE.Vector3(0.15, 0.12, -1) : view === "top" ? new THREE.Vector3(0.01, 1, 0.01) : view === "rear" ? new THREE.Vector3(0.3, 0.5, 1) : new THREE.Vector3(1, 0.08, 0);
  camera.position.copy(target).addScaledVector(dir.normalize(), view === "side" || view === "front" ? Math.min(span, 4) : 4);
  camera.lookAt(target);
  renderer.render(scene, camera);
  document.documentElement.dataset.ready = "true";
}
void main();

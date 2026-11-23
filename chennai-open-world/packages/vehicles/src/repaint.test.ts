/** A spare vehicle repainted to stand in for a taken traffic vehicle: rebuilt in place, old geometry freed. */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { PhysicsWorld } from "@cow/physics";
import { Vehicle } from "./Vehicle";

describe("Vehicle.repaint", () => {
  it("swaps the model in the same parent, pose and door, and frees the old model's own geometry", async () => {
    const physics = await PhysicsWorld.create();
    const scene = new THREE.Scene();
    const car = new Vehicle("jacked-car-0", "car", physics, { x: 5, z: 7 }, 0.3, 0x111111);
    scene.add(car.object);
    car.object.position.set(5, 0.7, 7);
    car.setDoor(0.5);
    const old = car.object;
    let freed = 0;
    let wheelsFreed = 0;
    old.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry.addEventListener("dispose", () => (child.name === "spin" ? wheelsFreed++ : freed++));
    });

    car.repaint(0x2b3f6b);
    expect(car.color).toBe(0x2b3f6b);
    expect(car.object).not.toBe(old);
    expect(old.parent).toBeNull();
    expect(car.object.parent).toBe(scene);
    expect(scene.children.filter((c) => c instanceof THREE.Group)).toHaveLength(1);
    expect(car.object.position.toArray()).toEqual([5, 0.7, 7]);
    expect(car.door).toBe(0.5);
    expect(freed).toBeGreaterThan(0);
    // Wheel geometry is shared with every other car's wheels: kept.
    expect(wheelsFreed).toBe(0);

    // The same colour again changes nothing.
    const now = car.object;
    car.repaint(0x2b3f6b);
    expect(car.object).toBe(now);
  });
});

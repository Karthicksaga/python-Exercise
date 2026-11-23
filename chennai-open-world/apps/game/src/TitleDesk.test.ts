import { describe, expect, it } from "vitest";
import { CONTROLS, attractPose } from "./TitleDesk";

describe("title camera", () => {
  const centre = { x: 100, y: 0, z: -50, yaw: 0.8 };

  it("circles the player above the street, looking at them", () => {
    for (const t of [0, 7, 30, 95, 400]) {
      const { eye, target } = attractPose(t, centre);
      const across = Math.hypot(eye.x - centre.x, eye.z - centre.z);
      expect(across).toBeGreaterThanOrEqual(26);
      expect(across).toBeLessThanOrEqual(34);
      expect(eye.y - centre.y).toBeGreaterThan(10);
      expect(target).toEqual({ x: centre.x, y: centre.y + 2.2, z: centre.z });
    }
  });

  it("starts behind the player and turns slowly (minutes per circle, not seconds)", () => {
    const start = attractPose(0, centre).eye;
    // Behind = opposite the facing direction (-sin yaw, -cos yaw), turned half a radian for depth.
    const behind = { x: Math.sin(centre.yaw + 0.5), z: Math.cos(centre.yaw + 0.5) };
    const length = Math.hypot(start.x - centre.x, start.z - centre.z);
    expect(((start.x - centre.x) * behind.x + (start.z - centre.z) * behind.z) / length).toBeCloseTo(1, 5);
    const a = attractPose(0, centre).eye;
    const b = attractPose(1, centre).eye;
    const turned = Math.acos(((a.x - centre.x) * (b.x - centre.x) + (a.z - centre.z) * (b.z - centre.z)) / (Math.hypot(a.x - centre.x, a.z - centre.z) * Math.hypot(b.x - centre.x, b.z - centre.z)));
    expect(turned).toBeLessThan(0.05);
    expect(turned).toBeGreaterThan(0.01);
  });

  it("describes the same touch controls as the pause screen", () => {
    const named = CONTROLS.flatMap((group) => group.items.map(([control]) => control)).join(" ");
    for (const control of ["JUMP", "HIT", "FIRE", "ENTER", "BRAKE", "SIREN", "JOBS"]) expect(named).toContain(control);
  });
});

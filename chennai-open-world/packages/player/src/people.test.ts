import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CASTS, castPool, detailFor, diverseCast, dressedFor, fitHeight, isMinor, LOD1_FROM, parsePeopleManifest, pickPerson, platformCast, strideScale, uniformFor, type Age, type Cast, type Person, type Role, type Sex } from "./people";

const person = (id: string, sex: Sex, age: Age, roles: Role[], heightM: number | null = 1.7): Person => ({ id, file: `people/${id}.glb`, lod1: null, sex, age, roles, heightM, triangles: 9000, lod1Triangles: 3000, texture: 512 });

/** A cast like the one the assets pipeline is building: every age, both sexes, every job. */
const CITY: Person[] = [
  person("man-young", "male", "young", ["pedestrian", "college", "delivery"]),
  person("woman-young", "female", "young", ["pedestrian", "college", "office"]),
  person("man-middle", "male", "middle", ["pedestrian", "construction"]),
  person("woman-saree", "female", "middle", ["pedestrian", "passenger", "vendor"]),
  person("man-veshti", "male", "middle", ["pedestrian", "passenger"]),
  person("grandfather", "male", "elderly", ["pedestrian", "passenger", "shopkeeper"]),
  person("grandmother", "female", "elderly", ["pedestrian", "passenger"]),
  person("schoolgirl", "female", "child", ["school", "passenger", "pedestrian"], 1.3),
  person("schoolboy", "male", "teen", ["school", "pedestrian"], 1.55),
  person("auto-anna", "male", "middle", ["auto-driver"]),
  person("cabbie", "male", "young", ["cab-driver"]),
  person("constable", "male", "middle", ["police"]),
  person("traffic-constable", "female", "young", ["traffic-police"]),
  person("tea-master", "male", "middle", ["tea-worker", "vendor"]),
];

const HURTABLE: Cast[] = (Object.keys(CASTS) as Cast[]).filter((c) => CASTS[c].hurtable);

describe("people manifest", () => {
  it("reads the schema and keeps every field", () => {
    const { manifest, problems } = parsePeopleManifest({
      people: [{ id: "a", file: "people/a.glb", lod1: "people/a_lod1.glb", sex: "female", age: "elderly", roles: ["pedestrian", "passenger"], heightM: 1.52, triangles: 9800, lod1Triangles: 3100, texture: 512 }],
    });
    expect(problems).toEqual([]);
    expect(manifest.fixture).toBe(false);
    expect(manifest.people).toEqual([{ id: "a", file: "people/a.glb", lod1: "people/a_lod1.glb", sex: "female", age: "elderly", roles: ["pedestrian", "passenger"], heightM: 1.52, triangles: 9800, lod1Triangles: 3100, texture: 512 }]);
  });

  it("leaves out broken entries and says why, instead of failing", () => {
    const { manifest, problems } = parsePeopleManifest({
      fixture: true,
      people: [
        { id: "ok", file: "people/ok.glb", sex: "male", age: "young", roles: ["pedestrian", "astronaut"], heightM: 9 },
        { id: "ok", file: "people/ok2.glb", sex: "male", age: "young", roles: ["pedestrian"] },
        { id: "nofile", sex: "male", age: "young", roles: ["pedestrian"] },
        { id: "badage", file: "people/b.glb", sex: "male", age: "baby", roles: ["pedestrian"] },
        { id: "noroles", file: "people/c.glb", sex: "female", age: "young", roles: [] },
        "nonsense",
      ],
    });
    expect(manifest.fixture).toBe(true);
    expect(manifest.people.map((p) => p.id)).toEqual(["ok"]);
    // Unknown role dropped, impossible height ignored (the model's own height is used), lod1 absent.
    expect(manifest.people[0]).toMatchObject({ roles: ["pedestrian"], heightM: null, lod1: null });
    expect(problems.length).toBe(7);
    expect(() => parsePeopleManifest({ nobody: [] })).toThrow();
  });

  it("the fixture manifest is valid and every file it names exists", () => {
    const root = new URL("../../../assets/", import.meta.url);
    const { manifest, problems } = parsePeopleManifest(JSON.parse(readFileSync(new URL("models/people/people.fixture.json", root), "utf8")));
    expect(problems).toEqual([]);
    expect(manifest.fixture).toBe(true);
    for (const p of manifest.people) expect(existsSync(fileURLToPath(new URL(`optimized/${p.file}`, root))), p.file).toBe(true);
  });

  it("the real manifest, once it exists, is valid and casts no child anywhere they can be hurt", () => {
    const file = new URL("../../../assets/models/people/people.json", import.meta.url);
    if (!existsSync(fileURLToPath(file))) return;
    const { manifest, problems } = parsePeopleManifest(JSON.parse(readFileSync(file, "utf8")));
    expect(problems).toEqual([]);
    for (const cast of HURTABLE) for (const p of castPool(manifest.people, cast)) expect(isMinor(p), `${p.id} as ${cast}`).toBe(false);
  });
});

describe("casting", () => {
  it("never casts children or teenagers where they can be hit, shot or hurt", () => {
    expect(HURTABLE.sort()).toEqual(["auto-driver", "driver", "enemy", "pedestrian", "police"]);
    // Even a manifest of nothing but children gives no child to a hurtable cast.
    const kids = [person("k1", "female", "child", [...CITY.flatMap((p) => p.roles)]), person("k2", "male", "teen", ["pedestrian", "police", "auto-driver", "cab-driver"])];
    for (const cast of HURTABLE) {
      for (const p of castPool(CITY, cast)) expect(isMinor(p), `${p.id} as ${cast}`).toBe(false);
      expect(castPool(kids, cast)).toEqual([]);
      for (let i = 0; i < 40; i++) expect(pickPerson(castPool([...CITY, ...kids], cast, { withAdult: true }), i)?.age).not.toMatch(/child|teen/);
    }
  });

  it("children appear in platform crowds, and as passengers only beside an adult", () => {
    expect(castPool(CITY, "platform").some(isMinor)).toBe(true);
    expect(castPool(CITY, "passenger").some(isMinor)).toBe(false);
    expect(castPool(CITY, "passenger", { withAdult: true }).some(isMinor)).toBe(true);
    expect(castPool(CITY, "wedding", { withAdult: true }).some(isMinor)).toBe(false); // the wedding party is dressed in silks
    expect(castPool(CITY, "tea-seller").some(isMinor)).toBe(false);
    expect(castPool(CITY, "patient", { withAdult: true }).some(isMinor)).toBe(false);
  });

  it("gives each role its people", () => {
    expect(castPool(CITY, "auto-driver").map((p) => p.id)).toEqual(["auto-anna"]);
    expect(castPool(CITY, "driver").map((p) => p.id)).toEqual(["cabbie"]);
    expect(castPool(CITY, "police").map((p) => p.id).sort()).toEqual(["constable", "traffic-constable"]);
    expect(castPool(CITY, "tea-seller").map((p) => p.id)).toEqual(["tea-master"]);
    expect(castPool(CITY, "patient").every((p) => p.age === "elderly")).toBe(true);
    expect(castPool(CITY, "wedding").map((p) => p.id).sort()).toEqual(["man-veshti", "woman-saree"]);
    // Gangs and story enemies: grown men off the street.
    expect(castPool(CITY, "enemy").map((p) => p.id).sort()).toEqual(["man-middle", "man-veshti", "man-young"]);
    // Pedestrians: everyone who walks the street, but not drivers, police or children.
    expect(castPool(CITY, "pedestrian").map((p) => p.id).sort()).toEqual(["grandfather", "grandmother", "man-middle", "man-veshti", "man-young", "woman-saree", "woman-young"]);
  });

  it("stands someone in for a role nobody was made for, in the role's uniform", () => {
    const street = CITY.filter((p) => p.roles.includes("pedestrian"));
    const autos = castPool(street, "auto-driver");
    expect(autos.length).toBeGreaterThan(0);
    expect(autos.every((p) => p.sex === "male" && (p.age === "middle" || p.age === "elderly"))).toBe(true);
    expect(uniformFor(autos[0]!, "auto-driver")).toBe(CASTS["auto-driver"].uniform);
    const police = castPool(street, "police");
    expect(police.every((p) => p.sex === "male" && !isMinor(p))).toBe(true);
    expect(uniformFor(police[0]!, "police")).toBe(CASTS.police.uniform);
    // Someone dressed for the part keeps their own clothes; the player's model stands in with the uniform.
    const constable = CITY.find((p) => p.id === "constable")!;
    expect(dressedFor(constable, "police")).toBe(true);
    expect(uniformFor(constable, "police")).toBeUndefined();
    expect(uniformFor(null, "police")).toBe(CASTS.police.uniform);
    expect(uniformFor(null, "pedestrian")).toBeUndefined();
    // Nobody at all: the game falls back to the player's model.
    expect(castPool([], "pedestrian")).toEqual([]);
    expect(pickPerson([], 3)).toBeNull();
  });

  it("consecutive people differ and mix men and women, young and old", () => {
    const pool = castPool(CITY, "pedestrian");
    const seven = Array.from({ length: 7 }, (_, i) => pickPerson(pool, i)!);
    expect(new Set(seven.map((p) => p.id)).size).toBe(7);
    // The first few already mix sexes and ages.
    const four = seven.slice(0, 4);
    expect(new Set(four.map((p) => p.sex)).size).toBe(2);
    expect(new Set(four.map((p) => p.age)).size).toBeGreaterThanOrEqual(2);
    expect(pickPerson(pool, -1)).toBe(pool[pool.length - 1]);
  });

  it("bakes a platform crowd from different kinds of people, with a tea seller of their own", () => {
    const cast = platformCast(CITY, 4);
    expect(cast.seller).toBe("tea-master");
    expect(cast.people).toHaveLength(4);
    const chosen = cast.people.map((id) => CITY.find((p) => p.id === id)!);
    expect(new Set(chosen.map((p) => p.age)).size).toBe(4);
    expect(new Set(chosen.map((p) => p.sex)).size).toBe(2);
    expect(diverseCast([], 4)).toEqual([]);
    expect(diverseCast(CITY.slice(0, 2), 4)).toHaveLength(2);
  });
});

describe("level of detail, height and stride", () => {
  it("switches to the cheap model beyond LOD1_FROM, with a margin against flicker", () => {
    expect(LOD1_FROM).toBeGreaterThanOrEqual(25);
    expect(LOD1_FROM).toBeLessThanOrEqual(35);
    expect(detailFor(10, 0)).toBe(0);
    expect(detailFor(LOD1_FROM + 1, 0)).toBe(0);
    expect(detailFor(LOD1_FROM + 3, 0)).toBe(1);
    expect(detailFor(LOD1_FROM - 1, 1)).toBe(1);
    expect(detailFor(LOD1_FROM - 3, 1)).toBe(0);
    expect(detailFor(80, 1)).toBe(1);
  });

  it("scales to the manifest height and puts the soles on the ground", () => {
    // A model 1.70 tall in its own units, its soles 0.02 below its origin.
    const fit = fitHeight({ low: -0.02, high: 1.68 }, 1.52, 1);
    expect(fit.scale).toBeCloseTo(1.52 / 1.7, 6);
    expect(-0.02 * fit.scale + fit.lift).toBeCloseTo(0, 9);
    // No height in the manifest: the given scale (its own size in metres).
    expect(fitHeight({ low: 0, high: 1.7 }, null, 1)).toEqual({ scale: 1, lift: -0 });
    // Measured to the toe joint, but the soles are lower: the soles go on the ground.
    const rpm = fitHeight({ low: 0.03, high: 1.8 }, 1.75, 1, -0.001);
    expect(-0.001 * rpm.scale + rpm.lift).toBeCloseTo(0, 9);
    // A child stays shorter than an adult: relative heights are kept.
    const child = fitHeight({ low: 0, high: 1.3 }, 1.3, 1);
    const adult = fitHeight({ low: 0, high: 1.7 }, 1.7, 1);
    expect(1.3 * child.scale).toBeLessThan(1.7 * adult.scale);
  });

  it("plays the walk faster for shorter legs so feet don't slide", () => {
    expect(strideScale(0.95, 0.95)).toBe(1);
    expect(strideScale(0.7, 0.95)).toBeCloseTo(0.7 / 0.95, 6);
    expect(strideScale(0.1, 0.95)).toBe(0.45);
    expect(strideScale(2, 0.95)).toBe(1.3);
    expect(strideScale(0, 0.95)).toBe(1);
  });
});

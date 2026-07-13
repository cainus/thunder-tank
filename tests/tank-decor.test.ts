import { describe, expect, it } from "vitest";
import {
  TANK_WORLD_SCALE,
  hullYaw,
  tankArchetypeScale,
  tankModelScale,
  turretYaw,
} from "../src/game/tank-decor";

describe("tankArchetypeScale", () => {
  it("keeps a standard tank at unit scale", () => {
    expect(tankArchetypeScale("standard", false)).toBe(1);
    expect(tankArchetypeScale("light", false)).toBe(1);
    expect(tankArchetypeScale(undefined, false)).toBe(1);
  });

  it("enlarges heavier archetypes so size still reads the archetype", () => {
    expect(tankArchetypeScale("heavy", false)).toBeGreaterThan(1);
    expect(tankArchetypeScale("boss", false)).toBeGreaterThan(tankArchetypeScale("heavy", false));
  });

  it("shrinks the co-op blue teammate regardless of archetype", () => {
    expect(tankArchetypeScale("standard", true)).toBeLessThan(1);
  });
});

describe("tankModelScale", () => {
  it("combines the base world scale with the archetype multiplier", () => {
    expect(tankModelScale("standard", false)).toBe(TANK_WORLD_SCALE);
    expect(tankModelScale("boss", false)).toBeCloseTo(TANK_WORLD_SCALE * 1.45, 5);
  });
});

describe("hullYaw", () => {
  it("leaves a forward-facing (rotation 0) hull unrotated in 3D", () => {
    expect(hullYaw(0)).toBe(0);
  });

  it("negates the Phaser rotation so screen-clockwise maps to a negative yaw", () => {
    expect(hullYaw(Math.PI / 2)).toBeCloseTo(-Math.PI / 2, 5);
    expect(hullYaw(-Math.PI / 2)).toBeCloseTo(Math.PI / 2, 5);
  });
});

describe("turretYaw", () => {
  it("points the barrel up-screen (yaw 0) when aiming straight up", () => {
    // The player's initial aim angle is -PI/2 (up); the 3D barrel must read up.
    expect(turretYaw(-Math.PI / 2)).toBeCloseTo(0, 5);
  });

  it("turns the barrel a quarter turn when aiming along +x (east)", () => {
    // Enemy tanks start aiming east (aimAngle 0); the model faces -Z, so a
    // quarter turn is needed to point the barrel that way.
    expect(turretYaw(0)).toBeCloseTo(-Math.PI / 2, 5);
  });

  it("stays consistent with the flat turret sprite offset", () => {
    // The flat turret sprite is drawn at aimAngle + PI/2; the 3D yaw is the
    // negated equivalent so both point the same way in world space.
    const aim = 1.234;
    expect(turretYaw(aim)).toBeCloseTo(-(aim + Math.PI / 2), 5);
  });
});

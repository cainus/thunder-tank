import { describe, expect, it } from "vitest";
import {
  CAR_PUSH_SPEED_FACTOR,
  clearTankPushFlags,
  markTankPushingCar,
  pushSpeedFactor,
} from "../src/game/car-push";

// A tank only needs its `pushingCar` flag for the push mechanic, so the pure
// helpers are exercised with a minimal fake rather than a live Phaser scene.
type FakeTank = { pushingCar?: boolean };

describe("pushSpeedFactor", () => {
  it("drives at full speed when the tank is not pushing a car", () => {
    expect(pushSpeedFactor({ pushingCar: false })).toBe(1);
  });

  it("treats an unset flag as not pushing (full speed)", () => {
    expect(pushSpeedFactor({})).toBe(1);
  });

  it("slows the tank to CAR_PUSH_SPEED_FACTOR while it is pushing a car", () => {
    expect(pushSpeedFactor({ pushingCar: true })).toBe(CAR_PUSH_SPEED_FACTOR);
    expect(CAR_PUSH_SPEED_FACTOR).toBeLessThan(1);
  });
});

describe("pushingCar flag lifecycle", () => {
  it("set -> read -> clear yields the slow factor only while flagged", () => {
    const tank: FakeTank = {};

    // Nothing touching a car yet: full speed.
    expect(pushSpeedFactor(tank)).toBe(1);

    // Collider fires during the physics step and flags the tank.
    markTankPushingCar(tank);
    expect(tank.pushingCar).toBe(true);
    // Drive code reads the flag this frame and slows down.
    expect(pushSpeedFactor(tank)).toBe(CAR_PUSH_SPEED_FACTOR);

    // End of update clears the flag; next frame is full speed again until the
    // collider re-raises it.
    clearTankPushFlags([tank]);
    expect(tank.pushingCar).toBe(false);
    expect(pushSpeedFactor(tank)).toBe(1);
  });

  it("clears the flag for every tank, so a stale flag can't survive an early-return frame", () => {
    const pushingPlayer: FakeTank = { pushingCar: true };
    const idleEnemy: FakeTank = { pushingCar: false };
    const pushingEnemy: FakeTank = { pushingCar: true };

    clearTankPushFlags([pushingPlayer, idleEnemy, pushingEnemy]);

    expect(pushingPlayer.pushingCar).toBe(false);
    expect(idleEnemy.pushingCar).toBe(false);
    expect(pushingEnemy.pushingCar).toBe(false);
  });

  it("clearing an empty tank list is a no-op", () => {
    expect(() => clearTankPushFlags([])).not.toThrow();
  });
});

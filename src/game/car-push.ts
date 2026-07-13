import type { TankRuntime } from "./types";

// Fraction of its normal speed a tank drives at while it is shoving a parked car
// (TT-26). Pushing a car noticeably slows the tank, whether it is the player or
// an enemy AI.
export const CAR_PUSH_SPEED_FACTOR = 0.5;

// The single mutable field the push mechanic touches on a tank. Kept narrow so
// the drive/collision code — and the tests — can work with any object that
// carries a `pushingCar` flag rather than a fully wired TankRuntime.
type PushableTank = Pick<TankRuntime, "pushingCar">;

// Speed multiplier a tank drives at this frame: CAR_PUSH_SPEED_FACTOR while it is
// pushing a car, otherwise 1 (full speed). Pure so the slowdown is unit-testable
// without a live Phaser scene (see TT-26).
export function pushSpeedFactor(tank: PushableTank): number {
  return tank.pushingCar ? CAR_PUSH_SPEED_FACTOR : 1;
}

// Flags a tank as shoving a car this frame. Called from the tank/car collider
// during the physics step, before the drive code reads the flag (see TT-26).
export function markTankPushingCar(tank: PushableTank): void {
  tank.pushingCar = true;
}

// Clears every tank's push flag. Called at the end of each scene update once the
// drive code has consumed the flag, and on early-return update paths (paused /
// game-over) so a tank that was pushing can't keep the flag set — and drive one
// stale slow frame on resume — while the collider is not re-evaluating it
// (see TT-26).
export function clearTankPushFlags(tanks: Iterable<PushableTank>): void {
  for (const tank of tanks) {
    tank.pushingCar = false;
  }
}

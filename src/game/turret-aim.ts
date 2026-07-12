// Turret counter-aim math for AI tanks.
//
// An AI turret tracks its target, but each frame it is also dragged by two base
// (hull) rotations: its own hull turning underneath it, and — the counter-aim
// mechanic — the *target's* hull turning. When the target spins its base, the
// turret is dragged the full same amount and can only recover toward the target
// at its normal turret speed. Because the drag is folded in before the recovery
// is clamped, a target that keeps spinning its base forces the turret to spend
// its turn budget undoing the drag, so it stays off-aim and cannot line up a
// shot.

export interface CounterAimInput {
  // Current turret angle.
  aimAngle: number;
  // Angle from the turret's tank toward its target.
  desiredAimAngle: number;
  // Signed rotation applied to this tank's own hull this frame.
  hullTurnDelta: number;
  // Signed rotation applied to the target's hull this frame (the drag).
  targetBaseTurnDelta: number;
  // Maximum the turret may turn this frame (turret turn rate * delta seconds).
  maxCounterTurn: number;
}

const TWO_PI = Math.PI * 2;

// Wrap an angle to (-PI, PI], matching Phaser.Math.Angle.Wrap.
export function wrapAngle(angle: number): number {
  const wrapped = ((angle % TWO_PI) + TWO_PI) % TWO_PI;
  return wrapped > Math.PI ? wrapped - TWO_PI : wrapped;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// Returns the turret's new aim angle after being carried by both hull rotations
// and then recovering toward the target within its per-frame turn budget.
export function computeCounterAimAngle({
  aimAngle,
  desiredAimAngle,
  hullTurnDelta,
  targetBaseTurnDelta,
  maxCounterTurn,
}: CounterAimInput): number {
  const carriedAimAngle = aimAngle + hullTurnDelta + targetBaseTurnDelta;
  const aimDelta = wrapAngle(desiredAimAngle - carriedAimAngle);
  return carriedAimAngle + clamp(aimDelta, -maxCounterTurn, maxCounterTurn);
}

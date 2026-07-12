import { describe, expect, it } from "vitest";
import { computeCounterAimAngle, wrapAngle } from "../src/game/turret-aim";

// Player hull rate 3.2 rad/s, turret rate 4.1 rad/s, at ~60fps.
const DT = 1 / 60;
const MAX_COUNTER_TURN = 4.1 * DT;
const PLAYER_HULL_DELTA = 3.2 * DT;

describe("turret counter-aim", () => {
  it("keeps a settled turret on target when nothing rotates", () => {
    const angle = computeCounterAimAngle({
      aimAngle: 0,
      desiredAimAngle: 0,
      hullTurnDelta: 0,
      targetBaseTurnDelta: 0,
      maxCounterTurn: MAX_COUNTER_TURN,
    });

    expect(angle).toBeCloseTo(0, 10);
  });

  it("drags the turret the same way the target's base rotates", () => {
    // Turret is on target; the target then spins its base. The drag must pull
    // the turret in the same direction the target rotated. Isolate the drag by
    // giving the turret zero recovery budget this frame.
    const positiveDrag = computeCounterAimAngle({
      aimAngle: 0,
      desiredAimAngle: 0,
      hullTurnDelta: 0,
      targetBaseTurnDelta: PLAYER_HULL_DELTA,
      maxCounterTurn: 0,
    });
    const negativeDrag = computeCounterAimAngle({
      aimAngle: 0,
      desiredAimAngle: 0,
      hullTurnDelta: 0,
      targetBaseTurnDelta: -PLAYER_HULL_DELTA,
      maxCounterTurn: 0,
    });

    expect(positiveDrag).toBeCloseTo(PLAYER_HULL_DELTA, 10);
    expect(negativeDrag).toBeCloseTo(-PLAYER_HULL_DELTA, 10);
  });

  it("cannot fully recover when the combined drag exceeds the turret budget", () => {
    // Both the turret's own hull and the target's base spin the same way. The
    // combined drag (3.2 + 3.2 rad/s) outpaces the 4.1 rad/s recovery, so the
    // turret is left measurably off-aim this frame.
    const angle = computeCounterAimAngle({
      aimAngle: 0,
      desiredAimAngle: 0,
      hullTurnDelta: PLAYER_HULL_DELTA,
      targetBaseTurnDelta: PLAYER_HULL_DELTA,
      maxCounterTurn: MAX_COUNTER_TURN,
    });

    const totalDrag = 2 * PLAYER_HULL_DELTA;
    const leftover = totalDrag - MAX_COUNTER_TURN;
    expect(angle).toBeCloseTo(leftover, 10);
    expect(angle).toBeGreaterThan(0);
  });

  it("recovers no faster than the turret turn rate toward a large error", () => {
    const angle = computeCounterAimAngle({
      aimAngle: 0,
      desiredAimAngle: 1.5,
      hullTurnDelta: 0,
      targetBaseTurnDelta: 0,
      maxCounterTurn: MAX_COUNTER_TURN,
    });

    expect(angle).toBeCloseTo(MAX_COUNTER_TURN, 10);
  });

  it("matches previous behaviour when the target is not rotating", () => {
    // With no target drag the result must equal the plain carry-and-clamp used
    // before the counter-aim mechanic existed.
    const aimAngle = 0.4;
    const desiredAimAngle = 0.9;
    const hullTurnDelta = 0.05;

    const carried = aimAngle + hullTurnDelta;
    const expected = carried + Math.min(desiredAimAngle - carried, MAX_COUNTER_TURN);

    const angle = computeCounterAimAngle({
      aimAngle,
      desiredAimAngle,
      hullTurnDelta,
      targetBaseTurnDelta: 0,
      maxCounterTurn: MAX_COUNTER_TURN,
    });

    expect(angle).toBeCloseTo(expected, 10);
  });

  it("takes the short way around the wrap boundary", () => {
    // Turret near +PI, target just past -PI: the shortest recovery crosses the
    // wrap boundary rather than unwinding the long way.
    const angle = computeCounterAimAngle({
      aimAngle: Math.PI - 0.02,
      desiredAimAngle: -Math.PI + 0.02,
      hullTurnDelta: 0,
      targetBaseTurnDelta: 0,
      maxCounterTurn: MAX_COUNTER_TURN,
    });

    // Moves forward (positive) across +PI, not backward all the way around.
    expect(angle).toBeGreaterThan(Math.PI - 0.02);
  });
});

describe("wrapAngle", () => {
  it("wraps into (-PI, PI]", () => {
    expect(wrapAngle(0)).toBeCloseTo(0, 10);
    expect(wrapAngle(Math.PI)).toBeCloseTo(Math.PI, 10);
    expect(wrapAngle(Math.PI + 0.1)).toBeCloseTo(-Math.PI + 0.1, 10);
    expect(wrapAngle(-Math.PI - 0.1)).toBeCloseTo(Math.PI - 0.1, 10);
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 10);
  });
});

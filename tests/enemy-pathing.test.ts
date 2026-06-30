import { describe, expect, it } from "vitest";
import { ENEMY_PATH_PADDING, shouldReuseEnemyMoveAngle, selectEnemyMoveAngle } from "../src/game/enemy-pathing";
import type { Vec2 } from "../src/game/types";

describe("enemy pathing", () => {
  it("keeps the current bypass direction when a rival route is only slightly better", () => {
    const enemyPosition = { x: 500, y: 500 };
    const playerPosition = { x: 900, y: 500 };
    const previousMoveAngle = Math.PI / 4;

    const angle = selectEnemyMoveAngle({
      enemyPosition,
      playerPosition,
      desiredAngle: 0.12,
      distanceToPlayer: 400,
      previousMoveAngle,
      isSegmentBlocked: blocksOnlyDirectPath,
      getObstacleClearance: (point) => (point.y < enemyPosition.y ? 130 : 80),
      isPointInsideWorld: () => true,
    });

    expect(angle).toBe(previousMoveAngle);
  });

  it("abandons the current bypass direction when it becomes blocked", () => {
    const enemyPosition = { x: 500, y: 500 };
    const playerPosition = { x: 900, y: 500 };

    const angle = selectEnemyMoveAngle({
      enemyPosition,
      playerPosition,
      desiredAngle: 0,
      distanceToPlayer: 400,
      previousMoveAngle: Math.PI / 4,
      isSegmentBlocked: (start, end, padding) => {
        if (isSamePoint(start, enemyPosition) && isSamePoint(end, playerPosition) && padding === ENEMY_PATH_PADDING) {
          return true;
        }

        return end.y > enemyPosition.y;
      },
      getObstacleClearance: () => 100,
      isPointInsideWorld: () => true,
    });

    expect(angle).toBeLessThan(0);
  });

  it("returns to direct combat movement when line of sight is clear", () => {
    const enemyPosition = { x: 500, y: 500 };
    const playerPosition = { x: 900, y: 500 };

    const angle = selectEnemyMoveAngle({
      enemyPosition,
      playerPosition,
      desiredAngle: 0,
      distanceToPlayer: 400,
      previousMoveAngle: Math.PI / 4,
      isSegmentBlocked: () => false,
      getObstacleClearance: () => 100,
      isPointInsideWorld: () => true,
    });

    expect(angle).toBe(0);
  });
});

describe("enemy movement decision timing", () => {
  it("keeps the previous move angle until the movement decision window expires", () => {
    expect(shouldReuseEnemyMoveAngle(Math.PI / 4, 1_000, 900)).toBe(true);
    expect(shouldReuseEnemyMoveAngle(Math.PI / 4, 1_000, 1_000)).toBe(false);
    expect(shouldReuseEnemyMoveAngle(undefined, 1_000, 900)).toBe(false);
  });
});

function blocksOnlyDirectPath(start: Vec2, end: Vec2, padding: number): boolean {
  return start.x === 500 && start.y === 500 && end.x === 900 && end.y === 500 && padding === ENEMY_PATH_PADDING;
}

function isSamePoint(a: Vec2, b: Vec2): boolean {
  return a.x === b.x && a.y === b.y;
}

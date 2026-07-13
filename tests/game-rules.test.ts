import { describe, expect, it } from "vitest";
import { CAMPAIGN_MAPS } from "../src/game/maps";
import {
  ENEMY_HEALTH,
  ENEMY_STATS,
  PLAYER_BASE_STATS,
  applyPickupBuff,
  getEffectiveStats,
  getMatchOutcome,
  getRampedEnemyStats,
  hasShield,
} from "../src/game/rules";

const PICKUP_OBSTACLE_CLEARANCE = 24;

function getObstacleRadius(kind: "crate" | "barrel" | "barricade" | "sandbag" | "lightPost"): number {
  if (kind === "barricade") {
    return 110;
  }

  if (kind === "sandbag") {
    return 82;
  }

  if (kind === "lightPost") {
    return 54;
  }

  return 74;
}

describe("campaign maps", () => {
  it("ships a twenty-map 1P campaign", () => {
    expect(CAMPAIGN_MAPS).toHaveLength(20);
    expect(CAMPAIGN_MAPS.slice(0, 3).map((map) => map.name)).toEqual(["01. Dust Yard", "02. Iron Lanes", "03. Broken Foundry"]);
    expect(CAMPAIGN_MAPS.map((map, index) => map.name.startsWith(`${String(index + 1).padStart(2, "0")}. `))).toEqual(
      Array(20).fill(true),
    );
  });

  it("ramps enemy pressure across the campaign", () => {
    expect(CAMPAIGN_MAPS[0].enemySpawns).toHaveLength(1);
    expect(CAMPAIGN_MAPS[1].enemySpawns).toHaveLength(3);
    expect(CAMPAIGN_MAPS[2].enemySpawns).toHaveLength(4);
    expect(CAMPAIGN_MAPS[18].enemySpawns.length).toBeGreaterThan(CAMPAIGN_MAPS[2].enemySpawns.length);
    expect(CAMPAIGN_MAPS[18].enemySpawns.some((enemy) => enemy.archetype === "heavy")).toBe(true);
  });

  it("makes every fifth map a single four-hit boss fight", () => {
    for (const [index, map] of CAMPAIGN_MAPS.entries()) {
      const mapNumber = index + 1;

      if (mapNumber % 5 === 0) {
        expect(map.enemySpawns).toEqual([expect.objectContaining({ archetype: "boss" })]);
        expect(map.playerScoreLimit).toBe(1);
      } else {
        expect(map.enemySpawns.some((enemy) => enemy.archetype === "boss")).toBe(false);
      }
    }

    expect(ENEMY_HEALTH.boss).toBe(4);
  });

  it("never starts with more enemies than the player needs to kill", () => {
    for (const map of CAMPAIGN_MAPS) {
      expect(map.enemySpawns.length).toBeLessThanOrEqual(map.playerScoreLimit);
    }
  });

  it("includes all three pickup types in the campaign", () => {
    const pickups = new Set(CAMPAIGN_MAPS.flatMap((map) => map.pickups.map((pickup) => pickup.type)));

    expect(pickups).toEqual(new Set(["speed", "rapidFire", "shield"]));
  });

  it("gives every campaign map power-ups and starts opposite the enemy cluster", () => {
    for (const map of CAMPAIGN_MAPS) {
      const pickups = new Set(map.pickups.map((pickup) => pickup.type));
      const enemyCenter = {
        x: map.enemySpawns.reduce((total, enemy) => total + enemy.x, 0) / map.enemySpawns.length,
        y: map.enemySpawns.reduce((total, enemy) => total + enemy.y, 0) / map.enemySpawns.length,
      };
      const mapCenter = { x: map.width / 2, y: map.height / 2 };
      const playerDx = map.playerSpawn.x - mapCenter.x;
      const playerDy = map.playerSpawn.y - mapCenter.y;
      const enemyDx = enemyCenter.x - mapCenter.x;
      const enemyDy = enemyCenter.y - mapCenter.y;

      expect(pickups).toEqual(new Set(["speed", "rapidFire", "shield"]));
      expect(playerDx * enemyDx + playerDy * enemyDy).toBeLessThanOrEqual(0);
    }
  });

  it("keeps every pickup clear of obstacle footprints", () => {
    for (const map of CAMPAIGN_MAPS) {
      for (const pickup of map.pickups) {
        for (const obstacle of map.obstacles) {
          const clearance = Math.hypot(pickup.x - obstacle.x, pickup.y - obstacle.y) - getObstacleRadius(obstacle.kind);
          expect(
            clearance,
            `${map.name} ${pickup.type} pickup overlaps the ${obstacle.kind} at (${obstacle.x}, ${obstacle.y})`,
          ).toBeGreaterThanOrEqual(PICKUP_OBSTACLE_CLEARANCE);
        }
      }
    }
  });
});

describe("match rules", () => {
  it("wins when the player reaches the map score limit first", () => {
    expect(getMatchOutcome({ player: 4, enemy: 2 }, 4, 4)).toBe("won");
  });

  it("loses when the enemy reaches the map score limit first", () => {
    expect(getMatchOutcome({ player: 3, enemy: 4 }, 4, 4)).toBe("lost");
  });

  it("keeps playing before either score limit is reached", () => {
    expect(getMatchOutcome({ player: 3, enemy: 3 }, 4, 4)).toBe("playing");
  });
});

describe("pickup buffs", () => {
  it("uses snappier bullets for the player and enemies", () => {
    expect(PLAYER_BASE_STATS.bulletSpeed).toBeGreaterThanOrEqual(720);
    expect(Object.values(ENEMY_STATS).every((stats) => stats.bulletSpeed >= 560)).toBe(true);
  });

  it("aims AI turrets slower than the player at every archetype and difficulty", () => {
    for (const stats of Object.values(ENEMY_STATS)) {
      expect(stats.turretTurnRate).toBeLessThan(PLAYER_BASE_STATS.turretTurnRate);

      const ramped = getRampedEnemyStats(stats, 1);
      expect(ramped.turretTurnRate).toBeGreaterThan(stats.turretTurnRate);
      expect(ramped.turretTurnRate).toBeLessThanOrEqual(PLAYER_BASE_STATS.turretTurnRate);
    }
  });

  it("carries the turret turn rate through effective-stat modifiers", () => {
    const buffs = applyPickupBuff({ speedUntil: 0, rapidFireUntil: 0, shieldUntil: 0 }, "rapidFire", 100);
    const effective = getEffectiveStats(ENEMY_STATS.standard, buffs, 200);

    expect(effective.turretTurnRate).toBe(ENEMY_STATS.standard.turretTurnRate);
  });

  it("applies speed and rapid-fire modifiers only while active", () => {
    const buffs = applyPickupBuff(applyPickupBuff({ speedUntil: 0, rapidFireUntil: 0, shieldUntil: 0 }, "speed", 100), "rapidFire", 100);
    const active = getEffectiveStats(PLAYER_BASE_STATS, buffs, 200);
    const expired = getEffectiveStats(PLAYER_BASE_STATS, buffs, 10_000);

    expect(active.speed).toBeGreaterThan(PLAYER_BASE_STATS.speed);
    expect(active.fireCooldownMs).toBeLessThan(PLAYER_BASE_STATS.fireCooldownMs);
    expect(expired.speed).toBe(PLAYER_BASE_STATS.speed);
    expect(expired.fireCooldownMs).toBe(PLAYER_BASE_STATS.fireCooldownMs);
  });

  it("tracks shield duration", () => {
    const buffs = applyPickupBuff({ speedUntil: 0, rapidFireUntil: 0, shieldUntil: 0 }, "shield", 500);

    expect(hasShield(buffs, 600)).toBe(true);
    expect(hasShield(buffs, 8_000)).toBe(false);
  });
});

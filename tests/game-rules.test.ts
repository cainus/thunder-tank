import { describe, expect, it } from "vitest";
import { CAMPAIGN_MAPS } from "../src/game/maps";
import { PLAYER_BASE_STATS, applyPickupBuff, getEffectiveStats, getMatchOutcome, hasShield } from "../src/game/rules";

describe("campaign maps", () => {
  it("ships the three-map P1 vertical slice", () => {
    expect(CAMPAIGN_MAPS).toHaveLength(3);
    expect(CAMPAIGN_MAPS.map((map) => map.name)).toEqual(["Dust Yard", "Iron Lanes", "Broken Foundry"]);
  });

  it("ramps enemy pressure across the campaign", () => {
    expect(CAMPAIGN_MAPS[0].enemySpawns).toHaveLength(1);
    expect(CAMPAIGN_MAPS[1].enemySpawns).toHaveLength(3);
    expect(CAMPAIGN_MAPS[2].enemySpawns).toHaveLength(4);
    expect(CAMPAIGN_MAPS[2].enemySpawns.some((enemy) => enemy.archetype === "heavy")).toBe(true);
  });

  it("includes all three pickup types in the slice", () => {
    const pickups = new Set(CAMPAIGN_MAPS.flatMap((map) => map.pickups.map((pickup) => pickup.type)));

    expect(pickups).toEqual(new Set(["speed", "rapidFire", "shield"]));
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

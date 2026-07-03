import { describe, expect, it } from "vitest";
import {
  EMPTY_GUN_HEAT,
  PLAYER_GUN_FREEZE_MS,
  PLAYER_GUN_HEAT_LIMIT,
  PLAYER_GUN_HEAT_WINDOW_MS,
  getActiveBuffDisplays,
  getActiveBuffLabels,
  getGunFreezeSeconds,
  getPlayerStatusKey,
  getRemainingHits,
  isGunFrozen,
  recordPlayerShot,
} from "../src/game/combat-state";

describe("gun heat", () => {
  it("freezes the player gun after too many shots in a short burst", () => {
    let state = EMPTY_GUN_HEAT;

    for (let shot = 0; shot < PLAYER_GUN_HEAT_LIMIT; shot += 1) {
      state = recordPlayerShot(state, 100 + shot * 120);
    }

    expect(isGunFrozen(state, 100 + PLAYER_GUN_HEAT_LIMIT * 120)).toBe(true);
    expect(state.frozenUntil).toBe(100 + (PLAYER_GUN_HEAT_LIMIT - 1) * 120 + PLAYER_GUN_FREEZE_MS);
  });

  it("resets heat after a firing gap", () => {
    let state = EMPTY_GUN_HEAT;

    for (let shot = 0; shot < PLAYER_GUN_HEAT_LIMIT - 1; shot += 1) {
      state = recordPlayerShot(state, 100 + shot * 120);
    }

    state = recordPlayerShot(state, state.lastShotAt + PLAYER_GUN_HEAT_WINDOW_MS + 500);

    expect(state.shotCount).toBe(1);
    expect(isGunFrozen(state, state.lastShotAt)).toBe(false);
  });
});

describe("player status", () => {
  it("lists active pickup buffs and omits expired ones", () => {
    expect(getActiveBuffLabels({ speedUntil: 500, rapidFireUntil: 50, shieldUntil: 700 }, 100)).toEqual(["Speed", "Shield"]);
  });

  it("returns active pickup metadata for icon-backed HUD rendering", () => {
    expect(getActiveBuffDisplays({ speedUntil: 500, rapidFireUntil: 600, shieldUntil: 50 }, 100)).toEqual([
      { key: "speed", label: "Speed" },
      { key: "rapidFire", label: "Rapid Fire" },
    ]);
  });

  it("rounds gun freeze time up for the HUD", () => {
    expect(
      getGunFreezeSeconds({
        alive: true,
        buffs: { speedUntil: 0, rapidFireUntil: 0, shieldUntil: 0 },
        health: 1,
        maxHealth: 1,
        gunFrozenUntil: 3_100,
        now: 1_250,
      }),
    ).toBe(2);
  });

  it("counts shield armor as an extra remaining hit", () => {
    expect(
      getRemainingHits({
        alive: true,
        buffs: { speedUntil: 0, rapidFireUntil: 0, shieldUntil: 700 },
        health: 3,
        maxHealth: 3,
        gunFrozenUntil: 0,
        now: 100,
      }),
    ).toBe(4);
  });

  it("shows zero remaining hits while the player tank is destroyed", () => {
    expect(
      getRemainingHits({
        alive: false,
        buffs: { speedUntil: 0, rapidFireUntil: 0, shieldUntil: 700 },
        health: 3,
        maxHealth: 3,
        gunFrozenUntil: 0,
        now: 100,
      }),
    ).toBe(0);
  });
});

describe("player status change key", () => {
  const baseInput = {
    alive: true,
    health: 3,
    maxHealth: 3,
    buffs: { speedUntil: 0, rapidFireUntil: 0, shieldUntil: 0 },
    gunFrozenUntil: 0,
    now: 1_000,
  };

  it("keeps the key stable while the same buffs stay active", () => {
    const buffs = { speedUntil: 9_000, rapidFireUntil: 9_000, shieldUntil: 0 };

    const earlier = getPlayerStatusKey({ ...baseInput, buffs, now: 2_000 });
    const later = getPlayerStatusKey({ ...baseInput, buffs, now: 5_000 });

    expect(later).toBe(earlier);
  });

  it("changes the key the moment a buff expires so the HUD refreshes", () => {
    const buffs = { speedUntil: 9_000, rapidFireUntil: 0, shieldUntil: 0 };

    const active = getPlayerStatusKey({ ...baseInput, buffs, now: 8_999 });
    const expired = getPlayerStatusKey({ ...baseInput, buffs, now: 9_001 });

    expect(active).not.toBe(expired);
  });

  it("reflects each additional buff when multiple power-ups are stacked", () => {
    const single = getPlayerStatusKey({
      ...baseInput,
      buffs: { speedUntil: 9_000, rapidFireUntil: 0, shieldUntil: 0 },
      now: 1_000,
    });
    const stacked = getPlayerStatusKey({
      ...baseInput,
      buffs: { speedUntil: 9_000, rapidFireUntil: 9_000, shieldUntil: 0 },
      now: 1_000,
    });

    expect(stacked).not.toBe(single);
  });
});

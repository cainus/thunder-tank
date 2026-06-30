import { describe, expect, it } from "vitest";
import {
  EMPTY_GUN_HEAT,
  PLAYER_GUN_FREEZE_MS,
  PLAYER_GUN_HEAT_LIMIT,
  PLAYER_GUN_HEAT_WINDOW_MS,
  getActiveBuffLabels,
  getGunFreezeSeconds,
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

  it("rounds gun freeze time up for the HUD", () => {
    expect(getGunFreezeSeconds({ buffs: { speedUntil: 0, rapidFireUntil: 0, shieldUntil: 0 }, gunFrozenUntil: 3_100, now: 1_250 })).toBe(2);
  });
});

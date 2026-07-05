import type { ActiveBuffs, CampaignMap, ScoreState } from "./types";

export const PLAYER_GUN_FREEZE_MS = 3_000;
export const PLAYER_GUN_HEAT_LIMIT = 7;
export const PLAYER_GUN_HEAT_WINDOW_MS = 1_700;

export interface GunHeatState {
  shotCount: number;
  lastShotAt: number;
  frozenUntil: number;
}

export const EMPTY_GUN_HEAT: GunHeatState = {
  shotCount: 0,
  lastShotAt: 0,
  frozenUntil: 0,
};

export interface PlayerStatus {
  alive: boolean;
  buffs: ActiveBuffs;
  health: number;
  maxHealth: number;
  gunFrozenUntil: number;
  now: number;
}

export interface ActiveBuffDisplay {
  key: "speed" | "rapidFire" | "shield";
  label: string;
}

export function isGunFrozen(state: GunHeatState, now: number): boolean {
  return state.frozenUntil > now;
}

export function recordPlayerShot(state: GunHeatState, now: number): GunHeatState {
  if (isGunFrozen(state, now)) {
    return state;
  }

  const shotCount = now - state.lastShotAt <= PLAYER_GUN_HEAT_WINDOW_MS ? state.shotCount + 1 : 1;

  if (shotCount >= PLAYER_GUN_HEAT_LIMIT) {
    return {
      shotCount: 0,
      lastShotAt: now,
      frozenUntil: now + PLAYER_GUN_FREEZE_MS,
    };
  }

  return {
    shotCount,
    lastShotAt: now,
    frozenUntil: 0,
  };
}

export function getActiveBuffLabels(buffs: ActiveBuffs, now: number): string[] {
  return getActiveBuffDisplays(buffs, now).map((buff) => buff.label);
}

export function getActiveBuffDisplays(buffs: ActiveBuffs, now: number): ActiveBuffDisplay[] {
  return [
    buffs.speedUntil > now ? { key: "speed", label: "Speed" } : undefined,
    buffs.rapidFireUntil > now ? { key: "rapidFire", label: "Rapid Fire" } : undefined,
    buffs.shieldUntil > now ? { key: "shield", label: "Shield" } : undefined,
  ].filter((buff): buff is ActiveBuffDisplay => buff !== undefined);
}

export function getGunFreezeSeconds(status: PlayerStatus): number {
  return Math.max(0, Math.ceil((status.gunFrozenUntil - status.now) / 1_000));
}

export function getRemainingHits(status: PlayerStatus): number {
  if (!status.alive) {
    return 0;
  }

  return status.health + (status.buffs.shieldUntil > status.now ? 1 : 0);
}

type TargetLimits = Pick<CampaignMap, "playerScoreLimit" | "ctf">;

/**
 * The score the player must reach to win the current map: captures for a
 * Capture the Flag map, otherwise the campaign/deathmatch score limit.
 */
export function getTargetScore(map: TargetLimits): number {
  return map.ctf?.captureLimit ?? map.playerScoreLimit;
}

/**
 * How many more points the player still needs to hit the target, clamped at
 * zero so the HUD never shows a negative count once the target is reached.
 */
export function getTargetsRemaining(map: TargetLimits, score: ScoreState): number {
  return Math.max(0, getTargetScore(map) - score.player);
}

import type { ActiveBuffs } from "./types";

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
  return [
    buffs.speedUntil > now ? "Speed" : undefined,
    buffs.rapidFireUntil > now ? "Rapid Fire" : undefined,
    buffs.shieldUntil > now ? "Shield" : undefined,
  ].filter((label): label is string => label !== undefined);
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

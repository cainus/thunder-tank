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

export interface PlayerStatusKeyInput {
  alive: boolean;
  health: number;
  maxHealth: number;
  buffs: ActiveBuffs;
  gunFrozenUntil: number;
  now: number;
}

// Number of whole seconds remaining until `until`, clamped at zero. Used so the
// HUD change-detection key ticks down once per second while a buff is active.
function remainingSeconds(until: number, now: number): number {
  return Math.max(0, Math.ceil((until - now) / 1_000));
}

// Builds a change-detection key for the player HUD status.
//
// Each buff contributes its *remaining seconds* (not just whether it is active)
// so the key changes every second while any buff is running. That matters for
// two reasons:
//   1. It fixes the "pick up 2 power-ups and end up with none" bug. Keying only
//      on the set of active buffs (or on raw expiry timestamps) leaves the key
//      constant frame-to-frame while buffs are active, so `publishPlayerStatus`
//      stops republishing and the HUD's `now` freezes. Nothing then re-publishes
//      the moment a buff expires, so multiple buffs linger and later vanish all
//      at once. Counting seconds down makes the key change each second, so the
//      HUD refreshes and each buff disappears exactly when it expires.
//   2. It makes re-picking the same buff type visible. Extending `speedUntil`
//      (e.g. a second speed power-up bumping 9000 -> 15000) raises that buff's
//      remaining seconds, changing the key so the HUD refreshes to show the new
//      duration instead of being skipped by the dedup guard.
export function getPlayerStatusKey(input: PlayerStatusKeyInput): string {
  return [
    input.alive ? 1 : 0,
    input.health,
    input.maxHealth,
    remainingSeconds(input.buffs.speedUntil, input.now),
    remainingSeconds(input.buffs.rapidFireUntil, input.now),
    remainingSeconds(input.buffs.shieldUntil, input.now),
    remainingSeconds(input.gunFrozenUntil, input.now),
  ].join(":");
}

export function getRemainingHits(status: PlayerStatus): number {
  if (!status.alive) {
    return 0;
  }

  return status.health + (status.buffs.shieldUntil > status.now ? 1 : 0);
}

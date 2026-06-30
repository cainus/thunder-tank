import type { ActiveBuffs, EnemyArchetype, MatchOutcome, PickupType, ScoreState, TankStats } from "./types";

export const PLAYER_BASE_STATS: TankStats = {
  speed: 210,
  fireCooldownMs: 420,
  bulletSpeed: 980,
  aimDelayMs: 0,
};

export const ENEMY_STATS: Record<EnemyArchetype, TankStats> = {
  light: {
    speed: 175,
    fireCooldownMs: 820,
    bulletSpeed: 800,
    aimDelayMs: 520,
  },
  standard: {
    speed: 145,
    fireCooldownMs: 700,
    bulletSpeed: 820,
    aimDelayMs: 430,
  },
  heavy: {
    speed: 105,
    fireCooldownMs: 960,
    bulletSpeed: 740,
    aimDelayMs: 620,
  },
  boss: {
    speed: 82,
    fireCooldownMs: 760,
    bulletSpeed: 780,
    aimDelayMs: 520,
  },
};

export const ENEMY_HEALTH: Record<EnemyArchetype, number> = {
  light: 1,
  standard: 1,
  heavy: 1,
  boss: 4,
};

export const EMPTY_BUFFS: ActiveBuffs = {
  speedUntil: 0,
  rapidFireUntil: 0,
  shieldUntil: 0,
};

export function getMatchOutcome(score: ScoreState, playerLimit: number, enemyLimit: number): MatchOutcome {
  if (score.player >= playerLimit) {
    return "won";
  }

  if (score.enemy >= enemyLimit) {
    return "lost";
  }

  return "playing";
}

export function applyPickupBuff(buffs: ActiveBuffs, pickup: PickupType, now: number): ActiveBuffs {
  const duration = pickup === "shield" ? 7_000 : 8_000;
  const next = { ...buffs };

  if (pickup === "speed") {
    next.speedUntil = now + duration;
  }

  if (pickup === "rapidFire") {
    next.rapidFireUntil = now + duration;
  }

  if (pickup === "shield") {
    next.shieldUntil = now + duration;
  }

  return next;
}

export function hasShield(buffs: ActiveBuffs, now: number): boolean {
  return buffs.shieldUntil > now;
}

export function getEffectiveStats(base: TankStats, buffs: ActiveBuffs, now: number): TankStats {
  return {
    ...base,
    speed: buffs.speedUntil > now ? base.speed * 1.35 : base.speed,
    fireCooldownMs: buffs.rapidFireUntil > now ? base.fireCooldownMs * 0.48 : base.fireCooldownMs,
  };
}

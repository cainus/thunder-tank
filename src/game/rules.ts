import type { ActiveBuffs, EnemyArchetype, MatchOutcome, PickupType, ScoreState, TankStats } from "./types";

// Matches PLAYER_TURRET_TURN_RATE in CampaignScene: the full rate a human-driven
// turret aims at. AI archetypes deliberately turn slower than this.
const PLAYER_TURRET_TURN_RATE = 4.1;

export const PLAYER_BASE_STATS: TankStats = {
  speed: 210,
  fireCooldownMs: 420,
  bulletSpeed: 980,
  aimDelayMs: 0,
  turretTurnRate: PLAYER_TURRET_TURN_RATE,
};

export const ENEMY_STATS: Record<EnemyArchetype, TankStats> = {
  light: {
    speed: 175,
    fireCooldownMs: 820,
    bulletSpeed: 800,
    aimDelayMs: 520,
    turretTurnRate: 2.4,
  },
  standard: {
    speed: 145,
    fireCooldownMs: 700,
    bulletSpeed: 820,
    aimDelayMs: 430,
    turretTurnRate: 2.1,
  },
  heavy: {
    speed: 105,
    fireCooldownMs: 960,
    bulletSpeed: 740,
    aimDelayMs: 620,
    turretTurnRate: 1.7,
  },
  boss: {
    speed: 82,
    fireCooldownMs: 760,
    bulletSpeed: 780,
    aimDelayMs: 520,
    turretTurnRate: 2.0,
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

// Campaign AI skill ramp: enemies get progressively faster, quicker to aim, and
// snappier shots as the player advances through the 20 authored maps. This is on
// top of the per-archetype base stats and the map-by-map count/archetype ramp.
export function getEnemyDifficulty(campaignMapNumber: number): number {
  const CAMPAIGN_LENGTH = 20;
  const progress = (campaignMapNumber - 1) / (CAMPAIGN_LENGTH - 1);
  return Math.max(0, Math.min(1, progress));
}

export function getRampedEnemyStats(base: TankStats, difficulty: number): TankStats {
  const clamped = Math.max(0, Math.min(1, difficulty));

  return {
    speed: base.speed * (1 + clamped * 0.2),
    fireCooldownMs: base.fireCooldownMs * (1 - clamped * 0.3),
    bulletSpeed: base.bulletSpeed * (1 + clamped * 0.12),
    aimDelayMs: Math.round(base.aimDelayMs * (1 - clamped * 0.5)),
    // Late-campaign enemies swing their turrets faster, but stay capped below the
    // player rate (max archetype 2.4 * 1.35 = 3.24 < 4.1).
    turretTurnRate: Math.min(base.turretTurnRate * (1 + clamped * 0.35), PLAYER_TURRET_TURN_RATE),
  };
}

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

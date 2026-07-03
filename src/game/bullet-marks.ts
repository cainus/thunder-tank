export type BulletMarkKind = "tank" | "obstacle" | "ground";

export const BULLET_MARK_LIFETIME_MS = 9_000;
export const BULLET_MARK_FADE_WINDOW_MS = 2_500;
export const BULLET_MARK_BASE_ALPHA = 0.42;
export const BULLET_MARK_MAX_COUNT = 96;

export function getBulletMarkAlpha(createdAt: number, now: number): number {
  const age = now - createdAt;

  if (age >= BULLET_MARK_LIFETIME_MS) {
    return 0;
  }

  const fadeStartsAt = BULLET_MARK_LIFETIME_MS - BULLET_MARK_FADE_WINDOW_MS;

  if (age <= fadeStartsAt) {
    return BULLET_MARK_BASE_ALPHA;
  }

  return BULLET_MARK_BASE_ALPHA * ((BULLET_MARK_LIFETIME_MS - age) / BULLET_MARK_FADE_WINDOW_MS);
}

export function isBulletMarkExpired(createdAt: number, now: number): boolean {
  return now - createdAt >= BULLET_MARK_LIFETIME_MS;
}

export function getBulletMarkScale(kind: BulletMarkKind): number {
  if (kind === "obstacle") {
    return 0.72;
  }

  if (kind === "tank") {
    return 0.6;
  }

  return 0.5;
}

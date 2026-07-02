import type { Vec2 } from "./types";

export const TREAD_MARK_LIFETIME_MS = 60_000;
export const TREAD_MARK_FADE_WINDOW_MS = 10_000;
export const TREAD_MARK_MIN_SPAWN_DISTANCE = 26;
export const TREAD_MARK_BASE_ALPHA = 0.34;

export function shouldSpawnTreadMark(lastPosition: Vec2 | undefined, currentPosition: Vec2): boolean {
  if (!lastPosition) {
    return true;
  }

  return Math.hypot(currentPosition.x - lastPosition.x, currentPosition.y - lastPosition.y) >= TREAD_MARK_MIN_SPAWN_DISTANCE;
}

export function getTreadMarkAlpha(createdAt: number, now: number): number {
  const age = now - createdAt;

  if (age >= TREAD_MARK_LIFETIME_MS) {
    return 0;
  }

  const fadeStartsAt = TREAD_MARK_LIFETIME_MS - TREAD_MARK_FADE_WINDOW_MS;

  if (age <= fadeStartsAt) {
    return TREAD_MARK_BASE_ALPHA;
  }

  return TREAD_MARK_BASE_ALPHA * ((TREAD_MARK_LIFETIME_MS - age) / TREAD_MARK_FADE_WINDOW_MS);
}

export function isTreadMarkExpired(createdAt: number, now: number): boolean {
  return now - createdAt >= TREAD_MARK_LIFETIME_MS;
}

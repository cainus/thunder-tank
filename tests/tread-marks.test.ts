import { describe, expect, it } from "vitest";
import {
  TREAD_MARK_BASE_ALPHA,
  TREAD_MARK_LIFETIME_MS,
  TREAD_MARK_MIN_SPAWN_DISTANCE,
  getTreadMarkAlpha,
  isTreadMarkExpired,
  shouldSpawnTreadMark,
} from "../src/game/tread-marks";

describe("tread mark helpers", () => {
  it("spawns immediately when a tank has no previous tread mark position", () => {
    expect(shouldSpawnTreadMark(undefined, { x: 100, y: 100 })).toBe(true);
  });

  it("waits until the tank has moved far enough before spawning another tread mark", () => {
    expect(shouldSpawnTreadMark({ x: 0, y: 0 }, { x: TREAD_MARK_MIN_SPAWN_DISTANCE - 1, y: 0 })).toBe(false);
    expect(shouldSpawnTreadMark({ x: 0, y: 0 }, { x: TREAD_MARK_MIN_SPAWN_DISTANCE, y: 0 })).toBe(true);
  });

  it("keeps marks visible until the fade window and removes them after one minute", () => {
    expect(getTreadMarkAlpha(0, 0)).toBe(TREAD_MARK_BASE_ALPHA);
    expect(getTreadMarkAlpha(0, TREAD_MARK_LIFETIME_MS - 10_001)).toBe(TREAD_MARK_BASE_ALPHA);
    expect(getTreadMarkAlpha(0, TREAD_MARK_LIFETIME_MS - 5_000)).toBeCloseTo(TREAD_MARK_BASE_ALPHA * 0.5, 5);
    expect(getTreadMarkAlpha(0, TREAD_MARK_LIFETIME_MS)).toBe(0);
    expect(isTreadMarkExpired(0, TREAD_MARK_LIFETIME_MS - 1)).toBe(false);
    expect(isTreadMarkExpired(0, TREAD_MARK_LIFETIME_MS)).toBe(true);
  });
});

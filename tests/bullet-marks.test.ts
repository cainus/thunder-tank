import { describe, expect, it } from "vitest";
import {
  BULLET_MARK_BASE_ALPHA,
  BULLET_MARK_LIFETIME_MS,
  getBulletMarkAlpha,
  getBulletMarkScale,
  isBulletMarkExpired,
} from "../src/game/bullet-marks";

describe("bullet mark helpers", () => {
  it("keeps marks at full alpha until the fade window begins", () => {
    expect(getBulletMarkAlpha(0, 0)).toBe(BULLET_MARK_BASE_ALPHA);
    expect(getBulletMarkAlpha(0, BULLET_MARK_LIFETIME_MS - 2_501)).toBe(BULLET_MARK_BASE_ALPHA);
  });

  it("fades marks linearly during the fade window and removes them after their lifetime", () => {
    expect(getBulletMarkAlpha(0, BULLET_MARK_LIFETIME_MS - 1_250)).toBeCloseTo(BULLET_MARK_BASE_ALPHA * 0.5, 5);
    expect(getBulletMarkAlpha(0, BULLET_MARK_LIFETIME_MS)).toBe(0);
    expect(getBulletMarkAlpha(0, BULLET_MARK_LIFETIME_MS + 5_000)).toBe(0);
  });

  it("reports expiry only once the full lifetime has elapsed", () => {
    expect(isBulletMarkExpired(0, BULLET_MARK_LIFETIME_MS - 1)).toBe(false);
    expect(isBulletMarkExpired(0, BULLET_MARK_LIFETIME_MS)).toBe(true);
  });

  it("gives each surface kind a distinct scorch size", () => {
    expect(getBulletMarkScale("obstacle")).toBeGreaterThan(getBulletMarkScale("tank"));
    expect(getBulletMarkScale("tank")).toBeGreaterThan(getBulletMarkScale("ground"));
  });
});

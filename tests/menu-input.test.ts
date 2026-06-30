import { describe, expect, it } from "vitest";
import type { MinimalGamepad } from "../src/gamepad-config";
import { isMenuBackPressed, isMenuConfirmPressed } from "../src/menu-input";

function gamepadWithPressedButtons(...pressedIndexes: number[]): MinimalGamepad {
  return {
    axes: [],
    buttons: Array.from({ length: 10 }, (_, index) => ({
      pressed: pressedIndexes.includes(index),
    })),
  };
}

describe("menu gamepad input", () => {
  it("uses Start, not A, for menu confirmation", () => {
    expect(isMenuConfirmPressed(gamepadWithPressedButtons(9))).toBe(true);
    expect(isMenuConfirmPressed(gamepadWithPressedButtons(0))).toBe(false);
  });

  it("can include fire for map-cleared confirmation", () => {
    expect(isMenuConfirmPressed(gamepadWithPressedButtons(0), undefined, { includeFire: true })).toBe(true);
  });

  it("does not use gamepad B or Back for menu back/pause", () => {
    expect(isMenuBackPressed(gamepadWithPressedButtons(1))).toBe(false);
    expect(isMenuBackPressed(gamepadWithPressedButtons(8))).toBe(false);
  });
});

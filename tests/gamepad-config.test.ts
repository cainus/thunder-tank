import { describe, expect, it } from "vitest";
import {
  DEFAULT_GAMEPAD_MAPPING,
  EIGHTBITDO_PRO2_FIREFOX_MAPPING,
  detectMovedAxis,
  detectMovedAxisFromNeutral,
  getGamepadPreset,
  detectPressedButton,
  isGamepadButtonPressed,
  isBindableStickAxis,
  isLikelyTriggerAxisNeutral,
  loadGamepadMapping,
  readAim,
  readDrive,
  type MinimalGamepad,
} from "../src/gamepad-config";

function gamepad({
  axes = [],
  buttons = [],
  buttonValues = {},
}: {
  axes?: number[];
  buttons?: number[];
  buttonValues?: Record<number, number>;
}): MinimalGamepad {
  return {
    axes,
    buttons: Array.from({ length: 12 }, (_, index) => ({
      pressed: buttons.includes(index),
      value: buttonValues[index] ?? (buttons.includes(index) ? 1 : 0),
    })),
  };
}

describe("gamepad mapping", () => {
  it("reads default tank controls from the standard mapping", () => {
    const pad = gamepad({ axes: [0.7, -0.8, 0.4, 0.5] });

    expect(readDrive(pad, DEFAULT_GAMEPAD_MAPPING)).toEqual({ throttle: 0.8, turn: 0.7 });
    expect(readAim(pad, DEFAULT_GAMEPAD_MAPPING)).toEqual({ x: 0.4, y: 0.5 });
  });

  it("detects the actively pressed button", () => {
    expect(detectPressedButton(gamepad({ buttons: [6] }))).toEqual({
      button: 6,
      neutralPressed: false,
      neutralValue: 0,
    });
  });

  it("does not treat a resting analog button value as a press when captured as neutral", () => {
    expect(
      isGamepadButtonPressed(gamepad({ buttonValues: { 7: 0.8 } }), {
        button: 7,
        neutralValue: 0.8,
        neutralPressed: false,
      }),
    ).toBe(false);
    expect(
      isGamepadButtonPressed(gamepad({ buttonValues: { 7: 1 } }), {
        button: 7,
        neutralValue: 0.1,
        neutralPressed: false,
      }),
    ).toBe(true);
  });

  it("detects moved axes with their direction", () => {
    expect(detectMovedAxis(gamepad({ axes: [0.1, -0.9, 0.2] }))).toEqual({ axis: 1, direction: -1, neutral: 0 });
    expect(detectMovedAxis(gamepad({ axes: [0.1, 0.2, 0.85] }))).toEqual({ axis: 2, direction: 1, neutral: 0 });
  });

  it("subtracts captured neutral values before applying the deadzone", () => {
    const mapping = {
      ...DEFAULT_GAMEPAD_MAPPING,
      drive: { axis: 1, direction: -1 as const, neutral: 0.24 },
      turn: { axis: 0, direction: 1 as const, neutral: -0.22 },
    };

    expect(readDrive(gamepad({ axes: [-0.2, 0.21] }), mapping)).toEqual({ throttle: 0, turn: 0 });
    expect(readDrive(gamepad({ axes: [0.65, -0.75] }), mapping)).toEqual({ throttle: 0.99, turn: 0.87 });
  });

  it("does not auto-capture a resting trigger axis when no neutral sample exists", () => {
    expect(detectMovedAxisFromNeutral(gamepad({ axes: [0, 0, 0, 0, 0, -1] }), [])).toBeUndefined();
    expect(detectMovedAxisFromNeutral(gamepad({ axes: [0, 0, 0, 0, 0, -1] }), [0, 0, 0, 0, 0, -1])).toBeUndefined();
    expect(isLikelyTriggerAxisNeutral(-1)).toBe(true);
    expect(isLikelyTriggerAxisNeutral(0)).toBe(false);
    expect(isBindableStickAxis(5)).toBe(false);
  });

  it("sanitizes saved trigger axes back to the standard movement defaults", () => {
    localStorage.setItem(
      "thunder-tank.gamepadMapping.v1",
      JSON.stringify({
        ...DEFAULT_GAMEPAD_MAPPING,
        drive: { axis: 5, direction: -1, neutral: -1 },
      }),
    );

    expect(loadGamepadMapping().drive).toEqual(DEFAULT_GAMEPAD_MAPPING.drive);
  });

  it("ignores bad in-memory trigger-axis mappings during gameplay reads", () => {
    const badMapping = {
      ...DEFAULT_GAMEPAD_MAPPING,
      drive: { axis: 5, direction: 1 as const, neutral: 0 },
      turn: { axis: 6, direction: 1 as const, neutral: 0 },
    };

    expect(readDrive(gamepad({ axes: [0, -0.8, 0, 0, 0, 1, 1] }), badMapping)).toEqual({
      throttle: 0.8,
      turn: 0,
    });
  });

  it("selects the 8BitDo Pro 2 Firefox direct-input preset", () => {
    const preset = getGamepadPreset({
      id: "2dc8-6006-8BitDo Pro 2",
      mapping: "",
      axes: [-1, 0, 0, 0, 0, 0, 0],
      buttons: [],
    });

    expect(preset?.id).toBe("8bitdo-pro-2-firefox-directinput");
    expect(preset?.mapping.start.button).toBe(11);
    expect(preset?.mapping.fire.button).toBe(9);
  });

  it("reads the captured 8BitDo Pro 2 movement hat values", () => {
    expect(readDrive(gamepad({ axes: [-1, 0, 0, 0, 0, 0, 0] }), EIGHTBITDO_PRO2_FIREFOX_MAPPING)).toEqual({
      throttle: 1,
      turn: 0,
    });
    expect(readDrive(gamepad({ axes: [1 / 7, 0, 0, 0, 0, 0, 0] }), EIGHTBITDO_PRO2_FIREFOX_MAPPING)).toEqual({
      throttle: -1,
      turn: 0,
    });
    expect(readDrive(gamepad({ axes: [5 / 7, 0, 0, 0, 0, 0, 0] }), EIGHTBITDO_PRO2_FIREFOX_MAPPING)).toEqual({
      throttle: 0,
      turn: -1,
    });
    expect(readDrive(gamepad({ axes: [-3 / 7, 0, 0, 0, 0, 0, 0] }), EIGHTBITDO_PRO2_FIREFOX_MAPPING)).toEqual({
      throttle: 0,
      turn: 1,
    });
  });

  it("reads diagonal 8BitDo Pro 2 hat values as drive plus turn", () => {
    expect(readDrive(gamepad({ axes: [-5 / 7, 0, 0, 0, 0, 0, 0] }), EIGHTBITDO_PRO2_FIREFOX_MAPPING)).toEqual({
      throttle: 1,
      turn: 1,
    });
    expect(readDrive(gamepad({ axes: [1, 0, 0, 0, 0, 0, 0] }), EIGHTBITDO_PRO2_FIREFOX_MAPPING)).toEqual({
      throttle: 1,
      turn: -1,
    });
    expect(readDrive(gamepad({ axes: [-1 / 7, 0, 0, 0, 0, 0, 0] }), EIGHTBITDO_PRO2_FIREFOX_MAPPING)).toEqual({
      throttle: -1,
      turn: 1,
    });
    expect(readDrive(gamepad({ axes: [3 / 7, 0, 0, 0, 0, 0, 0] }), EIGHTBITDO_PRO2_FIREFOX_MAPPING)).toEqual({
      throttle: -1,
      turn: -1,
    });
  });

  it("reads 8BitDo Pro 2 aim and ignores the out-of-range hat axis while firing", () => {
    expect(readAim(gamepad({ axes: [23 / 7, 0, 0, 1, 0, 0, 0] }), EIGHTBITDO_PRO2_FIREFOX_MAPPING)).toEqual({
      x: 1,
      y: 0,
    });
    expect(readAim(gamepad({ axes: [23 / 7, 0, 0, 0, 1, 0, 0] }), EIGHTBITDO_PRO2_FIREFOX_MAPPING)).toEqual({
      x: 0,
      y: 1,
    });
    expect(readDrive(gamepad({ axes: [23 / 7, 0, 0, 0, 0, 1, 0] }), EIGHTBITDO_PRO2_FIREFOX_MAPPING)).toEqual({
      throttle: 0,
      turn: 0,
    });
    expect(isGamepadButtonPressed(gamepad({ buttons: [9] }), EIGHTBITDO_PRO2_FIREFOX_MAPPING.fire)).toBe(true);
    expect(isGamepadButtonPressed(gamepad({ buttons: [11] }), EIGHTBITDO_PRO2_FIREFOX_MAPPING.start)).toBe(true);
  });
});

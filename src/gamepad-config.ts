export interface MinimalGamepadButton {
  pressed: boolean;
  value?: number;
}

export interface MinimalGamepad {
  axes: ReadonlyArray<number>;
  buttons: ReadonlyArray<MinimalGamepadButton>;
}

export interface AxisBinding {
  axis: number;
  direction: 1 | -1;
  neutral: number;
  positiveValue?: number;
  negativeValue?: number;
  valueMap?: Record<string, number>;
}

export interface ButtonBinding {
  button: number;
  neutralValue: number;
  neutralPressed: boolean;
}

export interface GamepadMapping {
  start: ButtonBinding;
  fire: ButtonBinding;
  drive: AxisBinding;
  turn: AxisBinding;
  aimX: AxisBinding;
  aimY: AxisBinding;
}

export const DEFAULT_GAMEPAD_MAPPING: GamepadMapping = {
  start: { button: 9, neutralValue: 0, neutralPressed: false },
  fire: { button: 0, neutralValue: 0, neutralPressed: false },
  drive: { axis: 1, direction: -1, neutral: 0 },
  turn: { axis: 0, direction: 1, neutral: 0 },
  aimX: { axis: 2, direction: 1, neutral: 0 },
  aimY: { axis: 3, direction: 1, neutral: 0 },
};

const STORAGE_KEY = "thunder-tank.gamepadMapping.v1";
const DEADZONE = 0.16;
const BUTTON_PRESS_THRESHOLD = 0.72;
const TRIGGER_AXIS_NEUTRAL_THRESHOLD = 0.5;
const MAX_STICK_AXIS_INDEX = 4;
const HAT_VALUE_TOLERANCE = 0.08;
const AXIS_VALUE_LIMIT = 1;

export const EIGHTBITDO_PRO2_FIREFOX_MAPPING: GamepadMapping = {
  start: { button: 11, neutralValue: 0, neutralPressed: false },
  fire: { button: 9, neutralValue: 0, neutralPressed: false },
  drive: {
    axis: 0,
    direction: 1,
    neutral: 0,
    positiveValue: -1,
    negativeValue: 1 / 7,
    valueMap: {
      "-1": 1,
      "-0.714286": 1,
      "1": 1,
      "-0.142857": -1,
      "0.142857": -1,
      "0.428571": -1,
    },
  },
  turn: {
    axis: 0,
    direction: 1,
    neutral: 0,
    positiveValue: -3 / 7,
    negativeValue: 5 / 7,
    valueMap: {
      "-0.714286": 1,
      "-0.428571": 1,
      "-0.142857": 1,
      "0.428571": -1,
      "0.714286": -1,
      "1": -1,
    },
  },
  aimX: { axis: 3, direction: 1, neutral: 0 },
  aimY: { axis: 4, direction: 1, neutral: 0 },
};

export function getGamepadPreset(
  gamepad: Pick<MinimalGamepad, "axes" | "buttons"> & { id?: string; mapping?: string } | null | undefined,
): { id: string; mapping: GamepadMapping } | undefined {
  if (!gamepad?.id) {
    return undefined;
  }

  if (gamepad.id.includes("8BitDo Pro 2") && gamepad.mapping === "") {
    return {
      id: "8bitdo-pro-2-firefox-directinput",
      mapping: EIGHTBITDO_PRO2_FIREFOX_MAPPING,
    };
  }

  return undefined;
}

export function loadGamepadMapping(): GamepadMapping {
  if (typeof localStorage === "undefined") {
    return DEFAULT_GAMEPAD_MAPPING;
  }

  const serialized = localStorage.getItem(STORAGE_KEY);

  if (!serialized) {
    return DEFAULT_GAMEPAD_MAPPING;
  }

  try {
    return normalizeMapping(JSON.parse(serialized));
  } catch {
    return DEFAULT_GAMEPAD_MAPPING;
  }
}

export function saveGamepadMapping(mapping: GamepadMapping): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mapping));
}

export function resetGamepadMapping(): GamepadMapping {
  localStorage.removeItem(STORAGE_KEY);
  return DEFAULT_GAMEPAD_MAPPING;
}

export function isGamepadButtonPressed(
  gamepad: MinimalGamepad | null | undefined,
  binding: ButtonBinding,
): boolean {
  const button = gamepad?.buttons[binding.button];
  const value = button?.value ?? 0;
  const valueDelta = value - binding.neutralValue;
  const pressedDelta = Boolean(button?.pressed && !binding.neutralPressed);
  return Boolean(pressedDelta || valueDelta > BUTTON_PRESS_THRESHOLD);
}

export function readAxis(gamepad: MinimalGamepad | null | undefined, binding: AxisBinding): number {
  if (!isBindableAxis(binding.axis) || isLikelyTriggerAxisNeutral(binding.neutral)) {
    return 0;
  }

  const rawValue = gamepad?.axes[binding.axis] ?? 0;

  const mappedValue = readMappedAxisValue(rawValue, binding);

  if (mappedValue !== undefined) {
    return mappedValue * binding.direction;
  }

  if (hasDiscreteAxisValues(binding)) {
    if (matchesAxisValue(rawValue, binding.positiveValue)) {
      return binding.direction;
    }

    if (matchesAxisValue(rawValue, binding.negativeValue)) {
      return -binding.direction;
    }

    return 0;
  }

  const sanitizedValue = sanitizeAxisValue(rawValue);
  const value = (sanitizedValue - binding.neutral) * binding.direction;
  return Math.abs(value) > DEADZONE ? value : 0;
}

export function readDrive(gamepad: MinimalGamepad | null | undefined, mapping: GamepadMapping): {
  throttle: number;
  turn: number;
} {
  return {
    throttle: clamp(readAxis(gamepad, sanitizeAxisBinding(mapping.drive, DEFAULT_GAMEPAD_MAPPING.drive))),
    turn: clamp(readAxis(gamepad, sanitizeAxisBinding(mapping.turn, DEFAULT_GAMEPAD_MAPPING.turn))),
  };
}

export function readAim(gamepad: MinimalGamepad | null | undefined, mapping: GamepadMapping): {
  x: number;
  y: number;
} {
  return normalize({
    x: readAxis(gamepad, sanitizeAxisBinding(mapping.aimX, DEFAULT_GAMEPAD_MAPPING.aimX)),
    y: readAxis(gamepad, sanitizeAxisBinding(mapping.aimY, DEFAULT_GAMEPAD_MAPPING.aimY)),
  });
}

export function detectPressedButton(
  gamepad: MinimalGamepad | null | undefined,
  ignoredButtons: ReadonlySet<number> = new Set(),
): ButtonBinding | undefined {
  return detectPressedButtonFromNeutral(gamepad, [], ignoredButtons);
}

export function detectPressedButtonFromNeutral(
  gamepad: MinimalGamepad | null | undefined,
  neutralButtons: ReadonlyArray<{ value: number; pressed: boolean }>,
  ignoredButtons: ReadonlySet<number> = new Set(),
): ButtonBinding | undefined {
  if (!gamepad) {
    return undefined;
  }

  for (let index = 0; index < gamepad.buttons.length; index += 1) {
    const button = gamepad.buttons[index];
    const neutral = neutralButtons[index] ?? { value: 0, pressed: false };
    const valueDelta = (button.value ?? 0) - neutral.value;
    const pressedDelta = button.pressed && !neutral.pressed;

    if (!ignoredButtons.has(index) && (pressedDelta || valueDelta > BUTTON_PRESS_THRESHOLD)) {
      return { button: index, neutralValue: neutral.value, neutralPressed: neutral.pressed };
    }
  }

  return undefined;
}

export function detectMovedAxis(
  gamepad: MinimalGamepad | null | undefined,
  ignoredAxes: ReadonlySet<number> = new Set(),
): AxisBinding | undefined {
  if (!gamepad) {
    return undefined;
  }

  let strongestAxis = -1;
  let strongestValue = 0;

  for (let index = 0; index < gamepad.axes.length; index += 1) {
    const value = gamepad.axes[index] ?? 0;

    if (!ignoredAxes.has(index) && Math.abs(value) > Math.abs(strongestValue)) {
      strongestAxis = index;
      strongestValue = value;
    }
  }

  if (strongestAxis < 0 || Math.abs(strongestValue) < 0.55) {
    return undefined;
  }

  return {
    axis: strongestAxis,
    direction: strongestValue > 0 ? 1 : -1,
    neutral: 0,
  };
}

export function detectMovedAxisFromNeutral(
  gamepad: MinimalGamepad | null | undefined,
  neutralAxes: ReadonlyArray<number>,
  ignoredAxes: ReadonlySet<number> = new Set(),
): AxisBinding | undefined {
  if (!gamepad) {
    return undefined;
  }

  let strongestAxis = -1;
  let strongestDelta = 0;

  for (let index = 0; index < gamepad.axes.length; index += 1) {
    const neutral = neutralAxes[index];

    if (!isBindableStickAxis(index) || !Number.isFinite(neutral) || isLikelyTriggerAxisNeutral(neutral)) {
      continue;
    }

    const rawValue = gamepad.axes[index] ?? 0;

    if (!isNormalAxisValue(rawValue)) {
      continue;
    }

    const delta = rawValue - neutral;

    if (!ignoredAxes.has(index) && Math.abs(delta) > Math.abs(strongestDelta)) {
      strongestAxis = index;
      strongestDelta = delta;
    }
  }

  if (strongestAxis < 0 || Math.abs(strongestDelta) < 0.55) {
    return undefined;
  }

  return {
    axis: strongestAxis,
    direction: strongestDelta > 0 ? 1 : -1,
    neutral: neutralAxes[strongestAxis],
  };
}

export function captureNeutralAxes(gamepad: MinimalGamepad | null | undefined): number[] {
  return [...(gamepad?.axes ?? [])];
}

export function captureNeutralButtons(gamepad: MinimalGamepad | null | undefined): Array<{ value: number; pressed: boolean }> {
  return [...(gamepad?.buttons ?? [])].map((button) => ({
    value: button.value ?? 0,
    pressed: button.pressed,
  }));
}

function normalizeMapping(value: unknown): GamepadMapping {
  const candidate = value as Partial<GamepadMapping>;
  return {
    start: normalizeButton(candidate.start, DEFAULT_GAMEPAD_MAPPING.start),
    fire: normalizeButton(candidate.fire, DEFAULT_GAMEPAD_MAPPING.fire),
    drive: normalizeAxis(candidate.drive, DEFAULT_GAMEPAD_MAPPING.drive),
    turn: normalizeAxis(candidate.turn, DEFAULT_GAMEPAD_MAPPING.turn),
    aimX: normalizeAxis(candidate.aimX, DEFAULT_GAMEPAD_MAPPING.aimX),
    aimY: normalizeAxis(candidate.aimY, DEFAULT_GAMEPAD_MAPPING.aimY),
  };
}

function normalizeButton(value: unknown, fallback: ButtonBinding): ButtonBinding {
  const candidate = value as Partial<ButtonBinding>;
  return Number.isInteger(candidate?.button)
    ? {
        button: candidate.button!,
        neutralValue: Number(candidate.neutralValue ?? 0),
        neutralPressed: Boolean(candidate.neutralPressed),
      }
    : fallback;
}

function normalizeAxis(value: unknown, fallback: AxisBinding): AxisBinding {
  const candidate = value as Partial<AxisBinding>;
  const binding =
    Number.isInteger(candidate?.axis) && (candidate.direction === 1 || candidate.direction === -1)
      ? {
          axis: candidate.axis!,
          direction: candidate.direction,
          neutral: Number(candidate.neutral ?? 0),
          positiveValue: normalizeDiscreteAxisValue(candidate.positiveValue),
          negativeValue: normalizeDiscreteAxisValue(candidate.negativeValue),
          valueMap: normalizeValueMap(candidate.valueMap),
        }
      : fallback;

  return sanitizeAxisBinding(binding, fallback);
}

export function isLikelyTriggerAxisNeutral(neutral: number): boolean {
  return Math.abs(neutral) > TRIGGER_AXIS_NEUTRAL_THRESHOLD;
}

export function isBindableStickAxis(axis: number): boolean {
  return Number.isInteger(axis) && axis >= 0 && axis <= MAX_STICK_AXIS_INDEX;
}

function sanitizeAxisBinding(binding: AxisBinding, fallback: AxisBinding): AxisBinding {
  const hasDiscreteValues = hasDiscreteAxisValues(binding);

  if (
    !isBindableAxis(binding.axis) ||
    (!hasDiscreteValues && !isBindableStickAxis(binding.axis)) ||
    isLikelyTriggerAxisNeutral(binding.neutral)
  ) {
    return fallback;
  }

  return binding;
}

function isBindableAxis(axis: number): boolean {
  return Number.isInteger(axis) && axis >= 0;
}

function hasDiscreteAxisValues(binding: AxisBinding): boolean {
  return Number.isFinite(binding.positiveValue) || Number.isFinite(binding.negativeValue) || Boolean(binding.valueMap);
}

function matchesAxisValue(rawValue: number, targetValue: number | undefined): boolean {
  return typeof targetValue === "number" && Number.isFinite(rawValue) && Math.abs(rawValue - targetValue) <= HAT_VALUE_TOLERANCE;
}

function readMappedAxisValue(rawValue: number, binding: AxisBinding): number | undefined {
  if (!binding.valueMap || !Number.isFinite(rawValue)) {
    return undefined;
  }

  for (const [key, mappedValue] of Object.entries(binding.valueMap)) {
    if (matchesAxisValue(rawValue, Number(key))) {
      return mappedValue;
    }
  }

  return undefined;
}

function normalizeDiscreteAxisValue(value: unknown): number | undefined {
  return Number.isFinite(value) ? Number(value) : undefined;
}

function normalizeValueMap(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const entries = Object.entries(value).filter((entry): entry is [string, number] => Number.isFinite(entry[1]));
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function sanitizeAxisValue(value: number): number {
  if (!isNormalAxisValue(value)) {
    return 0;
  }

  return clamp(value);
}

function isNormalAxisValue(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= AXIS_VALUE_LIMIT;
}

function clamp(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function normalize(vector: { x: number; y: number }): { x: number; y: number } {
  const length = Math.hypot(vector.x, vector.y);

  if (length <= 1) {
    return vector;
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}

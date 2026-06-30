import { DEFAULT_GAMEPAD_MAPPING, isGamepadButtonPressed, type GamepadMapping, type MinimalGamepad } from "./gamepad-config";

export function isMenuConfirmPressed(
  gamepad: MinimalGamepad | null | undefined,
  mapping: GamepadMapping = DEFAULT_GAMEPAD_MAPPING,
  options: { includeFire?: boolean } = {},
): boolean {
  return isGamepadButtonPressed(gamepad, mapping.start) || Boolean(options.includeFire && isGamepadButtonPressed(gamepad, mapping.fire));
}

export function isMenuBackPressed(gamepad: MinimalGamepad | null | undefined): boolean {
  void gamepad;
  return false;
}

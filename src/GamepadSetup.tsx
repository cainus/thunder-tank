import { useEffect, useMemo, useState } from "react";
import {
  captureNeutralAxes,
  captureNeutralButtons,
  detectMovedAxisFromNeutral,
  detectPressedButtonFromNeutral,
  isGamepadButtonPressed,
  isBindableStickAxis,
  isLikelyTriggerAxisNeutral,
  readAim,
  readDrive,
  resetGamepadMapping,
  saveGamepadMapping,
  type AxisBinding,
  type ButtonBinding,
  type GamepadMapping,
} from "./gamepad-config";

type StepKey = "start" | "fire" | "drive" | "turn" | "aimX" | "aimY";

interface CalibrationStep {
  key: StepKey;
  title: string;
  instruction: string;
  type: "button" | "axis";
}

const STEPS: CalibrationStep[] = [
  {
    key: "start",
    title: "Start Button",
    instruction: "Press the button you want to use for start, pause, resume, and menu select.",
    type: "button",
  },
  {
    key: "fire",
    title: "Fire Button",
    instruction: "Press the button or trigger you want to use for firing.",
    type: "button",
  },
  {
    key: "drive",
    title: "Drive Forward",
    instruction: "Push the drive stick forward and hold it for a moment.",
    type: "axis",
  },
  {
    key: "turn",
    title: "Turn Right",
    instruction: "Push the turning stick to the right and hold it for a moment.",
    type: "axis",
  },
  {
    key: "aimX",
    title: "Turret Aim Right",
    instruction: "Push the turret aiming stick to the right and hold it for a moment.",
    type: "axis",
  },
  {
    key: "aimY",
    title: "Turret Aim Down",
    instruction: "Push the turret aiming stick down and hold it for a moment.",
    type: "axis",
  },
];

interface GamepadSetupProps {
  initialMapping: GamepadMapping;
  onCancel: () => void;
  onSave: (mapping: GamepadMapping) => void;
}

export function GamepadSetup({ initialMapping, onCancel, onSave }: GamepadSetupProps) {
  const [mapping, setMapping] = useState<GamepadMapping>(initialMapping);
  const [selectedKey, setSelectedKey] = useState<StepKey | null>(null);
  const [neutralAxes, setNeutralAxes] = useState<number[]>(() => getNeutralAxes(initialMapping));
  const [neutralButtons, setNeutralButtons] = useState<Array<{ value: number; pressed: boolean }>>(() =>
    getNeutralButtons(initialMapping),
  );
  const [liveState, setLiveState] = useState<{ axes: number[]; buttons: Array<{ value: number; pressed: boolean }> }>({
    axes: [],
    buttons: [],
  });
  const [message, setMessage] = useState("Select a binding, then press or move the control you want to use.");
  const selectedStep = selectedKey ? STEPS.find((step) => step.key === selectedKey)! : undefined;
  const preview = useMemo(() => {
    const gamepad = liveState.axes.length || liveState.buttons.length ? liveState : undefined;
    const drive = readDrive(gamepad, mapping);
    const aim = readAim(gamepad, mapping);

    return {
      throttle: drive.throttle,
      turn: drive.turn,
      aimX: aim.x,
      aimY: aim.y,
      start: isGamepadButtonPressed(gamepad, mapping.start),
      fire: isGamepadButtonPressed(gamepad, mapping.fire),
    };
  }, [liveState, mapping]);
  const ignoredButtons = useMemo(() => {
    const ignored = new Set<number>();

    if (selectedKey !== "start") {
      ignored.add(mapping.start.button);
    }

    if (selectedKey !== "fire") {
      ignored.add(mapping.fire.button);
    }

    return ignored;
  }, [mapping.fire.button, mapping.start.button, selectedKey]);
  const ignoredAxes = useMemo(() => {
    const ignored = new Set<number>();

    for (const key of ["drive", "turn", "aimX", "aimY"] as const) {
      if (selectedKey !== key) {
        ignored.add(mapping[key].axis);
      }
    }

    return ignored;
  }, [mapping, selectedKey]);

  useEffect(() => {
    let frame = 0;

    const poll = () => {
      const gamepad = navigator.getGamepads?.()[0];
      setLiveState({
        axes: [...(gamepad?.axes ?? [])],
        buttons: [...(gamepad?.buttons ?? [])].map((button) => ({
          value: button.value ?? 0,
          pressed: button.pressed,
        })),
      });
      frame = requestAnimationFrame(poll);
    };

    frame = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!selectedStep) {
      return;
    }

    let frame = 0;
    let armedAt = performance.now() + 450;

    const poll = () => {
      const gamepad = navigator.getGamepads?.()[0];

      if (!gamepad) {
        setMessage("No controller detected. Press a controller button or reconnect it.");
        frame = requestAnimationFrame(poll);
        return;
      }

      if (performance.now() < armedAt) {
        frame = requestAnimationFrame(poll);
        return;
      }

      const detected =
        selectedStep.type === "button"
          ? detectPressedButtonFromNeutral(gamepad, neutralButtons, ignoredButtons)
          : detectMovedAxisFromNeutral(gamepad, neutralAxes, ignoredAxes);

      if (detected) {
        if ("axis" in detected && (!isBindableStickAxis(detected.axis) || isLikelyTriggerAxisNeutral(detected.neutral))) {
          setMessage(
            `${selectedStep.title}: ignored axis ${detected.axis} because it is not a stick axis. Use axes 0-3 from a stick.`,
          );
          frame = requestAnimationFrame(poll);
          return;
        }

        setMapping((current) => applyStep(current, selectedStep.key, detected));
        setSelectedKey(null);
        setMessage(`${selectedStep.title}: ${describeDetected(detected)}`);
        armedAt = performance.now() + 700;
      }

      frame = requestAnimationFrame(poll);
    };

    frame = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(frame);
  }, [ignoredAxes, ignoredButtons, neutralAxes, neutralButtons, selectedStep]);

  function handleSave(): void {
    saveGamepadMapping(mapping);
    onSave(mapping);
  }

  function handleReset(): void {
    const next = resetGamepadMapping();
    setMapping(next);
    setSelectedKey(null);
    setNeutralAxes([]);
    setNeutralButtons([]);
    setMessage("Reset to default mapping. Select any binding to change it, or save defaults.");
  }

  function handleStandardPreset(): void {
    const gamepad = navigator.getGamepads?.()[0];
    const axes = captureNeutralAxes(gamepad);
    const buttons = captureNeutralButtons(gamepad);
    const next: GamepadMapping = {
      start: {
        button: 9,
        neutralValue: buttons[9]?.value ?? 0,
        neutralPressed: buttons[9]?.pressed ?? false,
      },
      fire: {
        button: 0,
        neutralValue: buttons[0]?.value ?? 0,
        neutralPressed: buttons[0]?.pressed ?? false,
      },
      drive: { axis: 1, direction: -1, neutral: sanitizeStickNeutral(axes[1]) },
      turn: { axis: 0, direction: 1, neutral: sanitizeStickNeutral(axes[0]) },
      aimX: { axis: 2, direction: 1, neutral: sanitizeStickNeutral(axes[2]) },
      aimY: { axis: 3, direction: 1, neutral: sanitizeStickNeutral(axes[3]) },
    };

    setMapping(next);
    setNeutralAxes(getNeutralAxes(next));
    setNeutralButtons(getNeutralButtons(next));
    setSelectedKey(null);
    setMessage("Standard stick preset applied. Use the preview, invert if needed, then Save Mapping.");
  }

  function handleCaptureNeutral(): void {
    if (captureCurrentNeutral()) {
      setMessage("Neutral captured. Now select a binding to configure.");
    }
  }

  function captureCurrentNeutral(): boolean {
    const gamepad = navigator.getGamepads?.()[0];

    if (!gamepad) {
      setMessage("No controller detected. Connect it, release all controls, then capture neutral.");
      return false;
    }

    const neutral = captureNeutralAxes(gamepad);
    const buttonNeutral = captureNeutralButtons(gamepad);
    setNeutralAxes(neutral);
    setNeutralButtons(buttonNeutral);
    setMapping((current) => ({
      ...current,
      start: {
        ...current.start,
        neutralValue: buttonNeutral[current.start.button]?.value ?? 0,
        neutralPressed: buttonNeutral[current.start.button]?.pressed ?? false,
      },
      fire: {
        ...current.fire,
        neutralValue: buttonNeutral[current.fire.button]?.value ?? 0,
        neutralPressed: buttonNeutral[current.fire.button]?.pressed ?? false,
      },
      drive: { ...current.drive, neutral: neutral[current.drive.axis] ?? 0 },
      turn: { ...current.turn, neutral: neutral[current.turn.axis] ?? 0 },
      aimX: { ...current.aimX, neutral: neutral[current.aimX.axis] ?? 0 },
      aimY: { ...current.aimY, neutral: neutral[current.aimY.axis] ?? 0 },
    }));
    return true;
  }

  return (
    <section className="setup-panel" aria-live="polite">
      <p className="eyebrow">Controller Setup</p>
      <h1>{selectedStep ? selectedStep.title : "Bindings"}</h1>
      <p className="menu-copy">
        {selectedStep ? selectedStep.instruction : "Choose a binding below, then press or move the control you want assigned."}
      </p>
      <p className="setup-message">{message}</p>
      <button type="button" className="secondary-button neutral-button" onClick={handleCaptureNeutral}>
        Capture Neutral
      </button>
      {selectedStep && <div className="setup-progress">Waiting for {selectedStep.type === "button" ? "button" : "axis"} input</div>}
      <div className="binding-list">
        {STEPS.map((step) => (
          <button
            key={step.key}
            type="button"
            className={selectedKey === step.key ? "binding-row is-selected" : "binding-row"}
            onClick={() => {
              captureCurrentNeutral();
              setSelectedKey(step.key);
              setMessage(step.instruction);
            }}
          >
            <span>{step.title}</span>
            <strong>{formatBinding(mapping[step.key])}</strong>
          </button>
        ))}
      </div>
      <div className="invert-actions">
        <button type="button" className="secondary-button" onClick={() => invertAxis("drive")}>
          Invert Drive
        </button>
        <button type="button" className="secondary-button" onClick={() => invertAxis("turn")}>
          Invert Turn
        </button>
        <button type="button" className="secondary-button" onClick={() => invertAxis("aimX")}>
          Invert Aim X
        </button>
        <button type="button" className="secondary-button" onClick={() => invertAxis("aimY")}>
          Invert Aim Y
        </button>
      </div>
      <div className="input-preview" aria-label="Computed gamepad input preview">
        <strong>Game Input Preview</strong>
        <span>drive {preview.throttle.toFixed(2)}</span>
        <span>turn {preview.turn.toFixed(2)}</span>
        <span>aim {preview.aimX.toFixed(2)}, {preview.aimY.toFixed(2)}</span>
        <span>start {preview.start ? "on" : "off"}</span>
        <span>fire {preview.fire ? "on" : "off"}</span>
      </div>
      <div className="gamepad-diagnostics" aria-label="Live gamepad diagnostics">
        <div>
          <strong>Axes</strong>
          <span>{liveState.axes.map((value, index) => `${index}:${value.toFixed(2)}`).join("  ") || "none"}</span>
        </div>
        <div>
          <strong>Buttons</strong>
          <span>
            {liveState.buttons
              .map((button, index) => `${index}:${button.pressed ? "P" : "-"}:${button.value.toFixed(2)}`)
              .join("  ") || "none"}
          </span>
        </div>
      </div>
      <div className="setup-actions">
        <button type="button" onClick={handleSave}>
          Save Mapping
        </button>
        <button type="button" className="secondary-button" onClick={handleStandardPreset}>
          Standard Preset
        </button>
        <button type="button" className="secondary-button" onClick={handleReset}>
          Reset Defaults
        </button>
        <button type="button" className="secondary-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );

  function invertAxis(key: "drive" | "turn" | "aimX" | "aimY"): void {
    setMapping((current) => ({
      ...current,
      [key]: {
        ...current[key],
        direction: current[key].direction === 1 ? -1 : 1,
      },
    }));
    setMessage(`${STEPS.find((step) => step.key === key)!.title} inverted. Save Mapping to keep it.`);
  }
}

function applyStep(
  mapping: GamepadMapping,
  key: StepKey,
  binding: ButtonBinding | AxisBinding,
): GamepadMapping {
  return {
    ...mapping,
    [key]: binding,
  };
}

function describeDetected(binding: ButtonBinding | AxisBinding): string {
  if ("button" in binding) {
    return `Captured button ${binding.button}.`;
  }

  return `Captured axis ${binding.axis} (${binding.direction > 0 ? "positive" : "negative"} direction).`;
}

function formatAxis(binding: AxisBinding): string {
  return `axis ${binding.axis}, ${binding.direction > 0 ? "positive" : "negative"}, neutral ${binding.neutral.toFixed(2)}`;
}

function formatBinding(binding: ButtonBinding | AxisBinding): string {
  if ("button" in binding) {
    return `button ${binding.button}, neutral ${binding.neutralValue.toFixed(2)}${binding.neutralPressed ? ", held" : ""}`;
  }

  return formatAxis(binding);
}

function getNeutralButtons(mapping: GamepadMapping): Array<{ value: number; pressed: boolean }> {
  const neutralButtons: Array<{ value: number; pressed: boolean }> = [];

  for (const binding of [mapping.start, mapping.fire]) {
    neutralButtons[binding.button] = {
      value: binding.neutralValue,
      pressed: binding.neutralPressed,
    };
  }

  return neutralButtons;
}

function getNeutralAxes(mapping: GamepadMapping): number[] {
  const neutralAxes: number[] = [];

  for (const binding of [mapping.drive, mapping.turn, mapping.aimX, mapping.aimY]) {
    neutralAxes[binding.axis] = binding.neutral;
  }

  return neutralAxes;
}

function sanitizeStickNeutral(value: number | undefined): number {
  if (!Number.isFinite(value) || isLikelyTriggerAxisNeutral(value ?? 0)) {
    return 0;
  }

  return value ?? 0;
}

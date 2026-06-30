import { useEffect, useMemo, useState } from "react";

interface GamepadRecorderProps {
  onClose: () => void;
}

type RecorderStepKey =
  | "neutral"
  | "drive_forward"
  | "drive_back"
  | "turn_left"
  | "turn_right"
  | "aim_right"
  | "aim_down"
  | "fire"
  | "start";

interface RecorderStep {
  key: RecorderStepKey;
  title: string;
  instruction: string;
}

interface ButtonSnapshot {
  index: number;
  pressed: boolean;
  touched: boolean;
  value: number;
}

interface GamepadSnapshot {
  step: RecorderStepKey;
  title: string;
  capturedAt: string;
  gamepad:
    | {
        id: string;
        index: number;
        mapping: string;
        connected: boolean;
        axes: number[];
        buttons: ButtonSnapshot[];
      }
    | null;
}

const RECORDER_STEPS: RecorderStep[] = [
  {
    key: "neutral",
    title: "Neutral",
    instruction: "Release every stick, trigger, and button, then capture.",
  },
  {
    key: "drive_forward",
    title: "Drive Forward",
    instruction: "Hold the control you expect to drive the tank forward.",
  },
  {
    key: "drive_back",
    title: "Drive Back",
    instruction: "Hold the control you expect to reverse the tank.",
  },
  {
    key: "turn_left",
    title: "Turn Left",
    instruction: "Hold the control you expect to rotate the hull left.",
  },
  {
    key: "turn_right",
    title: "Turn Right",
    instruction: "Hold the control you expect to rotate the hull right.",
  },
  {
    key: "aim_right",
    title: "Aim Right",
    instruction: "Hold the control you expect to rotate the turret right.",
  },
  {
    key: "aim_down",
    title: "Aim Down",
    instruction: "Hold the control you expect to aim the turret downward.",
  },
  {
    key: "fire",
    title: "Fire",
    instruction: "Hold the button or trigger you expect to fire.",
  },
  {
    key: "start",
    title: "Start",
    instruction: "Hold the controller Start/Menu button only.",
  },
];

export function GamepadRecorder({ onClose }: GamepadRecorderProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [snapshots, setSnapshots] = useState<GamepadSnapshot[]>([]);
  const [liveSnapshot, setLiveSnapshot] = useState<GamepadSnapshot>(() => captureSnapshot(RECORDER_STEPS[0]));
  const [copyStatus, setCopyStatus] = useState("");
  const currentStep = RECORDER_STEPS[stepIndex];
  const report = useMemo(
    () =>
      JSON.stringify(
        {
          userAgent: navigator.userAgent,
          capturedAt: new Date().toISOString(),
          snapshots,
        },
        null,
        2,
      ),
    [snapshots],
  );
  const isComplete = snapshots.length >= RECORDER_STEPS.length;

  useEffect(() => {
    let frame = 0;

    const poll = () => {
      setLiveSnapshot(captureSnapshot(currentStep));
      frame = requestAnimationFrame(poll);
    };

    frame = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(frame);
  }, [currentStep]);

  function handleCapture(): void {
    const nextSnapshot = captureSnapshot(currentStep);

    setSnapshots((current) => [
      ...current.filter((snapshot) => snapshot.step !== currentStep.key),
      nextSnapshot,
    ]);
    setCopyStatus("");

    if (stepIndex < RECORDER_STEPS.length - 1) {
      setStepIndex((current) => current + 1);
    }
  }

  function handleBack(): void {
    setStepIndex((current) => Math.max(0, current - 1));
    setCopyStatus("");
  }

  function handleReset(): void {
    setSnapshots([]);
    setStepIndex(0);
    setCopyStatus("");
  }

  async function handleCopy(): Promise<void> {
    if (!navigator.clipboard) {
      setCopyStatus("Clipboard unavailable. Select the JSON and copy it manually.");
      return;
    }

    await navigator.clipboard.writeText(report);
    setCopyStatus("Copied recorder JSON.");
  }

  return (
    <section className="recorder-panel" aria-live="polite">
      <p className="eyebrow">Controller Recorder</p>
      <h1>Input Recorder</h1>
      <p className="menu-copy">{currentStep.instruction}</p>
      <div className="recorder-status">
        Step {stepIndex + 1} of {RECORDER_STEPS.length}: <strong>{currentStep.title}</strong>
      </div>
      <div className="gamepad-diagnostics" aria-label="Live raw gamepad state">
        <div>
          <strong>Gamepad</strong>
          <span>{liveSnapshot.gamepad ? `${liveSnapshot.gamepad.index}: ${liveSnapshot.gamepad.id}` : "none detected"}</span>
        </div>
        <div>
          <strong>Axes</strong>
          <span>{liveSnapshot.gamepad?.axes.map((value, index) => `${index}:${value.toFixed(3)}`).join("  ") || "none"}</span>
        </div>
        <div>
          <strong>Buttons</strong>
          <span>
            {liveSnapshot.gamepad?.buttons
              .map((button) => `${button.index}:${button.pressed ? "P" : "-"}:${button.value.toFixed(3)}`)
              .join("  ") || "none"}
          </span>
        </div>
      </div>
      <div className="setup-actions">
        <button type="button" onClick={handleCapture}>
          Capture Step
        </button>
        <button type="button" className="secondary-button" onClick={handleBack} disabled={stepIndex === 0}>
          Previous
        </button>
        <button type="button" className="secondary-button" onClick={handleReset} disabled={snapshots.length === 0}>
          Reset
        </button>
        <button type="button" className="secondary-button" onClick={handleCopy} disabled={snapshots.length === 0}>
          Copy JSON
        </button>
        <button type="button" className="secondary-button" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="control-hint">
        Capture each step while holding only the requested control. When complete, send the JSON so the mapping can be built from evidence.
      </p>
      {copyStatus && <p className="setup-message">{copyStatus}</p>}
      <pre className="recorder-json" aria-label="Captured gamepad JSON">
        {snapshots.length === 0 ? "No captures yet." : report}
      </pre>
      {isComplete && <p className="setup-message">Recorder complete. Copy the JSON and send it back.</p>}
    </section>
  );
}

function captureSnapshot(step: RecorderStep): GamepadSnapshot {
  const gamepad = navigator.getGamepads?.()[0];

  return {
    step: step.key,
    title: step.title,
    capturedAt: new Date().toISOString(),
    gamepad: gamepad
      ? {
          id: gamepad.id,
          index: gamepad.index,
          mapping: gamepad.mapping,
          connected: gamepad.connected,
          axes: [...gamepad.axes],
          buttons: [...gamepad.buttons].map((button, index) => ({
            index,
            pressed: button.pressed,
            touched: "touched" in button ? button.touched : false,
            value: button.value,
          })),
        }
      : null,
  };
}

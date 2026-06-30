import { useEffect, useMemo, useRef, useState } from "react";
import {
  INITIAL_FLOW_STATE,
  applyBackAction,
  applyMapOutcome,
  applyPrimaryAction,
  startMap as startFlowMap,
  type AppMode,
  type FlowState,
} from "./app-flow";
import { GamepadRecorder } from "./GamepadRecorder";
import { GamepadSetup } from "./GamepadSetup";
import { GameCanvas } from "./game/GameCanvas";
import { CAMPAIGN_MAPS } from "./game/maps";
import type { MatchOutcome, ScoreState } from "./game/types";
import { getGamepadPreset, loadGamepadMapping, type GamepadMapping } from "./gamepad-config";
import { isMenuBackPressed, isMenuConfirmPressed } from "./menu-input";
import { SoundAudition } from "./SoundAudition";
import "./styles.css";

const INITIAL_SCORE: ScoreState = { player: 0, enemy: 0 };

export function App() {
  const [flow, setFlow] = useState<FlowState>(INITIAL_FLOW_STATE);
  const [score, setScore] = useState<ScoreState>(INITIAL_SCORE);
  const [gamepadMapping, setGamepadMapping] = useState<GamepadMapping>(() => loadGamepadMapping());
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isRecorderOpen, setIsRecorderOpen] = useState(false);
  const [isSoundAuditionOpen, setIsSoundAuditionOpen] = useState(false);
  const activePresetId = useRef("");
  const { mode, mapIndex, runId } = flow;
  const currentMap = CAMPAIGN_MAPS[mapIndex];
  const cta = useMemo(() => getCta(mode, mapIndex), [mode, mapIndex]);

  useEffect(() => {
    const onPauseRequested = () => {
      setFlow((current) => (current.mode === "playing" ? { ...current, mode: "paused" } : current));
    };

    window.addEventListener("thunder-tank-pause-requested", onPauseRequested);
    return () => window.removeEventListener("thunder-tank-pause-requested", onPauseRequested);
  }, []);

  useEffect(() => {
    let previousPressed = false;
    let previousBack = false;
    let animationFrame = 0;

    const tick = () => {
      const gamepad = navigator.getGamepads?.()[0];
      const preset = getGamepadPreset(gamepad);

      if (preset && preset.id !== activePresetId.current) {
        activePresetId.current = preset.id;
        setGamepadMapping(preset.mapping);
      }

      const confirmPressed =
        isSetupOpen || isRecorderOpen || isSoundAuditionOpen ? false : isMenuConfirmPressed(gamepad, gamepadMapping);
      const backPressed = isMenuBackPressed(gamepad);

      if (confirmPressed && !previousPressed) {
        handlePrimary();
      }

      if (backPressed && !previousBack) {
        handleBack();
      }

      previousPressed = confirmPressed;
      previousBack = backPressed;
      animationFrame = requestAnimationFrame(tick);
    };

    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [gamepadMapping, isRecorderOpen, isSetupOpen, isSoundAuditionOpen, mode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (["Enter", " "].includes(event.key)) {
        event.preventDefault();
        handlePrimary();
      }

      if (event.key === "Escape") {
        event.preventDefault();
        if (isSoundAuditionOpen) {
          setIsSoundAuditionOpen(false);
        } else if (isRecorderOpen) {
          setIsRecorderOpen(false);
        } else if (isSetupOpen) {
          setIsSetupOpen(false);
        } else {
          handleBack();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isRecorderOpen, isSetupOpen, isSoundAuditionOpen, mode]);

  function startMap(index: number): void {
    setScore(INITIAL_SCORE);
    setFlow((current) => startFlowMap(current, index));
  }

  function restartCurrentMap(): void {
    startMap(mapIndex);
  }

  function handlePrimary(): void {
    if (mode === "playing") {
      setFlow((current) => ({ ...current, mode: "paused" }));
      return;
    }

    setFlow((current) => {
      const next = applyPrimaryAction(current);

      if (next.runId !== current.runId) {
        setScore(INITIAL_SCORE);
      }

      return next;
    });
  }

  function handleBack(): void {
    setFlow((current) => applyBackAction(current));
  }

  function handleMapEnded(outcome: Exclude<MatchOutcome, "playing">): void {
    setFlow((current) => applyMapOutcome(current, outcome));
  }

  const isGameMounted = mode === "playing" || mode === "paused" || mode === "won" || mode === "lost";

  return (
    <main className="app-shell">
      {isGameMounted ? (
        <GameCanvas
          mapIndex={mapIndex}
          runId={runId}
          paused={mode !== "playing"}
          gamepadMapping={gamepadMapping}
          onScoreChanged={setScore}
          onMapEnded={handleMapEnded}
        />
      ) : (
        <div className="menu-backdrop" />
      )}

      <section className="hud" aria-label="Match status">
        <div>
          <span className="hud-label">Map</span>
          <strong>{currentMap.name}</strong>
        </div>
        <div>
          <span className="hud-label">Score</span>
          <strong>
            {score.player} - {score.enemy}
          </strong>
        </div>
        <div>
          <span className="hud-label">Target</span>
          <strong>{currentMap.playerScoreLimit}</strong>
        </div>
      </section>

      {isSoundAuditionOpen ? (
        <SoundAudition onClose={() => setIsSoundAuditionOpen(false)} />
      ) : isRecorderOpen ? (
        <GamepadRecorder onClose={() => setIsRecorderOpen(false)} />
      ) : isSetupOpen ? (
        <GamepadSetup
          initialMapping={gamepadMapping}
          onCancel={() => setIsSetupOpen(false)}
          onSave={(mapping) => {
            setGamepadMapping(mapping);
            setIsSetupOpen(false);
          }}
        />
      ) : mode !== "playing" ? (
        <section className="menu-panel" aria-live="polite">
          <p className="eyebrow">Thunder Tank</p>
          <h1>{getTitle(mode)}</h1>
          <p className="menu-copy">{getCopy(mode, currentMap.name)}</p>
          <button type="button" onClick={handlePrimary} autoFocus>
            {cta}
          </button>
          <button type="button" className="secondary-button" onClick={() => setIsSetupOpen(true)}>
            Controller Setup
          </button>
          <button type="button" className="secondary-button" onClick={() => setIsRecorderOpen(true)}>
            Controller Recorder
          </button>
          <button type="button" className="secondary-button" onClick={() => setIsSoundAuditionOpen(true)}>
            Explosion Sounds
          </button>
          <p className="control-hint">Gamepad Start or Enter to select, pause, or resume. Esc also pauses.</p>
        </section>
      ) : null}
    </main>
  );
}

function getTitle(mode: AppMode): string {
  if (mode === "paused") {
    return "Paused";
  }

  if (mode === "won") {
    return "Map Cleared";
  }

  if (mode === "lost") {
    return "Tank Destroyed";
  }

  if (mode === "complete") {
    return "Campaign Slice Complete";
  }

  return "Thunder Tank";
}

function getCopy(mode: AppMode, mapName: string): string {
  if (mode === "paused") {
    return `${mapName} is paused. Resume with Start or Enter to return to battle.`;
  }

  if (mode === "won") {
    return `${mapName} cleared. Advance to the next combat zone.`;
  }

  if (mode === "lost") {
    return `${mapName} was lost. Restart this map and beat the enemy score limit.`;
  }

  if (mode === "complete") {
    return "You cleared all three single-player maps in the P1 vertical slice.";
  }

  return "Single-player campaign: left stick drives and turns, right stick left/right rotates turret, trigger/A fires.";
}

function getCta(mode: AppMode, mapIndex: number): string {
  if (mode === "paused") {
    return "Resume";
  }

  if (mode === "won") {
    return mapIndex >= CAMPAIGN_MAPS.length - 1 ? "Finish" : "Next Map";
  }

  if (mode === "lost") {
    return "Restart Map";
  }

  if (mode === "complete") {
    return "Restart Campaign";
  }

  return mapIndex > 0 ? "Continue" : "Start Campaign";
}

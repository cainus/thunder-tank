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
import { EMPTY_GUN_HEAT, getActiveBuffLabels, getGunFreezeSeconds, type PlayerStatus } from "./game/combat-state";
import { CAMPAIGN_MAPS } from "./game/maps";
import type { CampaignMap, MatchOutcome, ScoreState } from "./game/types";
import { getGamepadPreset, loadGamepadMapping, type GamepadMapping } from "./gamepad-config";
import { LevelEditor } from "./LevelEditor";
import { isMenuBackPressed, isMenuConfirmPressed } from "./menu-input";
import { SoundAudition } from "./SoundAudition";
import "./styles.css";

const INITIAL_SCORE: ScoreState = { player: 0, enemy: 0 };
const INITIAL_PLAYER_STATUS: PlayerStatus = {
  buffs: { speedUntil: 0, rapidFireUntil: 0, shieldUntil: 0 },
  gunFrozenUntil: EMPTY_GUN_HEAT.frozenUntil,
  now: 0,
};

export function App() {
  const [flow, setFlow] = useState<FlowState>(INITIAL_FLOW_STATE);
  const [score, setScore] = useState<ScoreState>(INITIAL_SCORE);
  const [playerStatus, setPlayerStatus] = useState<PlayerStatus>(INITIAL_PLAYER_STATUS);
  const [gamepadMapping, setGamepadMapping] = useState<GamepadMapping>(() => loadGamepadMapping());
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isRecorderOpen, setIsRecorderOpen] = useState(false);
  const [isSoundAuditionOpen, setIsSoundAuditionOpen] = useState(false);
  const [isMotorAuditionOpen, setIsMotorAuditionOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [customMap, setCustomMap] = useState<CampaignMap | undefined>();
  const activePresetId = useRef("");
  const { mode, mapIndex, runId } = flow;
  const currentMap = customMap ?? CAMPAIGN_MAPS[mapIndex];
  const cta = useMemo(() => getCta(mode, mapIndex), [mode, mapIndex]);
  const activeBuffLabels = getActiveBuffLabels(playerStatus.buffs, playerStatus.now);
  const gunFreezeSeconds = getGunFreezeSeconds(playerStatus);

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
        isSetupOpen || isRecorderOpen || isSoundAuditionOpen || isMotorAuditionOpen || isEditorOpen
          ? false
          : isMenuConfirmPressed(gamepad, gamepadMapping, { includeFire: mode === "won" });
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
  }, [gamepadMapping, isEditorOpen, isMotorAuditionOpen, isRecorderOpen, isSetupOpen, isSoundAuditionOpen, mode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (["Enter", " "].includes(event.key)) {
        event.preventDefault();
        handlePrimary();
      }

      if (event.key === "Escape") {
        event.preventDefault();
        if (isEditorOpen) {
          setIsEditorOpen(false);
        } else if (isSoundAuditionOpen) {
          setIsSoundAuditionOpen(false);
        } else if (isMotorAuditionOpen) {
          setIsMotorAuditionOpen(false);
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
  }, [isEditorOpen, isMotorAuditionOpen, isRecorderOpen, isSetupOpen, isSoundAuditionOpen, mode]);

  function startMap(index: number): void {
    setCustomMap(undefined);
    setScore(INITIAL_SCORE);
    setPlayerStatus(INITIAL_PLAYER_STATUS);
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
        setCustomMap(undefined);
        setScore(INITIAL_SCORE);
        setPlayerStatus(INITIAL_PLAYER_STATUS);
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

  function handleEditorTestPlay(map: CampaignMap): void {
    setCustomMap(map);
    setScore(INITIAL_SCORE);
    setPlayerStatus(INITIAL_PLAYER_STATUS);
    setIsEditorOpen(false);
    setFlow((current) => ({ mode: "playing", mapIndex: 0, runId: current.runId + 1 }));
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
          mapOverride={customMap}
          onScoreChanged={setScore}
          onPlayerStatusChanged={setPlayerStatus}
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
        <div className="hud-powerups">
          <span className="hud-label">Powerups</span>
          <strong>{activeBuffLabels.length > 0 ? activeBuffLabels.join(" + ") : "None"}</strong>
        </div>
        <div className={gunFreezeSeconds > 0 ? "hud-warning" : undefined}>
          <span className="hud-label">Gun</span>
          <strong>{gunFreezeSeconds > 0 ? `Frozen ${gunFreezeSeconds}s` : "Ready"}</strong>
        </div>
      </section>

      {isEditorOpen ? (
        <LevelEditor onClose={() => setIsEditorOpen(false)} onTestPlay={handleEditorTestPlay} />
      ) : isSoundAuditionOpen ? (
        <SoundAudition onClose={() => setIsSoundAuditionOpen(false)} />
      ) : isMotorAuditionOpen ? (
        <SoundAudition variant="motors" onClose={() => setIsMotorAuditionOpen(false)} />
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
          {mode !== "won" && (
            <>
              <button type="button" className="secondary-button" onClick={() => setIsSetupOpen(true)}>
                Controller Setup
              </button>
              <button type="button" className="secondary-button" onClick={() => setIsRecorderOpen(true)}>
                Controller Recorder
              </button>
              <button type="button" className="secondary-button" onClick={() => setIsSoundAuditionOpen(true)}>
                Explosion Sounds
              </button>
              <button type="button" className="secondary-button" onClick={() => setIsMotorAuditionOpen(true)}>
                Motor Sounds
              </button>
              <button type="button" className="secondary-button" onClick={() => setIsEditorOpen(true)}>
                Level Editor
              </button>
            </>
          )}
          <p className="control-hint">
            {mode === "won" ? "Gamepad Fire, Start, or Enter advances." : "Gamepad Start or Enter to select, pause, or resume. Esc also pauses."}
          </p>
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
    return `You cleared all ${CAMPAIGN_MAPS.length} single-player maps.`;
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

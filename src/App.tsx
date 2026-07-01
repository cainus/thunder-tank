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
  const [isUtilityMenuOpen, setIsUtilityMenuOpen] = useState(false);
  const [customMap, setCustomMap] = useState<CampaignMap | undefined>();
  const activePresetId = useRef("");
  const { mode, matchMode, mapIndex, runId } = flow;
  const currentMap = customMap ?? CAMPAIGN_MAPS[mapIndex];
  const cta = useMemo(() => getCta(mode, mapIndex, matchMode), [mode, mapIndex, matchMode]);
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
          setIsUtilityMenuOpen(false);
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
    setFlow((current) => startFlowMap(current, index, "campaign"));
  }

  function startDeathmatch(): void {
    setCustomMap(undefined);
    setScore(INITIAL_SCORE);
    setPlayerStatus(INITIAL_PLAYER_STATUS);
    setFlow((current) => startFlowMap(current, 0, "deathmatch"));
  }

  function startCoOp(): void {
    setCustomMap(undefined);
    setScore(INITIAL_SCORE);
    setPlayerStatus(INITIAL_PLAYER_STATUS);
    setFlow((current) => startFlowMap(current, 0, "coOp"));
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
    setFlow((current) => ({ mode: "playing", matchMode: "campaign", mapIndex: 0, runId: current.runId + 1 }));
  }

  const isGameMounted = mode === "playing" || mode === "paused" || mode === "won" || mode === "lost";
  const shouldShowInlineUtilities = mode === "title";
  const shouldShowGearUtilities = !isEditorOpen && !isSoundAuditionOpen && !isMotorAuditionOpen && !isRecorderOpen && !isSetupOpen && mode !== "playing" && mode !== "won" && mode !== "title";

  return (
    <main className="app-shell">
      {isGameMounted ? (
        <GameCanvas
          mapIndex={mapIndex}
          matchMode={matchMode}
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
          <span className="hud-label">{matchMode === "deathmatch" ? "P1 - P2" : matchMode === "coOp" ? "Team - Enemy" : "Score"}</span>
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
          <h1>{getTitle(mode, matchMode)}</h1>
          <p className="menu-copy">{getCopy(mode, currentMap.name, matchMode)}</p>
          <button type="button" onClick={handlePrimary} autoFocus>
            {cta}
          </button>
          {shouldShowInlineUtilities && (
            <>
              <button type="button" className="secondary-button" onClick={startDeathmatch}>
                2P Deathmatch
              </button>
              <button type="button" className="secondary-button" onClick={startCoOp}>
                Co-op Campaign
              </button>
              <UtilityButtons
                openSetup={() => setIsSetupOpen(true)}
                openRecorder={() => setIsRecorderOpen(true)}
                openExplosionSounds={() => setIsSoundAuditionOpen(true)}
                openMotorSounds={() => setIsMotorAuditionOpen(true)}
                openEditor={() => setIsEditorOpen(true)}
              />
            </>
          )}
          <p className="control-hint">
            {mode === "won" ? "Gamepad Fire, Start, or Enter advances." : "Gamepad Start or Enter to select, pause, or resume. Esc also pauses."}
          </p>
        </section>
      ) : null}

      {shouldShowGearUtilities && (
        <div className="utility-menu">
          <button
            type="button"
            className="gear-button"
            aria-label="Settings"
            aria-expanded={isUtilityMenuOpen}
            onClick={() => setIsUtilityMenuOpen((open) => !open)}
          >
            ⚙
          </button>
          {isUtilityMenuOpen && (
            <div className="utility-menu-popover">
              <UtilityButtons
                openSetup={() => {
                  setIsUtilityMenuOpen(false);
                  setIsSetupOpen(true);
                }}
                openRecorder={() => {
                  setIsUtilityMenuOpen(false);
                  setIsRecorderOpen(true);
                }}
                openExplosionSounds={() => {
                  setIsUtilityMenuOpen(false);
                  setIsSoundAuditionOpen(true);
                }}
                openMotorSounds={() => {
                  setIsUtilityMenuOpen(false);
                  setIsMotorAuditionOpen(true);
                }}
                openEditor={() => {
                  setIsUtilityMenuOpen(false);
                  setIsEditorOpen(true);
                }}
              />
            </div>
          )}
        </div>
      )}
    </main>
  );
}

function UtilityButtons({
  openSetup,
  openRecorder,
  openExplosionSounds,
  openMotorSounds,
  openEditor,
}: {
  openSetup: () => void;
  openRecorder: () => void;
  openExplosionSounds: () => void;
  openMotorSounds: () => void;
  openEditor: () => void;
}) {
  return (
    <>
      <button type="button" className="secondary-button" onClick={openSetup}>
        Controller Setup
      </button>
      <button type="button" className="secondary-button" onClick={openRecorder}>
        Controller Recorder
      </button>
      <button type="button" className="secondary-button" onClick={openExplosionSounds}>
        Explosion Sounds
      </button>
      <button type="button" className="secondary-button" onClick={openMotorSounds}>
        Motor Sounds
      </button>
      <button type="button" className="secondary-button" onClick={openEditor}>
        Level Editor
      </button>
    </>
  );
}

function getTitle(mode: AppMode, matchMode = "campaign"): string {
  if (mode === "paused") {
    return "Paused";
  }

  if (mode === "won") {
    if (matchMode === "deathmatch") {
      return "P1 Wins";
    }

    return "Map Cleared";
  }

  if (mode === "lost") {
    if (matchMode === "deathmatch") {
      return "P2 Wins";
    }

    return "Tank Destroyed";
  }

  if (mode === "complete") {
    if (matchMode === "coOp") {
      return "Co-op Campaign Complete";
    }

    return "Campaign Slice Complete";
  }

  return "Thunder Tank";
}

function getCopy(mode: AppMode, mapName: string, matchMode = "campaign"): string {
  if (mode === "paused") {
    if (matchMode === "deathmatch") {
      return "Deathmatch is paused. Resume with Start or Enter to return to battle.";
    }

    if (matchMode === "coOp") {
      return `${mapName} co-op is paused. Resume with Start or Enter to return to battle.`;
    }

    return `${mapName} is paused. Resume with Start or Enter to return to battle.`;
  }

  if (mode === "won") {
    if (matchMode === "deathmatch") {
      return "Player 1 reached the score limit.";
    }

    return `${mapName} cleared. Advance to the next combat zone.`;
  }

  if (mode === "lost") {
    if (matchMode === "deathmatch") {
      return "Player 2 reached the score limit.";
    }

    if (matchMode === "coOp") {
      return `${mapName} was lost. Restart this map and beat the enemy score limit together.`;
    }

    return `${mapName} was lost. Restart this map and beat the enemy score limit.`;
  }

  if (mode === "complete") {
    if (matchMode === "coOp") {
      return `You cleared all ${CAMPAIGN_MAPS.length} campaign maps in co-op.`;
    }

    return `You cleared all ${CAMPAIGN_MAPS.length} single-player maps.`;
  }

  return "Single-player campaign: left stick drives and turns, right stick left/right rotates turret, trigger/A fires.";
}

function getCta(mode: AppMode, mapIndex: number, matchMode = "campaign"): string {
  if (mode === "paused") {
    return "Resume";
  }

  if (mode === "won") {
    if (matchMode === "deathmatch") {
      return "Rematch";
    }

    return mapIndex >= CAMPAIGN_MAPS.length - 1 ? "Finish" : "Next Map";
  }

  if (mode === "lost") {
    if (matchMode === "deathmatch") {
      return "Rematch";
    }

    return "Restart Map";
  }

  if (mode === "complete") {
    return "Restart Campaign";
  }

  return mapIndex > 0 ? "Continue" : "Start Campaign";
}

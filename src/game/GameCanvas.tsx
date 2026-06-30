import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { CampaignScene } from "./CampaignScene";
import type { GamepadMapping } from "../gamepad-config";
import type { PlayerStatus } from "./combat-state";
import type { CampaignMap, GameCallbacks, MatchOutcome, ScoreState } from "./types";

interface GameCanvasProps {
  mapIndex: number;
  runId: number;
  paused: boolean;
  gamepadMapping: GamepadMapping;
  mapOverride?: CampaignMap;
  onScoreChanged: (score: ScoreState) => void;
  onPlayerStatusChanged: GameCallbacks["onPlayerStatusChanged"];
  onMapEnded: GameCallbacks["onMapEnded"];
}

export function GameCanvas({
  mapIndex,
  runId,
  paused,
  gamepadMapping,
  mapOverride,
  onScoreChanged,
  onPlayerStatusChanged,
  onMapEnded,
}: GameCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const callbacksRef = useRef({ onScoreChanged, onPlayerStatusChanged, onMapEnded });

  callbacksRef.current = { onScoreChanged, onPlayerStatusChanged, onMapEnded };

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: "#293529",
      pixelArt: true,
      render: {
        antialias: false,
        roundPixels: true,
      },
      physics: {
        default: "arcade",
        arcade: {
          debug: false,
        },
      },
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [CampaignScene],
    });

    game.scene.start("CampaignScene", {
      mapIndex,
      mapOverride,
      gamepadMapping,
      callbacks: {
        onScoreChanged: (score: ScoreState) => callbacksRef.current.onScoreChanged(score),
        onPlayerStatusChanged: (status: PlayerStatus) => callbacksRef.current.onPlayerStatusChanged(status),
        onMapEnded: (outcome: Exclude<MatchOutcome, "playing">) => callbacksRef.current.onMapEnded(outcome),
      },
    });

    return () => {
      game.destroy(true);
    };
  }, [gamepadMapping, mapIndex, mapOverride, runId]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent(paused ? "thunder-tank-pause" : "thunder-tank-resume"));
  }, [paused]);

  return <div ref={hostRef} className="game-canvas" data-testid="game-canvas" />;
}

import type Phaser from "phaser";
import type { PlayerStatus } from "./combat-state";

export type TankSide = "player" | "enemy";

export type EnemyArchetype = "light" | "standard" | "heavy" | "boss";

export type PickupType = "speed" | "rapidFire" | "shield";

export type MatchOutcome = "playing" | "won" | "lost";

export interface Vec2 {
  x: number;
  y: number;
}

export interface ObstacleConfig extends Vec2 {
  kind: "crate" | "barrel" | "barricade" | "sandbag";
  rotation?: number;
}

export interface PickupConfig extends Vec2 {
  type: PickupType;
}

export interface EnemyConfig extends Vec2 {
  archetype: EnemyArchetype;
}

export interface CampaignMap {
  id: string;
  name: string;
  width: number;
  height: number;
  playerSpawn: Vec2;
  enemySpawns: EnemyConfig[];
  obstacles: ObstacleConfig[];
  pickups: PickupConfig[];
  playerScoreLimit: number;
  enemyScoreLimit: number;
}

export interface ScoreState {
  player: number;
  enemy: number;
}

export interface TankStats {
  speed: number;
  fireCooldownMs: number;
  bulletSpeed: number;
  aimDelayMs: number;
}

export interface ActiveBuffs {
  speedUntil: number;
  rapidFireUntil: number;
  shieldUntil: number;
}

export interface TankRuntime {
  id: string;
  side: TankSide;
  archetype?: EnemyArchetype;
  hull: Phaser.Physics.Arcade.Image;
  turret: Phaser.GameObjects.Image;
  frontMarker?: Phaser.GameObjects.Rectangle;
  spawn: Vec2;
  alive: boolean;
  maxHealth: number;
  health: number;
  respawnAt: number;
  lastFiredAt: number;
  nextDecisionAt: number;
  aimAngle: number;
  moveAngle?: number;
  nextMoveDecisionAt: number;
  motorAudio?: HTMLAudioElement;
  motorKey?: string;
  buffs: ActiveBuffs;
}

export interface GameCallbacks {
  onScoreChanged: (score: ScoreState) => void;
  onPlayerStatusChanged: (status: PlayerStatus) => void;
  onMapEnded: (outcome: Exclude<MatchOutcome, "playing">) => void;
}

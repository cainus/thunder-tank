import type Phaser from "phaser";
import type { PlayerStatus } from "./combat-state";

export type MatchMode = "campaign" | "deathmatch" | "coOp" | "captureTheFlag" | "captureTheFlagCoOp";

export type TankSide = "player" | "playerTwo" | "enemy";

export type TeamId = "blue" | "red";

export type EnemyArchetype = "light" | "standard" | "heavy" | "boss";

export type PickupType = "speed" | "rapidFire" | "shield";

export type MatchOutcome = "playing" | "won" | "lost";

export interface Vec2 {
  x: number;
  y: number;
}

export type ObstacleKind = "crate" | "barrel" | "barricade" | "sandbag" | "lightPost";

export interface ObstacleConfig extends Vec2 {
  kind: ObstacleKind;
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
  theme?: "night";
  width: number;
  height: number;
  playerSpawn: Vec2;
  playerTwoSpawn?: Vec2;
  enemySpawns: EnemyConfig[];
  obstacles: ObstacleConfig[];
  pickups: PickupConfig[];
  playerScoreLimit: number;
  enemyScoreLimit: number;
  ctf?: CaptureTheFlagConfig;
}

export interface BaseConfig extends Vec2 {
  radius: number;
}

export interface CaptureTheFlagConfig {
  blueBase: BaseConfig;
  redBase: BaseConfig;
  blueFlag: Vec2;
  redFlag: Vec2;
  blueSpawns: Vec2[];
  redSpawns: Vec2[];
  captureLimit: number;
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
  headlampCone?: Phaser.GameObjects.Image;
  headlampGlow?: Phaser.GameObjects.Arc;
  aiRoleLabel?: Phaser.GameObjects.Text;
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
  lastAiProgressAt?: number;
  lastAiProgressDistance?: number;
  unstuckMoveAngle?: number;
  unstuckUntil?: number;
  motorAudio?: HTMLAudioElement;
  motorKey?: string;
  lastTreadMarkPosition?: Vec2;
  lastDustAt?: number;
  buffs: ActiveBuffs;
}

export interface GameCallbacks {
  onScoreChanged: (score: ScoreState) => void;
  onPlayerStatusChanged: (status: PlayerStatus) => void;
  onMapEnded: (outcome: Exclude<MatchOutcome, "playing">) => void;
}

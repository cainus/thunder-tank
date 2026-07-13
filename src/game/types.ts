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
  // Radians per second the turret may turn while re-aiming. Player tanks aim at
  // the full player rate; AI tanks use a slower per-archetype rate so computer
  // players cannot instantly snap their turrets onto a target.
  turretTurnRate: number;
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
  teamStripe?: Phaser.GameObjects.Container;
  headlampCone?: Phaser.GameObjects.Image;
  headlampGlow?: Phaser.GameObjects.Arc;
  // Current CTF AI role shown as a floating label. The label itself is a DOM
  // node in the game HUD overlay (game-hud-overlay.ts) so it reads above the 3D
  // tank overlay; only the role text is tracked here (TT-28). Empty/undefined
  // means no label.
  aiRole?: string;
  spawn: Vec2;
  alive: boolean;
  maxHealth: number;
  health: number;
  respawnAt: number;
  lastFiredAt: number;
  nextDecisionAt: number;
  aimAngle: number;
  // Signed rotation applied to the hull (base) this frame. Enemies read their
  // target's value to drag their turret the same way, forcing a counter-aim.
  baseTurnDelta: number;
  moveAngle?: number;
  // Set for the frame while this tank is shoving a parked car (see TT-26). The
  // tank/car collider raises it during the physics step and the drive code reads
  // it to slow the tank, then clears it at the end of the scene update.
  pushingCar?: boolean;
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

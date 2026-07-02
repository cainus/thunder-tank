import Phaser from "phaser";
import { isGamepadButtonPressed, readAim, readDrive, type GamepadMapping } from "../gamepad-config";
import { ASSETS, ASSET_KEYS, type AssetKey } from "./assets";
import { EMPTY_GUN_HEAT, isGunFrozen, recordPlayerShot, type GunHeatState } from "./combat-state";
import {
  ENEMY_FIRE_LINE_PADDING,
  ENEMY_FIRE_RANGE,
  ENEMY_MOVE_DECISION_MS,
  ENEMY_PATH_PADDING,
  selectEnemyMoveAngle,
  shouldReuseEnemyMoveAngle,
} from "./enemy-pathing";
import { CAMPAIGN_MAPS, CAPTURE_THE_FLAG_MAPS } from "./maps";
import {
  EMPTY_BUFFS,
  ENEMY_STATS,
  ENEMY_HEALTH,
  PLAYER_BASE_STATS,
  applyPickupBuff,
  getEffectiveStats,
  getEnemyDifficulty,
  getMatchOutcome,
  getRampedEnemyStats,
  hasShield,
} from "./rules";
import { getTreadMarkAlpha, isTreadMarkExpired, shouldSpawnTreadMark } from "./tread-marks";
import type {
  CampaignMap,
  EnemyArchetype,
  GameCallbacks,
  MatchMode,
  ObstacleConfig,
  PickupConfig,
  ScoreState,
  TankStats,
  TankRuntime,
  TeamId,
  Vec2,
} from "./types";

const TANK_DEPTH = 20;
const RESPAWN_DELAY_MS = 1_400;
const PICKUP_RESPAWN_MS = 9_000;
const WORLD_PADDING = 120;
const PLAYER_TURN_RATE = 3.2;
const PLAYER_TURRET_TURN_RATE = 4.1;
const PLAYER_FRONT_MARKER_OFFSET = 33;
const SPAWN_MARGIN = 160;
const SPAWN_CLEARANCE = 180;
const SPAWN_ATTEMPTS = 48;
const PLAYER_RESPAWN_GRACE_MS = 700;
const PLAYER_RESPAWN_COUNTDOWN_MS = 10_000;
const CTF_RESPAWN_DELAY_MS = 10_000;
const CTF_TANK_HEALTH = 3;
const CTF_FLAG_TOUCH_RADIUS = 82;
const CTF_BASE_ALPHA = 0.16;
const CTF_FLAG_THREAT_RANGE = 480;
const AI_STOP_DISTANCE = 56;
const AI_FLAG_OBJECTIVE_STOP_DISTANCE = 8;
const AI_MIN_DRIVE_THROTTLE = 0.34;
const AI_STUCK_CHECK_MS = 850;
const AI_STUCK_PROGRESS_EPSILON = 18;
const AI_UNSTUCK_DURATION_MS = 900;
const PICKUP_BODY_RADIUS = 18;
const PICKUP_COLLECT_RADIUS = 42;
const ENEMY_PICKUP_SEEK_RANGE = 300;
const CAMERA_MIN_ZOOM = 0.64;
const CAMERA_SPAN_MARGIN_X = 560;
const CAMERA_SPAN_MARGIN_Y = 420;
const PICKUP_BARREL_SCALE = 0.95;
const PICKUP_ICON_SCALE = 0.22;
const PICKUP_GLOW_ALPHA = 0.22;
const MOTOR_BASE_VOLUME = 0.2;
const MOTOR_MIN_VOLUME = 0.015;
const MOTOR_AUDIBLE_RANGE = 950;
const MOTOR_MOVING_SPEED = 8;
const TREAD_MARK_DEPTH = 1;
const TREAD_MARK_REAR_OFFSET = 22;
const DUST_PUFF_DEPTH = 19;
const DUST_SPAWN_INTERVAL_MS = 85;
const DUST_REAR_OFFSET = 26;
const DUST_LATERAL_OFFSET = 13;
const DUST_MIN_SCALE = 0.34;
const DUST_MAX_SCALE = 0.72;
const FIRE_SFX_KEYS: AssetKey[] = ["fireSfx15", "fireSfx16", "fireSfx17"];
const EXPLOSION_SFX_KEYS: AssetKey[] = ["explosionSfx4", "explosionSfx7"];
const MOTOR_IDLE_KEY: AssetKey = "motorSfx1";

interface SceneData {
  mapIndex: number;
  matchMode?: MatchMode;
  mapOverride?: CampaignMap;
  gamepadMapping: GamepadMapping;
  callbacks: GameCallbacks;
}

type BulletOwner = "player" | "playerTwo" | "enemy";

type CtfFlagState = "home" | "carried" | "dropped";
type CtfAiRole =
  | "Return to Base"
  | "Stop Carrier"
  | "Recover Flag"
  | "Hunt Defender"
  | "Protect Flag"
  | "Raid Flag";

interface BulletData {
  owner: BulletOwner;
  startX: number;
  startY: number;
  maxRange: number;
}

type ImpactKind = "obstacle" | "tank" | "shield";

interface ImpactEffectOptions {
  angle?: number;
  kind?: ImpactKind;
  scale?: number;
}

interface PickupSprite extends Phaser.Physics.Arcade.Image {
  pickupType: PickupConfig["type"];
  respawnAt: number;
  baseY: number;
  floatPhase: number;
  glow?: Phaser.GameObjects.Arc;
}

interface TreadMark {
  container: Phaser.GameObjects.Container;
  createdAt: number;
}

interface CtfFlagRuntime {
  team: TeamId;
  state: CtfFlagState;
  home: Vec2;
  position: Vec2;
  carrier?: TankRuntime;
  sprite: Phaser.GameObjects.Rectangle;
  pole: Phaser.GameObjects.Rectangle;
}

interface CtfRuntime {
  flags: Record<TeamId, CtfFlagRuntime>;
  bases: Record<TeamId, Phaser.GameObjects.Arc>;
}

function getPickupTint(type: PickupConfig["type"]): number {
  if (type === "speed") {
    return 0x7fe8ff;
  }

  if (type === "rapidFire") {
    return 0xffd05a;
  }

  return 0x99ff8a;
}

export class CampaignScene extends Phaser.Scene {
  private map!: CampaignMap;
  private mapIndex = 0;
  private enemyDifficulty = 0;
  private matchMode: MatchMode = "campaign";
  private callbacks!: GameCallbacks;
  private gamepadMapping!: GamepadMapping;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private player!: TankRuntime;
  private playerTwo?: TankRuntime;
  private enemies: TankRuntime[] = [];
  private score: ScoreState = { player: 0, enemy: 0 };
  private obstacles!: Phaser.Physics.Arcade.StaticGroup;
  private bullets!: Phaser.Physics.Arcade.Group;
  private pickups!: Phaser.Physics.Arcade.Group;
  private ctf?: CtfRuntime;
  private tankByBody = new Map<Phaser.GameObjects.GameObject, TankRuntime>();
  private cleanupListeners: Array<() => void> = [];
  private playerControlLockedUntil = 0;
  private respawnCountdownText?: Phaser.GameObjects.Text;
  private externallyPaused = false;
  private ended = false;
  private pausedBulletVelocities = new Map<Phaser.Physics.Arcade.Image, Vec2>();
  private playerGunHeat: GunHeatState = { ...EMPTY_GUN_HEAT };
  private lastPlayerStatusKey = "";
  private treadMarks: TreadMark[] = [];

  constructor() {
    super("CampaignScene");
  }

  init(data: SceneData): void {
    this.matchMode = data.matchMode ?? "campaign";
    this.mapIndex = data.mapIndex ?? 0;
    this.enemyDifficulty = getEnemyDifficulty(this.mapIndex + 1);
    this.map = data.mapOverride ?? this.getPlaylistMap(data.mapIndex);
    this.gamepadMapping = data.gamepadMapping;
    this.callbacks = data.callbacks;
    this.score = { player: 0, enemy: 0 };
    this.ctf = undefined;
    this.playerTwo = undefined;
    this.enemies = [];
    this.tankByBody.clear();
    this.playerControlLockedUntil = 0;
    this.externallyPaused = false;
    this.ended = false;
    this.pausedBulletVelocities.clear();
    this.playerGunHeat = { ...EMPTY_GUN_HEAT };
    this.lastPlayerStatusKey = "";
    this.destroyAllTreadMarks();
  }

  preload(): void {
    this.load.on("loaderror", (file: Phaser.Loader.File) => {
      console.warn(`Failed to load asset ${file.key}: ${file.src}`);
    });

    for (const key of ASSET_KEYS) {
      const path = ASSETS[key];

      if (path.endsWith(".ogg")) {
        this.load.audio(key, path);
      } else {
        this.load.image(key, path);
      }
    }
  }

  create(): void {
    this.setTextureFilters();
    this.createImpactTextures();
    this.physics.world.setBounds(0, 0, this.map.width, this.map.height);
    this.cameras.main.setBounds(0, 0, this.map.width, this.map.height);
    this.cameras.main.setBackgroundColor("#293529");

    this.addArena();
    this.obstacles = this.physics.add.staticGroup();
    this.bullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 64 });
    this.pickups = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 16 });

    for (const obstacle of this.map.obstacles) {
      this.addObstacle(obstacle);
    }

    for (const pickup of this.map.pickups) {
      this.addPickup(pickup);
    }

    if (this.isCaptureTheFlag()) {
      this.addCaptureTheFlagArena();
      this.enemies = this.map.enemySpawns.slice(0, 2).map((enemy, index) =>
        this.addTank(`enemy-${index}`, this.getCtfSpawn("red", index), enemy.archetype),
      );
      this.player = this.addTank("player", this.getCtfSpawn("blue", 0), "standard");
      this.playerTwo = this.addTank("playerTwo", this.getCtfSpawn("blue", 1), "standard");
    } else {
      this.enemies = this.isDeathmatch()
        ? []
        : this.map.enemySpawns.map((enemy, index) => this.addTank(`enemy-${index}`, enemy, enemy.archetype));
      this.player = this.addTank("player", this.isDeathmatch() ? this.map.playerSpawn : this.getRandomPlayerSpawn(), "standard");
      this.playerTwo = this.isDeathmatch() ? this.addTank("playerTwo", this.getPlayerTwoSpawn(), "standard") : undefined;
    }

    const tankHulls = this.getAllTanks().map((tank) => tank.hull);
    const humanHulls = this.getHumanTanks().map((tank) => tank.hull);
    const enemyHulls = this.enemies.map((enemy) => enemy.hull);

    this.physics.add.collider(tankHulls, this.obstacles);
    this.physics.add.collider(humanHulls, enemyHulls);
    this.physics.add.collider(tankHulls, tankHulls);
    this.physics.add.collider(this.bullets, this.obstacles, (bullet) =>
      this.destroyBullet(bullet as Phaser.GameObjects.GameObject, {
        angle: this.getBulletTravelAngleFromObject(bullet as Phaser.GameObjects.GameObject),
        kind: "obstacle",
      }),
    );
    this.physics.add.overlap(this.bullets, humanHulls, (bullet, hull) =>
      this.handleBulletHit(bullet as Phaser.GameObjects.GameObject, hull as Phaser.GameObjects.GameObject),
    );
    this.physics.add.overlap(this.bullets, enemyHulls, (bullet, hull) =>
      this.handleBulletHit(bullet as Phaser.GameObjects.GameObject, hull as Phaser.GameObjects.GameObject),
    );
    this.physics.add.overlap(this.pickups, tankHulls, (pickup, hull) =>
      this.handlePickup(pickup as Phaser.GameObjects.GameObject, hull as Phaser.GameObjects.GameObject),
    );

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,SPACE,ESC,I,J,K,L,F,G,H") as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;
    if (this.usesSharedCamera()) {
      this.cameras.main.stopFollow();
      this.updateCamera();
    } else {
      this.cameras.main.startFollow(this.player.hull, true, 0.08, 0.08);
    }
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.setZoom(1);
    this.respawnCountdownText = this.add
      .text(0, 0, "", {
        align: "center",
        color: "#f4e2a3",
        fontFamily: "Inter, sans-serif",
        fontSize: "42px",
        fontStyle: "800",
        stroke: "#15120b",
        strokeThickness: 7,
      })
      .setOrigin(0.5)
      .setDepth(100)
      .setScrollFactor(0)
      .setVisible(false);
    this.publishScore();
    this.registerWindowControls();
  }

  update(time: number, delta: number): void {
    if (this.ended) {
      return;
    }

    if (this.externallyPaused) {
      this.stopMovingBodies();
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.ESC)) {
      window.dispatchEvent(new CustomEvent("thunder-tank-pause-requested"));
    }

    this.updatePlayer(time);
    this.updateEnemies(time);
    this.updateBulletHits();
    this.updatePickupCollection();
    this.updatePickupVisuals(time);
    this.updateDustTrails(time);
    this.updateTreadMarks(time);
    this.updateTankVisuals();
    this.updateCaptureTheFlag(time);
    this.updateCamera();
    this.updatePickupRespawns(time);
    this.updateMotorAudio();
    this.cleanupFarBullets();
    this.publishPlayerStatus(time);

    for (const tank of this.getAllTanks()) {
      if (!tank.alive && time >= tank.respawnAt && this.canRespawnTank(tank)) {
        this.respawnTank(tank);
      }
    }

    this.updateRespawnCountdown(time);
  }

  private addArena(): void {
    const graphics = this.add.graphics();
    graphics.setDepth(-12);

    graphics.fillStyle(0x596166, 1);
    graphics.fillRect(0, 0, this.map.width, this.map.height);

    const roadInsetX = Math.max(180, Math.round(this.map.width * 0.2));
    const roadInsetY = Math.max(180, Math.round(this.map.height * 0.2));
    const roadWidth = this.map.width - roadInsetX * 2;
    const roadHeight = this.map.height - roadInsetY * 2;

    graphics.fillStyle(0x2d3136, 1);
    graphics.fillRect(roadInsetX, roadInsetY, roadWidth, roadHeight);

    graphics.fillStyle(0x72787d, 1);
    graphics.fillRect(roadInsetX - 34, roadInsetY - 34, roadWidth + 68, 34);
    graphics.fillRect(roadInsetX - 34, roadInsetY + roadHeight, roadWidth + 68, 34);
    graphics.fillRect(roadInsetX - 34, roadInsetY, 34, roadHeight);
    graphics.fillRect(roadInsetX + roadWidth, roadInsetY, 34, roadHeight);

    graphics.lineStyle(6, 0xc7cbd0, 0.9);
    graphics.strokeRect(roadInsetX - 34, roadInsetY - 34, roadWidth + 68, roadHeight + 68);

    graphics.lineStyle(8, 0xf0df85, 0.85);
    const laneDash = 90;
    const laneGap = 62;
    const horizontalLaneY = this.map.height / 2;
    for (let x = roadInsetX + 40; x < roadInsetX + roadWidth - 40; x += laneDash + laneGap) {
      graphics.lineBetween(x, horizontalLaneY, Math.min(x + laneDash, roadInsetX + roadWidth - 40), horizontalLaneY);
    }

    const verticalLaneX = this.map.width / 2;
    for (let y = roadInsetY + 40; y < roadInsetY + roadHeight - 40; y += laneDash + laneGap) {
      graphics.lineBetween(verticalLaneX, y, verticalLaneX, Math.min(y + laneDash, roadInsetY + roadHeight - 40));
    }

    const crosswalkWidth = 96;
    const crosswalkBar = 18;
    const crosswalkGap = 14;
    graphics.fillStyle(0xe7e8ea, 0.9);
    for (let offset = -4; offset <= 4; offset += 1) {
      const shift = offset * (crosswalkBar + crosswalkGap);
      graphics.fillRect(this.map.width / 2 - crosswalkWidth / 2, roadInsetY - 30 + shift, crosswalkWidth, crosswalkBar);
      graphics.fillRect(this.map.width / 2 - crosswalkWidth / 2, roadInsetY + roadHeight + 12 + shift, crosswalkWidth, crosswalkBar);
      graphics.fillRect(roadInsetX - 30 + shift, this.map.height / 2 - crosswalkWidth / 2, crosswalkBar, crosswalkWidth);
      graphics.fillRect(roadInsetX + roadWidth + 12 + shift, this.map.height / 2 - crosswalkWidth / 2, crosswalkBar, crosswalkWidth);
    }

    this.addUrbanBuildings(roadInsetX, roadInsetY, roadWidth, roadHeight);
    this.addUrbanTrees(roadInsetX, roadInsetY, roadWidth, roadHeight);
    this.addParkedCars(roadInsetX, roadInsetY, roadWidth, roadHeight);

    const border = this.add.rectangle(
      this.map.width / 2,
      this.map.height / 2,
      this.map.width - WORLD_PADDING,
      this.map.height - WORLD_PADDING,
      0x000000,
      0,
    );
    border.setStrokeStyle(8, 0x9ba2a8, 0.9);
    border.setDepth(-5);
  }

  private addUrbanBuildings(roadInsetX: number, roadInsetY: number, roadWidth: number, roadHeight: number): void {
    const buildingConfigs = [
      { x: 110, y: 120, width: roadInsetX - 180, height: roadInsetY - 170, color: 0x8b775f },
      { x: this.map.width - roadInsetX + 60, y: 120, width: roadInsetX - 180, height: roadInsetY - 170, color: 0x6e7b86 },
      { x: 110, y: this.map.height - roadInsetY + 60, width: roadInsetX - 180, height: roadInsetY - 170, color: 0x7b6f82 },
      {
        x: this.map.width - roadInsetX + 60,
        y: this.map.height - roadInsetY + 60,
        width: roadInsetX - 180,
        height: roadInsetY - 170,
        color: 0x7f6958,
      },
    ].filter((building) => building.width > 40 && building.height > 40);

    for (const building of buildingConfigs) {
      const block = this.add.rectangle(
        building.x + building.width / 2,
        building.y + building.height / 2,
        building.width,
        building.height,
        building.color,
        0.98,
      );
      block.setStrokeStyle(4, 0x2b2f33, 0.55).setDepth(-11);

      const windowColumns = Math.max(2, Math.floor(building.width / 70));
      const windowRows = Math.max(2, Math.floor(building.height / 60));
      const spacingX = building.width / (windowColumns + 1);
      const spacingY = building.height / (windowRows + 1);

      for (let column = 1; column <= windowColumns; column += 1) {
        for (let row = 1; row <= windowRows; row += 1) {
          this.add
            .rectangle(
              building.x + spacingX * column,
              building.y + spacingY * row,
              16,
              22,
              0xcdd6db,
              0.68,
            )
            .setDepth(-10);
        }
      }
    }

    const plaza = this.add.rectangle(this.map.width / 2, this.map.height / 2, roadWidth * 0.18, roadHeight * 0.18, 0x666d72, 0.65);
    plaza.setStrokeStyle(4, 0x8d959b, 0.5).setDepth(-11);
  }

  private addUrbanTrees(roadInsetX: number, roadInsetY: number, roadWidth: number, roadHeight: number): void {
    const treeSpots = [
      { x: roadInsetX * 0.55, y: roadInsetY * 0.58 },
      { x: this.map.width - roadInsetX * 0.55, y: roadInsetY * 0.58 },
      { x: roadInsetX * 0.55, y: this.map.height - roadInsetY * 0.58 },
      { x: this.map.width - roadInsetX * 0.55, y: this.map.height - roadInsetY * 0.58 },
      { x: this.map.width / 2, y: roadInsetY * 0.46 },
      { x: this.map.width / 2, y: this.map.height - roadInsetY * 0.46 },
      { x: roadInsetX * 0.42, y: this.map.height / 2 },
      { x: this.map.width - roadInsetX * 0.42, y: this.map.height / 2 },
    ];

    for (const spot of treeSpots) {
      this.add.rectangle(spot.x, spot.y + 12, 12, 26, 0x6b4e34, 0.95).setDepth(-10);
      this.add.circle(spot.x, spot.y - 8, 24, 0x3d7b45, 0.95).setDepth(-9);
      this.add.circle(spot.x - 12, spot.y - 2, 16, 0x4d9455, 0.9).setDepth(-9);
      this.add.circle(spot.x + 12, spot.y - 2, 16, 0x4d9455, 0.9).setDepth(-9);
    }
  }

  private addParkedCars(roadInsetX: number, roadInsetY: number, roadWidth: number, roadHeight: number): void {
    const carConfigs = [
      { x: this.map.width / 2 - 180, y: roadInsetY - 74, color: 0xc94a3f, rotation: 0 },
      { x: this.map.width / 2 + 180, y: roadInsetY - 74, color: 0x4e89d8, rotation: 0 },
      { x: this.map.width / 2 - 180, y: roadInsetY + roadHeight + 74, color: 0xd7a53d, rotation: 0 },
      { x: this.map.width / 2 + 180, y: roadInsetY + roadHeight + 74, color: 0x8f5fd1, rotation: 0 },
      { x: roadInsetX - 74, y: this.map.height / 2 - 180, color: 0x3ca7a2, rotation: 90 },
      { x: roadInsetX - 74, y: this.map.height / 2 + 180, color: 0xbb5252, rotation: 90 },
      { x: roadInsetX + roadWidth + 74, y: this.map.height / 2 - 180, color: 0x9babb7, rotation: 90 },
      { x: roadInsetX + roadWidth + 74, y: this.map.height / 2 + 180, color: 0x50565d, rotation: 90 },
    ];

    for (const car of carConfigs) {
      const body = this.add.rectangle(car.x, car.y, 64, 30, car.color, 0.96).setDepth(-9);
      body.setStrokeStyle(3, 0x1c1f22, 0.5);
      body.setAngle(car.rotation);
      this.add.rectangle(car.x, car.y, 26, 18, 0xcfe3f7, 0.85).setDepth(-8).setAngle(car.rotation);
    }
  }

  private addCaptureTheFlagArena(): void {
    const config = this.map.ctf;

    if (!config) {
      return;
    }

    const blueBase = this.add
      .circle(config.blueBase.x, config.blueBase.y, config.blueBase.radius, 0x3aa7ff, CTF_BASE_ALPHA)
      .setStrokeStyle(5, 0x6ec6ff, 0.72)
      .setDepth(2);
    const redBase = this.add
      .circle(config.redBase.x, config.redBase.y, config.redBase.radius, 0xff4b3a, CTF_BASE_ALPHA)
      .setStrokeStyle(5, 0xff8375, 0.72)
      .setDepth(2);

    const blueFlag = this.createFlag("blue", config.blueFlag, 0x46b8ff);
    const redFlag = this.createFlag("red", config.redFlag, 0xff533f);

    this.ctf = {
      bases: { blue: blueBase, red: redBase },
      flags: { blue: blueFlag, red: redFlag },
    };
  }

  private createFlag(team: TeamId, home: Vec2, color: number): CtfFlagRuntime {
    const pole = this.add.rectangle(home.x - 10, home.y, 6, 64, 0xf4e8bb, 0.95).setDepth(TANK_DEPTH + 4);
    const sprite = this.add.rectangle(home.x + 15, home.y - 18, 44, 28, color, 0.95).setDepth(TANK_DEPTH + 5);

    return {
      team,
      state: "home",
      home: { ...home },
      position: { ...home },
      sprite,
      pole,
    };
  }

  private getPlaylistMap(index: number): CampaignMap {
    if (this.isCaptureTheFlag()) {
      return CAPTURE_THE_FLAG_MAPS[index] ?? CAPTURE_THE_FLAG_MAPS[0];
    }

    return CAMPAIGN_MAPS[index] ?? CAMPAIGN_MAPS[0];
  }

  private getCtfSpawn(team: TeamId, index: number): Vec2 {
    const config = this.map.ctf;

    if (!config) {
      return team === "blue" ? this.map.playerSpawn : this.map.enemySpawns[index] ?? this.map.enemySpawns[0];
    }

    const spawns = team === "blue" ? config.blueSpawns : config.redSpawns;
    return spawns[index] ?? spawns[0] ?? (team === "blue" ? config.blueBase : config.redBase);
  }

  private addObstacle(obstacle: ObstacleConfig): void {
    const key = obstacle.kind === "crate" ? "crate" : obstacle.kind;
    const sprite = this.obstacles.create(obstacle.x, obstacle.y, key) as Phaser.Physics.Arcade.Image;
    sprite.setDepth(8);
    sprite.setAngle(obstacle.rotation ?? 0);
    sprite.setScale(obstacle.kind === "barricade" ? 1.35 : 1.25);
    sprite.refreshBody();
  }

  private addPickup(config: PickupConfig): void {
    const key =
      config.type === "speed" ? "pickupSpeed" : config.type === "rapidFire" ? "pickupRapidFire" : "pickupShield";
    const pickup = this.pickups.create(config.x, config.y, key) as PickupSprite;
    pickup.pickupType = config.type;
    pickup.respawnAt = 0;
    pickup.baseY = config.y;
    pickup.floatPhase = Math.random() * Math.PI * 2;
    pickup.glow = this.add.circle(
      config.x,
      config.y,
      config.type === "rapidFire" ? 28 : 24,
      getPickupTint(config.type),
      PICKUP_GLOW_ALPHA,
    );
    pickup.glow.setDepth(TANK_DEPTH + 2);
    pickup.glow.setBlendMode(Phaser.BlendModes.ADD);
    pickup.setDepth(TANK_DEPTH + 3);
    pickup.setScale(this.getPickupScale(config.type));
    pickup.setAlpha(0.92);
    pickup.setTint(getPickupTint(config.type));
    pickup.setAngle(config.type === "speed" ? -16 : config.type === "rapidFire" ? 0 : 16);
    const body = pickup.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setCircle(
      PICKUP_BODY_RADIUS,
      pickup.width / 2 - PICKUP_BODY_RADIUS,
      pickup.height / 2 - PICKUP_BODY_RADIUS,
    );
  }

  private getPickupScale(type: PickupConfig["type"]): number {
    return type === "rapidFire" ? PICKUP_BARREL_SCALE : PICKUP_ICON_SCALE;
  }

  private addTank(id: string, spawn: Vec2, archetype: EnemyArchetype): TankRuntime {
    const side = id === "player" ? "player" : id === "playerTwo" ? "playerTwo" : "enemy";
    const isBlueTeammate = side === "playerTwo" && this.isCaptureTheFlag();
    const hullKey = side === "player" || isBlueTeammate ? "playerHull" : side === "playerTwo" ? "enemyLightHull" : this.enemyHullKey(archetype);
    const turretKey =
      side === "player" || isBlueTeammate ? "playerTurret" : side === "playerTwo" ? "enemyLightTurret" : this.enemyTurretKey(archetype);
    const hull = this.physics.add.image(spawn.x, spawn.y, hullKey);
    const turret = this.add.image(spawn.x, spawn.y, turretKey);
    const frontMarker =
      side === "enemy"
        ? undefined
        : this.add.rectangle(
            spawn.x,
            spawn.y - PLAYER_FRONT_MARKER_OFFSET,
            18,
            6,
            side === "player" ? 0xf6df85 : 0xff8a62,
            0.95,
          );
    const tank: TankRuntime = {
      id,
      side,
      archetype,
      hull,
      turret,
      frontMarker,
      spawn,
      alive: true,
      maxHealth: this.isCaptureTheFlag() ? CTF_TANK_HEALTH : side === "enemy" ? ENEMY_HEALTH[archetype] : 1,
      health: this.isCaptureTheFlag() ? CTF_TANK_HEALTH : side === "enemy" ? ENEMY_HEALTH[archetype] : 1,
      respawnAt: 0,
      lastFiredAt: -10_000,
      nextDecisionAt: 0,
      aimAngle: side === "player" ? -Math.PI / 2 : side === "playerTwo" ? Math.PI / 2 : 0,
      moveAngle: undefined,
      nextMoveDecisionAt: 0,
      lastDustAt: undefined,
      lastTreadMarkPosition: undefined,
      buffs: { ...EMPTY_BUFFS },
    };

    hull.setDepth(TANK_DEPTH);
    hull.setDrag(0.96);
    hull.setScale(isBlueTeammate ? 0.92 : archetype === "boss" ? 1.45 : archetype === "heavy" ? 1.1 : 1);
    if (isBlueTeammate) {
      hull.setTint(0x75d7ff);
    }
    hull.setCollideWorldBounds(true);
    hull.body!.setSize(archetype === "boss" ? 76 : 56, archetype === "boss" ? 76 : 56);
    turret.setDepth(TANK_DEPTH + 1);
    turret.setScale(isBlueTeammate ? 1.3 : archetype === "boss" ? 2 : archetype === "heavy" ? 1.55 : 1.4);
    if (isBlueTeammate) {
      turret.setTint(0x75d7ff);
    }
    frontMarker?.setDepth(TANK_DEPTH + 2);
    this.tankByBody.set(hull, tank);

    return tank;
  }

  private enemyHullKey(archetype: EnemyArchetype): string {
    if (archetype === "light") {
      return "enemyLightHull";
    }

    if (archetype === "heavy" || archetype === "boss") {
      return "enemyHeavyHull";
    }

    return "enemyStandardHull";
  }

  private enemyTurretKey(archetype: EnemyArchetype): string {
    if (archetype === "light") {
      return "enemyLightTurret";
    }

    if (archetype === "heavy" || archetype === "boss") {
      return "enemyHeavyTurret";
    }

    return "enemyStandardTurret";
  }

  private updatePlayer(time: number): void {
    if (this.isCoOp()) {
      this.updateCoOpTank(time);
      return;
    }

    this.updateHumanTank(this.player, 0, time);

    if (this.playerTwo && this.isHumanControlledTank(this.playerTwo)) {
      this.updateHumanTank(this.playerTwo, 1, time);
    }
  }

  private updateCoOpTank(time: number): void {
    if (!this.player.alive || this.isPlayerInRespawnCountdown(time)) {
      this.player.hull.setVelocity(0, 0);
      return;
    }

    const drive = this.getDriveInput(0);
    const aim = this.getAimVector(1);
    const stats = getEffectiveStats(PLAYER_BASE_STATS, this.player.buffs, time);
    const deltaSeconds = this.game.loop.delta / 1_000;
    const effectiveTurn = drive.turn * Math.sign(drive.throttle);
    const hullTurnDelta = effectiveTurn * PLAYER_TURN_RATE * deltaSeconds;
    const nextRotation = this.player.hull.rotation + hullTurnDelta;
    const forwardAngle = nextRotation - Math.PI / 2;

    this.player.hull.setRotation(nextRotation);
    this.player.hull.setVelocity(
      Math.cos(forwardAngle) * drive.throttle * stats.speed,
      Math.sin(forwardAngle) * drive.throttle * stats.speed,
    );
    this.player.aimAngle += hullTurnDelta + aim.x * PLAYER_TURRET_TURN_RATE * deltaSeconds;

    if (
      this.wantsFire(1) &&
      !isGunFrozen(this.playerGunHeat, time) &&
      time - this.player.lastFiredAt >= stats.fireCooldownMs &&
      this.fireBullet(this.player, stats.bulletSpeed, time)
    ) {
      this.playerGunHeat = recordPlayerShot(this.playerGunHeat, time);
    }
  }

  private updateHumanTank(tank: TankRuntime, playerIndex: 0 | 1, time: number): void {
    if (!tank.alive || (tank.side === "player" && this.isPlayerInRespawnCountdown(time))) {
      tank.hull.setVelocity(0, 0);
      return;
    }

    const drive = this.getDriveInput(playerIndex);
    const aim = this.getAimVector(playerIndex);
    const stats = getEffectiveStats(PLAYER_BASE_STATS, tank.buffs, time);
    const deltaSeconds = this.game.loop.delta / 1_000;
    const effectiveTurn = drive.turn * Math.sign(drive.throttle);
    const hullTurnDelta = effectiveTurn * PLAYER_TURN_RATE * deltaSeconds;
    const nextRotation = tank.hull.rotation + hullTurnDelta;
    const forwardAngle = nextRotation - Math.PI / 2;

    tank.hull.setRotation(nextRotation);
    tank.hull.setVelocity(
      Math.cos(forwardAngle) * drive.throttle * stats.speed,
      Math.sin(forwardAngle) * drive.throttle * stats.speed,
    );

    tank.aimAngle += hullTurnDelta + aim.x * PLAYER_TURRET_TURN_RATE * deltaSeconds;

    const canFire =
      playerIndex === 0
        ? !isGunFrozen(this.playerGunHeat, time) && time - tank.lastFiredAt >= stats.fireCooldownMs
        : time - tank.lastFiredAt >= stats.fireCooldownMs;

    if (this.wantsFire(playerIndex) && canFire) {
      if (this.fireBullet(tank, stats.bulletSpeed, time) && playerIndex === 0) {
        this.playerGunHeat = recordPlayerShot(this.playerGunHeat, time);
      }
    }
  }

  private updateEnemies(time: number): void {
    if (this.isCaptureTheFlag()) {
      this.updateCaptureTheFlagAi(time);
      return;
    }

    if (this.isDeathmatch()) {
      return;
    }

    if (!this.player.alive || this.isPlayerInRespawnCountdown(time)) {
      for (const enemy of this.enemies) {
        enemy.hull.setVelocity(0, 0);
      }

      return;
    }

    for (const enemy of this.enemies) {
      if (!enemy.alive) {
        enemy.hull.setVelocity(0, 0);
        continue;
      }

      const baseStats = getRampedEnemyStats(ENEMY_STATS[enemy.archetype ?? "standard"], this.enemyDifficulty);
      const stats = getEffectiveStats(baseStats, enemy.buffs, time);
      const distance = Phaser.Math.Distance.Between(enemy.hull.x, enemy.hull.y, this.player.hull.x, this.player.hull.y);
      const desiredAngle = Phaser.Math.Angle.Between(enemy.hull.x, enemy.hull.y, this.player.hull.x, this.player.hull.y);
      // Opportunistic pickup grab: only divert toward a power-up that is close and
      // has a clear path; otherwise keep hunting the player.
      const pickupTarget = this.findOpportunisticPickup(enemy);
      const moveAngle = pickupTarget
        ? Phaser.Math.Angle.Between(enemy.hull.x, enemy.hull.y, pickupTarget.x, pickupTarget.y)
        : this.resolveEnemyMoveAngle(enemy, desiredAngle, distance, time);
      enemy.moveAngle = moveAngle;
      const hasLineOfSight = !this.isSegmentBlocked(
        { x: enemy.hull.x, y: enemy.hull.y },
        { x: this.player.hull.x, y: this.player.hull.y },
        ENEMY_FIRE_LINE_PADDING,
      );

      const hullTurnDelta = this.applyAiTankDrive(enemy, moveAngle, distance, stats);

      this.updateAiTurret(enemy, desiredAngle, hullTurnDelta);

      if (
        hasLineOfSight &&
        distance < ENEMY_FIRE_RANGE &&
        this.isTurretAimedAt(enemy, this.player) &&
        time - enemy.lastFiredAt >= stats.fireCooldownMs
      ) {
        this.fireBullet(enemy, stats.bulletSpeed, time);
      }
    }
  }

  private updateCaptureTheFlagAi(time: number): void {
    for (const tank of this.getCtfAiTanks()) {
      if (!tank.alive) {
        tank.hull.setVelocity(0, 0);
        this.setAiRoleLabel(tank, "");
        continue;
      }

      const stats = getEffectiveStats(this.getAiTankStats(tank), tank.buffs, time);
      const role = this.getCtfAiRole(tank);
      const target = this.getCtfAiTarget(tank, role);
      const moveTarget = this.getCtfAiMoveTarget(tank, role, target);
      this.setAiRoleLabel(tank, role);
      const desiredAngle = Phaser.Math.Angle.Between(tank.hull.x, tank.hull.y, moveTarget.x, moveTarget.y);
      const distance = Phaser.Math.Distance.Between(tank.hull.x, tank.hull.y, moveTarget.x, moveTarget.y);
      const moveAngle = this.resolveCtfMoveAngle(tank, desiredAngle, distance, moveTarget, time);
      const attackTarget = this.getNearestLivingOpponent(tank);

      tank.moveAngle = moveAngle;
      const hullTurnDelta = this.applyAiTankDrive(tank, moveAngle, distance, stats, this.getCtfAiStopDistance(role));

      if (attackTarget) {
        this.updateAiTurret(
          tank,
          Phaser.Math.Angle.Between(tank.hull.x, tank.hull.y, attackTarget.hull.x, attackTarget.hull.y),
          hullTurnDelta,
        );
      } else {
        tank.aimAngle += hullTurnDelta;
      }

      if (attackTarget && this.canAiFireAt(tank, attackTarget, stats, time)) {
        this.fireBullet(tank, stats.bulletSpeed, time);
      }

    }
  }

  private applyAiTankDrive(
    tank: TankRuntime,
    desiredForwardAngle: number,
    distanceToTarget: number,
    stats: TankStats,
    stopDistance = AI_STOP_DISTANCE,
  ): number {
    const deltaSeconds = this.game.loop.delta / 1_000;

    if (distanceToTarget <= stopDistance) {
      tank.hull.setVelocity(0, 0);
      return 0;
    }

    const currentForwardAngle = tank.hull.rotation - Math.PI / 2;
    const forwardAngleDelta = Phaser.Math.Angle.Wrap(desiredForwardAngle - currentForwardAngle);
    const reverseAngleDelta = Phaser.Math.Angle.Wrap(desiredForwardAngle - (currentForwardAngle + Math.PI));
    const shouldReverse = Math.abs(reverseAngleDelta) + 0.22 < Math.abs(forwardAngleDelta);
    const angleDelta = shouldReverse ? reverseAngleDelta : forwardAngleDelta;
    const maxTurn = PLAYER_TURN_RATE * deltaSeconds;
    const hullTurnDelta = Phaser.Math.Clamp(angleDelta, -maxTurn, maxTurn);
    const nextRotation = tank.hull.rotation + hullTurnDelta;
    const nextForwardAngle = nextRotation - Math.PI / 2;
    const alignment = Math.cos(angleDelta);
    const throttleMagnitude = Phaser.Math.Clamp((alignment + 1) / 2, AI_MIN_DRIVE_THROTTLE, 1);
    const throttle = shouldReverse ? -throttleMagnitude : throttleMagnitude;

    tank.hull.setRotation(nextRotation);
    tank.hull.setVelocity(Math.cos(nextForwardAngle) * throttle * stats.speed, Math.sin(nextForwardAngle) * throttle * stats.speed);

    return hullTurnDelta;
  }

  private getCtfAiStopDistance(role: CtfAiRole): number {
    if (role === "Recover Flag" || role === "Raid Flag") {
      return AI_FLAG_OBJECTIVE_STOP_DISTANCE;
    }

    return AI_STOP_DISTANCE;
  }

  private isCtfFlagObjective(role: CtfAiRole): boolean {
    return role === "Return to Base" || role === "Recover Flag" || role === "Raid Flag";
  }

  private updateAiTurret(tank: TankRuntime, desiredAimAngle: number, hullTurnDelta: number): void {
    const deltaSeconds = this.game.loop.delta / 1_000;
    const carriedAimAngle = tank.aimAngle + hullTurnDelta;
    const maxCounterTurn = PLAYER_TURRET_TURN_RATE * deltaSeconds;
    const aimDelta = Phaser.Math.Angle.Wrap(desiredAimAngle - carriedAimAngle);

    tank.aimAngle = carriedAimAngle + Phaser.Math.Clamp(aimDelta, -maxCounterTurn, maxCounterTurn);
  }

  private getAiTankStats(tank: TankRuntime) {
    if (this.getTankTeam(tank) === "blue") {
      return PLAYER_BASE_STATS;
    }

    return getRampedEnemyStats(ENEMY_STATS[tank.archetype ?? "standard"], this.enemyDifficulty);
  }

  private getCtfAiTanks(): TankRuntime[] {
    return [
      ...(this.playerTwo && !this.isHumanControlledTank(this.playerTwo) ? [this.playerTwo] : []),
      ...this.enemies,
    ];
  }

  private getCtfAiRole(tank: TankRuntime): CtfAiRole {
    const team = this.getTankTeam(tank);
    const ownFlag = this.getTeamFlag(team);
    const carriedFlag = this.getCarriedFlag(tank);
    const enemyFlag = this.getTeamFlag(this.getOpposingTeam(team));
    const friendlyCarrier = enemyFlag?.carrier && this.getTankTeam(enemyFlag.carrier) === team ? enemyFlag.carrier : undefined;

    if (carriedFlag) {
      return "Return to Base";
    }

    if (
      ownFlag?.carrier &&
      this.getTankTeam(ownFlag.carrier) !== team &&
      enemyFlag?.state === "home" &&
      this.isBetweenCarrierAndBase(tank, ownFlag.carrier, this.getTeamBase(this.getOpposingTeam(team)))
    ) {
      return "Raid Flag";
    }

    if (ownFlag?.carrier && this.getTankTeam(ownFlag.carrier) !== team) {
      return "Stop Carrier";
    }

    if (ownFlag?.state === "dropped") {
      return "Recover Flag";
    }

    if (friendlyCarrier && friendlyCarrier !== tank) {
      return "Hunt Defender";
    }

    if (this.isDesignatedFlagRaider(tank, team)) {
      return "Raid Flag";
    }

    if (this.getEnemyClosestToTeamFlag(team, CTF_FLAG_THREAT_RANGE) && this.isDesignatedFlagDefender(tank, team)) {
      return "Protect Flag";
    }

    return "Raid Flag";
  }

  private getCtfAiTarget(tank: TankRuntime, role: CtfAiRole): Vec2 {
    const team = this.getTankTeam(tank);
    const ownFlag = this.getTeamFlag(team);
    const enemyFlag = this.getTeamFlag(this.getOpposingTeam(team));

    if (role === "Return to Base") {
      return this.getTeamBase(team);
    }

    if (role === "Stop Carrier" && ownFlag?.carrier) {
      return { x: ownFlag.carrier.hull.x, y: ownFlag.carrier.hull.y };
    }

    if (role === "Recover Flag" && ownFlag) {
      return ownFlag.position;
    }

    if (role === "Hunt Defender") {
      const defender = this.getEnemyClosestToTeamFlag(team);
      if (defender) {
        return { x: defender.hull.x, y: defender.hull.y };
      }
    }

    if (role === "Protect Flag") {
      const threat = this.getEnemyClosestToTeamFlag(team, CTF_FLAG_THREAT_RANGE);
      if (threat) {
        return { x: threat.hull.x, y: threat.hull.y };
      }

      return ownFlag?.position ?? this.getTeamBase(team);
    }

    return enemyFlag?.position ?? this.getTeamBase(this.getOpposingTeam(team));
  }

  private getCtfAiMoveTarget(tank: TankRuntime, role: CtfAiRole, target: Vec2): Vec2 {
    const position = { x: tank.hull.x, y: tank.hull.y };
    const distance = Phaser.Math.Distance.Between(position.x, position.y, target.x, target.y);

    if (distance < 620 || !this.isSegmentBlocked(position, target, ENEMY_FIRE_LINE_PADDING)) {
      return target;
    }

    return this.getBestCtfWaypoint(position, target, role);
  }

  private getBestCtfWaypoint(position: Vec2, target: Vec2, role: CtfAiRole): Vec2 {
    const direction = Math.sign(target.x - position.x) || 1;
    const midX = (position.x + target.x) / 2;
    const laneOffset = Math.min(340, this.map.height * 0.24);
    const xCandidates = [
      position.x + direction * 420,
      midX,
      this.map.width / 2,
      target.x - direction * 280,
    ];
    const yCandidates = [
      target.y,
      target.y - laneOffset,
      target.y + laneOffset,
      this.map.height * 0.24,
      this.map.height * 0.76,
      position.y,
    ];
    let best = target;
    let bestScore = -Infinity;

    for (const x of xCandidates) {
      for (const y of yCandidates) {
        const candidate = {
          x: Phaser.Math.Clamp(x, SPAWN_MARGIN, this.map.width - SPAWN_MARGIN),
          y: Phaser.Math.Clamp(y, SPAWN_MARGIN, this.map.height - SPAWN_MARGIN),
        };

        if (!this.isPointInsideWorld(candidate)) {
          continue;
        }

        const blockedToCandidate = this.isSegmentBlocked(position, candidate, ENEMY_FIRE_LINE_PADDING);
        const blockedToTarget = this.isSegmentBlocked(candidate, target, ENEMY_FIRE_LINE_PADDING);
        const distanceFromPosition = Phaser.Math.Distance.Between(position.x, position.y, candidate.x, candidate.y);
        const distanceToTarget = Phaser.Math.Distance.Between(candidate.x, candidate.y, target.x, target.y);
        const progress = Phaser.Math.Distance.Between(position.x, position.y, target.x, target.y) - distanceToTarget;
        const roleUrgency = this.isCtfFlagObjective(role) ? 1.6 : 1.15;
        const score =
          progress * roleUrgency -
          distanceFromPosition * 0.12 -
          (blockedToCandidate ? 900 : 0) -
          (blockedToTarget ? 260 : 0) +
          this.getObstacleClearance(candidate) * 0.25;

        if (score > bestScore) {
          best = candidate;
          bestScore = score;
        }
      }
    }

    return best;
  }

  private getEnemyClosestToTeamFlag(team: TeamId, maxDistance = Infinity): TankRuntime | undefined {
    const flag = this.getTeamFlag(team);
    const base = this.getTeamBase(team);
    const anchor = flag?.state === "home" ? flag.position : base;
    let best: TankRuntime | undefined;
    let bestDistance = Infinity;

    for (const candidate of this.getAllTanks()) {
      if (!candidate.alive || this.getTankTeam(candidate) === team) {
        continue;
      }

      const distance = Phaser.Math.Distance.Between(candidate.hull.x, candidate.hull.y, anchor.x, anchor.y);
      if (distance <= maxDistance && distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }

    return best;
  }

  private isBetweenCarrierAndBase(tank: TankRuntime, carrier: TankRuntime, base: Vec2): boolean {
    const carrierPosition = { x: carrier.hull.x, y: carrier.hull.y };
    const tankPosition = { x: tank.hull.x, y: tank.hull.y };
    const segmentX = base.x - carrierPosition.x;
    const segmentY = base.y - carrierPosition.y;
    const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;

    if (segmentLengthSquared === 0) {
      return false;
    }

    const projection =
      ((tankPosition.x - carrierPosition.x) * segmentX + (tankPosition.y - carrierPosition.y) * segmentY) /
      segmentLengthSquared;

    if (projection <= 0 || projection >= 1) {
      return false;
    }

    const closestPoint = {
      x: carrierPosition.x + segmentX * projection,
      y: carrierPosition.y + segmentY * projection,
    };
    const crossTrackDistance = Phaser.Math.Distance.Between(
      tankPosition.x,
      tankPosition.y,
      closestPoint.x,
      closestPoint.y,
    );

    return crossTrackDistance < 300;
  }

  private isDesignatedFlagDefender(tank: TankRuntime, team: TeamId): boolean {
    const anchor = this.getTeamFlag(team)?.position ?? this.getTeamBase(team);
    let defender: TankRuntime | undefined;
    let bestDistance = Infinity;

    for (const candidate of this.getCtfAiTanks()) {
      if (!candidate.alive || this.getTankTeam(candidate) !== team || this.getCarriedFlag(candidate)) {
        continue;
      }

      const distance = Phaser.Math.Distance.Between(candidate.hull.x, candidate.hull.y, anchor.x, anchor.y);
      if (distance < bestDistance) {
        defender = candidate;
        bestDistance = distance;
      }
    }

    return defender === tank;
  }

  private isDesignatedFlagRaider(tank: TankRuntime, team: TeamId): boolean {
    const enemyFlag = this.getTeamFlag(this.getOpposingTeam(team));
    const target = enemyFlag?.position ?? this.getTeamBase(this.getOpposingTeam(team));
    let raider: TankRuntime | undefined;
    let bestDistance = Infinity;

    for (const candidate of this.getCtfAiTanks()) {
      if (!candidate.alive || this.getTankTeam(candidate) !== team || this.getCarriedFlag(candidate)) {
        continue;
      }

      const distance = Phaser.Math.Distance.Between(candidate.hull.x, candidate.hull.y, target.x, target.y);
      if (distance < bestDistance) {
        raider = candidate;
        bestDistance = distance;
      }
    }

    return raider === tank;
  }

  private resolveCtfMoveAngle(
    tank: TankRuntime,
    desiredAngle: number,
    distanceToTarget: number,
    target: Vec2,
    time: number,
  ): number {
    if (tank.unstuckMoveAngle !== undefined && tank.unstuckUntil !== undefined && time < tank.unstuckUntil) {
      return tank.unstuckMoveAngle;
    }

    if (shouldReuseEnemyMoveAngle(tank.moveAngle, tank.nextMoveDecisionAt, time)) {
      return tank.moveAngle;
    }

    tank.nextMoveDecisionAt = time + ENEMY_MOVE_DECISION_MS;
    const unstuckAngle = this.getCtfUnstuckAngle(tank, desiredAngle, distanceToTarget, target, time);
    if (unstuckAngle !== undefined) {
      tank.unstuckMoveAngle = unstuckAngle;
      tank.unstuckUntil = time + AI_UNSTUCK_DURATION_MS;
      return unstuckAngle;
    }

    return desiredAngle;
  }

  private getCtfUnstuckAngle(
    tank: TankRuntime,
    desiredAngle: number,
    distanceToTarget: number,
    target: Vec2,
    time: number,
  ): number | undefined {
    if (distanceToTarget <= AI_STOP_DISTANCE || !this.isSegmentBlocked({ x: tank.hull.x, y: tank.hull.y }, target, ENEMY_FIRE_LINE_PADDING)) {
      tank.lastAiProgressAt = time;
      tank.lastAiProgressDistance = distanceToTarget;
      tank.unstuckMoveAngle = undefined;
      tank.unstuckUntil = undefined;
      return undefined;
    }

    if (tank.lastAiProgressAt === undefined || tank.lastAiProgressDistance === undefined) {
      tank.lastAiProgressAt = time;
      tank.lastAiProgressDistance = distanceToTarget;
      return undefined;
    }

    if (tank.lastAiProgressDistance - distanceToTarget > AI_STUCK_PROGRESS_EPSILON) {
      tank.lastAiProgressAt = time;
      tank.lastAiProgressDistance = distanceToTarget;
      tank.unstuckMoveAngle = undefined;
      tank.unstuckUntil = undefined;
      return undefined;
    }

    if (time - tank.lastAiProgressAt < AI_STUCK_CHECK_MS) {
      return undefined;
    }

    tank.lastAiProgressAt = time;
    tank.lastAiProgressDistance = distanceToTarget;
    return this.getBestCtfUnstuckAngle(tank, desiredAngle, target);
  }

  private getBestCtfUnstuckAngle(tank: TankRuntime, desiredAngle: number, target: Vec2): number {
    const position = { x: tank.hull.x, y: tank.hull.y };
    const candidates = [
      desiredAngle + Math.PI / 2,
      desiredAngle - Math.PI / 2,
      desiredAngle + Math.PI / 3,
      desiredAngle - Math.PI / 3,
      desiredAngle + (Math.PI * 2) / 3,
      desiredAngle - (Math.PI * 2) / 3,
      desiredAngle + Math.PI,
    ];
    let bestAngle = desiredAngle;
    let bestScore = -Infinity;

    for (const angle of candidates) {
      const probe = {
        x: position.x + Math.cos(angle) * 260,
        y: position.y + Math.sin(angle) * 260,
      };

      if (!this.isPointInsideWorld(probe)) {
        continue;
      }

      const blocked = this.isSegmentBlocked(position, probe, ENEMY_FIRE_LINE_PADDING);
      const distanceToTarget = Phaser.Math.Distance.Between(probe.x, probe.y, target.x, target.y);
      const clearance = this.getObstacleClearance(probe);
      const angleCost = Math.abs(Phaser.Math.Angle.Wrap(angle - desiredAngle)) * 70;
      const score = -distanceToTarget + clearance * 0.9 - angleCost - (blocked ? 900 : 0);

      if (score > bestScore) {
        bestAngle = angle;
        bestScore = score;
      }
    }

    return bestAngle;
  }

  private canAiFireAt(tank: TankRuntime, target: TankRuntime, stats: TankStats, time: number): boolean {
    const distance = Phaser.Math.Distance.Between(tank.hull.x, tank.hull.y, target.hull.x, target.hull.y);
    const hasLineOfSight = !this.isSegmentBlocked(
      { x: tank.hull.x, y: tank.hull.y },
      { x: target.hull.x, y: target.hull.y },
      ENEMY_FIRE_LINE_PADDING,
    );

    return (
      hasLineOfSight &&
      distance < ENEMY_FIRE_RANGE &&
      this.isTurretAimedAt(tank, target) &&
      time - tank.lastFiredAt >= stats.fireCooldownMs
    );
  }

  private isTurretAimedAt(tank: TankRuntime, target: TankRuntime): boolean {
    const desiredAimAngle = Phaser.Math.Angle.Between(tank.hull.x, tank.hull.y, target.hull.x, target.hull.y);
    return Math.abs(Phaser.Math.Angle.Wrap(desiredAimAngle - tank.aimAngle)) < 0.18;
  }

  private resolveEnemyMoveAngle(enemy: TankRuntime, desiredAngle: number, distanceToPlayer: number, time: number): number {
    if (shouldReuseEnemyMoveAngle(enemy.moveAngle, enemy.nextMoveDecisionAt, time)) {
      return enemy.moveAngle;
    }

    const moveAngle = this.getEnemyMoveAngle(enemy, desiredAngle, distanceToPlayer);
    enemy.nextMoveDecisionAt = time + ENEMY_MOVE_DECISION_MS;
    return moveAngle;
  }

  private getEnemyMoveAngle(enemy: TankRuntime, desiredAngle: number, distanceToPlayer: number): number {
    const enemyPosition = { x: enemy.hull.x, y: enemy.hull.y };
    const playerPosition = { x: this.player.hull.x, y: this.player.hull.y };

    return selectEnemyMoveAngle({
      enemyPosition,
      playerPosition,
      desiredAngle,
      distanceToPlayer,
      previousMoveAngle: enemy.moveAngle,
      isSegmentBlocked: (start, end, padding) => this.isSegmentBlocked(start, end, padding),
      getObstacleClearance: (point) => this.getObstacleClearance(point),
      isPointInsideWorld: (point) => this.isPointInsideWorld(point),
    });
  }

  private findOpportunisticPickup(enemy: TankRuntime): PickupSprite | undefined {
    let best: PickupSprite | undefined;
    let bestDistance = ENEMY_PICKUP_SEEK_RANGE;

    for (const pickup of this.pickups.getChildren() as PickupSprite[]) {
      if (!pickup.active || !pickup.visible) {
        continue;
      }

      const distance = Phaser.Math.Distance.Between(enemy.hull.x, enemy.hull.y, pickup.x, pickup.y);

      if (
        distance < bestDistance &&
        !this.isSegmentBlocked({ x: enemy.hull.x, y: enemy.hull.y }, { x: pickup.x, y: pickup.y }, ENEMY_PATH_PADDING)
      ) {
        best = pickup;
        bestDistance = distance;
      }
    }

    return best;
  }

  private getDriveInput(playerIndex: 0 | 1 = 0): { throttle: number; turn: number } {
    const gamepad = navigator.getGamepads?.()[playerIndex];
    const drive = readDrive(gamepad, this.gamepadMapping);
    const keyboardTurn =
      playerIndex === 0 ? Number(this.keys.D.isDown) - Number(this.keys.A.isDown) : Number(this.keys.L.isDown) - Number(this.keys.J.isDown);
    const keyboardThrottle =
      playerIndex === 0 ? Number(this.keys.W.isDown) - Number(this.keys.S.isDown) : Number(this.keys.I.isDown) - Number(this.keys.K.isDown);

    return {
      throttle: Phaser.Math.Clamp(drive.throttle || keyboardThrottle, -1, 1),
      turn: Phaser.Math.Clamp(drive.turn || keyboardTurn, -1, 1),
    };
  }

  private getAimVector(playerIndex: 0 | 1 = 0): Vec2 {
    const gamepad = navigator.getGamepads?.()[playerIndex];
    const aim = readAim(gamepad, this.gamepadMapping);
    const keyboardX =
      playerIndex === 0 ? Number(this.cursors.right.isDown) - Number(this.cursors.left.isDown) : Number(this.keys.H.isDown) - Number(this.keys.F.isDown);
    return {
      x: aim.x || keyboardX,
      y: 0,
    };
  }

  private wantsFire(playerIndex: 0 | 1 = 0): boolean {
    const gamepad = navigator.getGamepads?.()[playerIndex];
    const keyboardFire = playerIndex === 0 ? this.keys.SPACE.isDown : this.keys.G.isDown;
    return Boolean(
      keyboardFire ||
        isGamepadButtonPressed(gamepad, this.gamepadMapping.fire),
    );
  }

  private applyDeadzone(value: number): number {
    return Math.abs(value) > 0.18 ? value : 0;
  }

  private normalize(vector: Vec2): Vec2 {
    const length = Math.hypot(vector.x, vector.y);

    if (length <= 1) {
      return vector;
    }

    return {
      x: vector.x / length,
      y: vector.y / length,
    };
  }

  private fireBullet(tank: TankRuntime, speed: number, time: number): boolean {
    if (tank.side === "enemy" && (!this.player.alive || this.isPlayerInRespawnCountdown(time))) {
      return false;
    }

    const key = tank.side === "player" ? "bulletPlayer" : "bulletEnemy";
    const offset = 54;
    const bullet = this.bullets.get(
      tank.hull.x + Math.cos(tank.aimAngle) * offset,
      tank.hull.y + Math.sin(tank.aimAngle) * offset,
      key,
    ) as Phaser.Physics.Arcade.Image;

    if (!bullet) {
      return false;
    }

    bullet.setActive(true);
    bullet.setVisible(true);
    bullet.setDepth(30);
    bullet.setData("bullet", {
      owner: tank.side,
      startX: bullet.x,
      startY: bullet.y,
      maxRange: this.getBulletMaxRange(),
    } satisfies BulletData);
    bullet.setScale(1.2);
    bullet.setRotation(tank.aimAngle + Math.PI / 2);
    bullet.body!.enable = true;
    bullet.body!.setCircle(10);
    bullet.setVelocity(Math.cos(tank.aimAngle) * speed, Math.sin(tank.aimAngle) * speed);
    tank.lastFiredAt = time;
    this.playRandomSound(FIRE_SFX_KEYS, 0.42);
    return true;
  }

  private handleBulletHit(
    bulletObject: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.GameObjects.GameObject,
    hullObject: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.GameObjects.GameObject,
  ): void {
    const bullet = this.resolveGameObject(bulletObject) as Phaser.Physics.Arcade.Image;
    const hull = this.resolveGameObject(hullObject);
    const tank = hull ? this.tankByBody.get(hull) : undefined;
    const data = bullet.getData("bullet") as BulletData | undefined;

    if (!tank || !data || data.owner === tank.side || !tank.alive) {
      return;
    }

    this.destroyBullet(bullet, {
      angle: this.getBulletTravelAngle(bullet),
      kind: hasShield(tank.buffs, this.time.now) ? "shield" : "tank",
      scale: tank.archetype === "boss" ? 1.18 : tank.archetype === "heavy" ? 1.02 : 0.92,
    });
    this.damageTank(tank, data.owner);
  }

  private updateBulletHits(): void {
    for (const bullet of this.bullets.getChildren() as Phaser.Physics.Arcade.Image[]) {
      if (!bullet.active) {
        continue;
      }

      const data = bullet.getData("bullet") as BulletData | undefined;

      if (!data) {
        continue;
      }

      const targets = this.getBulletTargets(data.owner);

      for (const tank of targets) {
        if (!tank.alive) {
          continue;
        }

        const hitRadius = tank.archetype === "boss" ? 72 : tank.archetype === "heavy" ? 52 : 46;
        const distance = Phaser.Math.Distance.Between(bullet.x, bullet.y, tank.hull.x, tank.hull.y);

        if (distance <= hitRadius) {
          this.destroyBullet(bullet, {
            angle: this.getBulletTravelAngle(bullet),
            kind: hasShield(tank.buffs, this.time.now) ? "shield" : "tank",
            scale: tank.archetype === "boss" ? 1.18 : tank.archetype === "heavy" ? 1.02 : 0.92,
          });
          this.damageTank(tank, data.owner);
          break;
        }
      }
    }
  }

  private handlePickup(
    pickupObject: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.GameObjects.GameObject,
    hullObject: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.GameObjects.GameObject,
  ): void {
    const pickup = this.resolveGameObject(pickupObject) as PickupSprite;
    const hull = this.resolveGameObject(hullObject);
    const tank = hull ? this.tankByBody.get(hull) : undefined;

    if (!tank || !this.canTankCollectPickup(tank) || !pickup.active || !tank.alive) {
      return;
    }

    this.collectPickup(tank, pickup);
  }

  private updatePickupCollection(): void {
    for (const tank of this.getPickupCollectors()) {
      if (!tank.alive || (tank.side === "player" && this.isPlayerInRespawnCountdown(this.time.now))) {
        continue;
      }

      for (const pickup of this.pickups.getChildren() as PickupSprite[]) {
        if (!pickup.active || !pickup.visible) {
          continue;
        }

        const distance = Phaser.Math.Distance.Between(pickup.x, pickup.y, tank.hull.x, tank.hull.y);

        if (distance <= PICKUP_COLLECT_RADIUS) {
          this.collectPickup(tank, pickup);
        }
      }
    }
  }

  private collectPickup(tank: TankRuntime, pickup: PickupSprite): void {
    if (!pickup.active) {
      return;
    }

    tank.buffs = applyPickupBuff(tank.buffs, pickup.pickupType, this.time.now);
    pickup.disableBody(true, true);
    pickup.glow?.setVisible(false);
    pickup.respawnAt = this.time.now + PICKUP_RESPAWN_MS;
    if (tank.side === "player") {
      this.publishPlayerStatus(this.time.now);
    }
    this.playSound("pickupSfx", 0.3);
  }

  private destroyBullet(
    bulletObject: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.GameObjects.GameObject,
    impact: ImpactEffectOptions = {},
  ): void {
    const bullet = this.resolveGameObject(bulletObject) as Phaser.Physics.Arcade.Image;
    this.addBulletImpact(bullet.x, bullet.y, impact);
    this.addExplosion(bullet.x, bullet.y, 0.45);
    bullet.disableBody(true, true);
  }

  private getBulletTravelAngle(bullet: Phaser.Physics.Arcade.Image): number {
    const body = bullet.body as Phaser.Physics.Arcade.Body | undefined;

    if (body && (body.velocity.x !== 0 || body.velocity.y !== 0)) {
      return Math.atan2(body.velocity.y, body.velocity.x);
    }

    return bullet.rotation - Math.PI / 2;
  }

  private getBulletTravelAngleFromObject(
    bulletObject: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.GameObjects.GameObject,
  ): number {
    return this.getBulletTravelAngle(this.resolveGameObject(bulletObject) as Phaser.Physics.Arcade.Image);
  }

  private resolveGameObject(
    object: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.GameObjects.GameObject,
  ): Phaser.GameObjects.GameObject | undefined {
    if ("gameObject" in object) {
      return object.gameObject as Phaser.GameObjects.GameObject;
    }

    return object as Phaser.GameObjects.GameObject;
  }

  private getBulletTargets(owner: BulletOwner): TankRuntime[] {
    if (this.isCaptureTheFlag()) {
      const ownerTeam = this.getSideTeam(owner);
      return this.getAllTanks().filter((tank) => this.getTankTeam(tank) !== ownerTeam);
    }

    return this.getAllTanks().filter((tank) => tank.side !== owner);
  }

  private damageTank(tank: TankRuntime, scorer: BulletOwner): void {
    if (hasShield(tank.buffs, this.time.now)) {
      tank.buffs.shieldUntil = 0;
      this.addExplosion(tank.hull.x, tank.hull.y, 0.35);
      return;
    }

    tank.health -= 1;

    if (tank.health > 0) {
      this.addExplosion(tank.hull.x, tank.hull.y, tank.archetype === "boss" ? 0.62 : 0.35);
      return;
    }

    this.destroyTank(tank, scorer);
  }

  private destroyTank(tank: TankRuntime, scorer: BulletOwner): void {
    if (hasShield(tank.buffs, this.time.now)) {
      tank.buffs.shieldUntil = 0;
      this.addExplosion(tank.hull.x, tank.hull.y, 0.35);
      return;
    }

    tank.alive = false;
    this.stopTankMotorAudio(tank);
    tank.health = tank.maxHealth;
    tank.respawnAt = this.time.now + (this.isCaptureTheFlag() ? CTF_RESPAWN_DELAY_MS : RESPAWN_DELAY_MS);
    this.clearAiNavigationState(tank);
    tank.hull.disableBody(true, true);
    tank.turret.setVisible(false);
    tank.frontMarker?.setVisible(false);
    tank.lastDustAt = undefined;
    tank.lastTreadMarkPosition = undefined;
    tank.buffs = { ...EMPTY_BUFFS };

    if (this.isCaptureTheFlag()) {
      this.dropCarriedFlag(tank);
    }

    if (this.isHumanControlledTank(tank)) {
      this.clearBullets();
    }

    this.addExplosion(tank.hull.x, tank.hull.y, 0.8);

    if (this.isCaptureTheFlag()) {
      this.publishScore();
      return;
    }

    if (scorer === "player") {
      this.score.player += 1;
    } else {
      this.score.enemy += 1;
    }

    this.publishScore();
    this.checkOutcome();
  }

  private respawnTank(tank: TankRuntime): void {
    const spawn = this.getRespawnPoint(tank);

    tank.alive = true;
    tank.health = tank.maxHealth;
    tank.spawn = spawn;
    tank.hull.enableBody(true, spawn.x, spawn.y, true, true);
    tank.turret.setVisible(true);
    tank.frontMarker?.setVisible(true);
    tank.lastDustAt = undefined;
    tank.lastFiredAt = this.time.now;
    tank.lastTreadMarkPosition = undefined;
    tank.hull.setVelocity(0, 0);
    this.clearAiNavigationState(tank);

    if (tank.side === "player" && !this.isDeathmatch()) {
      this.playerControlLockedUntil = this.time.now + PLAYER_RESPAWN_COUNTDOWN_MS;

      for (const enemy of this.enemies) {
        enemy.lastFiredAt = this.time.now + PLAYER_RESPAWN_GRACE_MS - ENEMY_STATS[enemy.archetype ?? "standard"].fireCooldownMs;
        enemy.nextDecisionAt = this.time.now + PLAYER_RESPAWN_GRACE_MS;
      }
    }
  }

  private canRespawnTank(tank: TankRuntime): boolean {
    if (this.isCaptureTheFlag()) {
      return true;
    }

    if (this.isHumanTank(tank)) {
      return true;
    }

    const remainingKills = this.map.playerScoreLimit - this.score.player;

    if (remainingKills <= 0) {
      return false;
    }

    const liveEnemies = this.enemies.filter((enemy) => enemy.alive).length;
    return liveEnemies < remainingKills;
  }

  private clearAiNavigationState(tank: TankRuntime): void {
    tank.lastAiProgressAt = undefined;
    tank.lastAiProgressDistance = undefined;
    tank.unstuckMoveAngle = undefined;
    tank.unstuckUntil = undefined;
    tank.moveAngle = undefined;
    tank.nextMoveDecisionAt = 0;
  }

  private isPlayerInRespawnCountdown(time: number): boolean {
    return this.player.alive && time < this.playerControlLockedUntil;
  }

  private updateRespawnCountdown(time: number): void {
    if (!this.respawnCountdownText) {
      return;
    }

    if (!this.isPlayerInRespawnCountdown(time)) {
      this.respawnCountdownText.setVisible(false);
      return;
    }

    const remainingSeconds = Math.max(1, Math.ceil((this.playerControlLockedUntil - time) / 1_000));
    this.respawnCountdownText
      .setText(`RESPAWN\n${remainingSeconds}`)
      .setPosition(this.cameras.main.width / 2, this.cameras.main.height * 0.34)
      .setVisible(true);
  }

  private clearBullets(): void {
    for (const bullet of this.bullets.getChildren() as Phaser.Physics.Arcade.Image[]) {
      if (bullet.active) {
        bullet.disableBody(true, true);
      }
    }
  }

  private getRespawnPoint(tank: TankRuntime): Vec2 {
    if (this.isCaptureTheFlag()) {
      return this.getSafeTeamRespawn(this.getTankTeam(tank), tank);
    }

    return tank.side === "player" && !this.isDeathmatch() ? this.getRandomPlayerSpawn(tank) : tank.spawn;
  }

  private getSafeTeamRespawn(team: TeamId, ignoreTank: TankRuntime): Vec2 {
    const config = this.map.ctf;
    const base = this.getTeamBase(team);
    const minX = team === "blue" ? SPAWN_MARGIN : this.map.width / 2 + SPAWN_MARGIN / 2;
    const maxX = team === "blue" ? this.map.width / 2 - SPAWN_MARGIN / 2 : this.map.width - SPAWN_MARGIN;
    let bestSpawn: Vec2 | undefined;
    let bestScore = -Infinity;

    for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt += 1) {
      const candidate = {
        x: Phaser.Math.Between(minX, maxX),
        y: Phaser.Math.Between(SPAWN_MARGIN, this.map.height - SPAWN_MARGIN),
      };

      if (!this.isSpawnClear(candidate, ignoreTank)) {
        continue;
      }

      const enemyDistance = this.getClosestOpponentDistance(candidate, team);
      const baseDistance = Phaser.Math.Distance.Between(candidate.x, candidate.y, base.x, base.y);
      const carrierPenalty = this.isNearActiveFlagCarrier(candidate) ? this.map.width + this.map.height : 0;
      const score = enemyDistance * 1.4 - baseDistance * 0.25 - carrierPenalty;

      if (score > bestScore) {
        bestSpawn = candidate;
        bestScore = score;
      }
    }

    const fallback = team === "blue" ? config?.blueSpawns[0] : config?.redSpawns[0];
    return bestSpawn ?? fallback ?? base;
  }

  private getClosestOpponentDistance(point: Vec2, team: TeamId): number {
    return this.getAllTanks()
      .filter((tank) => tank.alive && this.getTankTeam(tank) !== team)
      .reduce(
        (best, tank) => Math.min(best, Phaser.Math.Distance.Between(point.x, point.y, tank.hull.x, tank.hull.y)),
        this.map.width + this.map.height,
      );
  }

  private isNearActiveFlagCarrier(point: Vec2): boolean {
    if (!this.ctf) {
      return false;
    }

    return Object.values(this.ctf.flags).some(
      (flag) =>
        flag.carrier?.alive &&
        Phaser.Math.Distance.Between(point.x, point.y, flag.carrier.hull.x, flag.carrier.hull.y) < SPAWN_CLEARANCE * 2,
    );
  }

  private getRandomPlayerSpawn(ignoreTank?: TankRuntime): Vec2 {
    const enemyCenter = this.getLiveEnemyCenter();
    let bestSpawn: Vec2 | undefined;
    let bestScore = -Infinity;

    for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt += 1) {
      const candidate = {
        x: Phaser.Math.Between(SPAWN_MARGIN, this.map.width - SPAWN_MARGIN),
        y: Phaser.Math.Between(SPAWN_MARGIN, this.map.height - SPAWN_MARGIN),
      };

      if (this.isSpawnClear(candidate, ignoreTank)) {
        const score = this.scorePlayerSpawn(candidate, enemyCenter);

        if (score > bestScore) {
          bestSpawn = candidate;
          bestScore = score;
        }
      }
    }

    return bestSpawn ?? this.getFallbackOppositeSpawn(enemyCenter);
  }

  private getLiveEnemyCenter(): Vec2 | undefined {
    const liveEnemies = this.enemies.filter((enemy) => enemy.alive);

    if (liveEnemies.length === 0) {
      return {
        x: this.map.enemySpawns.reduce((total, enemy) => total + enemy.x, 0) / this.map.enemySpawns.length,
        y: this.map.enemySpawns.reduce((total, enemy) => total + enemy.y, 0) / this.map.enemySpawns.length,
      };
    }

    return {
      x: liveEnemies.reduce((total, enemy) => total + enemy.hull.x, 0) / liveEnemies.length,
      y: liveEnemies.reduce((total, enemy) => total + enemy.hull.y, 0) / liveEnemies.length,
    };
  }

  private scorePlayerSpawn(candidate: Vec2, enemyCenter: Vec2 | undefined): number {
    if (!enemyCenter) {
      return Phaser.Math.Distance.Between(candidate.x, candidate.y, this.map.playerSpawn.x, this.map.playerSpawn.y);
    }

    const mapCenter = { x: this.map.width / 2, y: this.map.height / 2 };
    const oppositePoint = {
      x: Phaser.Math.Clamp(mapCenter.x * 2 - enemyCenter.x, SPAWN_MARGIN, this.map.width - SPAWN_MARGIN),
      y: Phaser.Math.Clamp(mapCenter.y * 2 - enemyCenter.y, SPAWN_MARGIN, this.map.height - SPAWN_MARGIN),
    };
    const distanceFromEnemyCenter = Phaser.Math.Distance.Between(candidate.x, candidate.y, enemyCenter.x, enemyCenter.y);
    const distanceFromOppositePoint = Phaser.Math.Distance.Between(candidate.x, candidate.y, oppositePoint.x, oppositePoint.y);
    const oppositeSideBonus = this.isOppositeSideFromEnemy(candidate, enemyCenter) ? this.map.width + this.map.height : 0;

    return distanceFromEnemyCenter * 1.4 - distanceFromOppositePoint + oppositeSideBonus;
  }

  private isOppositeSideFromEnemy(candidate: Vec2, enemyCenter: Vec2): boolean {
    const mapCenter = { x: this.map.width / 2, y: this.map.height / 2 };
    const enemyDx = enemyCenter.x - mapCenter.x;
    const enemyDy = enemyCenter.y - mapCenter.y;
    const candidateDx = candidate.x - mapCenter.x;
    const candidateDy = candidate.y - mapCenter.y;

    return enemyDx * candidateDx + enemyDy * candidateDy < 0;
  }

  private getFallbackOppositeSpawn(enemyCenter: Vec2 | undefined): Vec2 {
    if (!enemyCenter) {
      return this.map.playerSpawn;
    }

    return {
      x: Phaser.Math.Clamp(this.map.width - enemyCenter.x, SPAWN_MARGIN, this.map.width - SPAWN_MARGIN),
      y: Phaser.Math.Clamp(this.map.height - enemyCenter.y, SPAWN_MARGIN, this.map.height - SPAWN_MARGIN),
    };
  }

  private getPlayerTwoSpawn(): Vec2 {
    const editorSpawn = (this.map as CampaignMap & { playerTwoSpawn?: Vec2 }).playerTwoSpawn;

    if (editorSpawn) {
      return editorSpawn;
    }

    if (this.map.enemySpawns[0]) {
      return this.map.enemySpawns[0];
    }

    return {
      x: Phaser.Math.Clamp(this.map.width - this.map.playerSpawn.x, SPAWN_MARGIN, this.map.width - SPAWN_MARGIN),
      y: Phaser.Math.Clamp(this.map.height - this.map.playerSpawn.y, SPAWN_MARGIN, this.map.height - SPAWN_MARGIN),
    };
  }

  private isSpawnClear(point: Vec2, ignoreTank?: TankRuntime): boolean {
    for (const obstacle of this.map.obstacles) {
      const obstacleClearance = obstacle.kind === "barricade" ? SPAWN_CLEARANCE + 60 : SPAWN_CLEARANCE;

      if (Phaser.Math.Distance.Between(point.x, point.y, obstacle.x, obstacle.y) < obstacleClearance) {
        return false;
      }
    }

    for (const enemySpawn of this.map.enemySpawns) {
      if (Phaser.Math.Distance.Between(point.x, point.y, enemySpawn.x, enemySpawn.y) < SPAWN_CLEARANCE * 1.7) {
        return false;
      }
    }

    for (const tank of this.getAllTanks()) {
      if (!tank || tank === ignoreTank || !tank.alive) {
        continue;
      }

      if (Phaser.Math.Distance.Between(point.x, point.y, tank.hull.x, tank.hull.y) < SPAWN_CLEARANCE * 1.8) {
        return false;
      }
    }

    return true;
  }

  private isSegmentBlocked(start: Vec2, end: Vec2, padding: number): boolean {
    return this.map.obstacles.some((obstacle) => {
      const radius = this.getObstacleRadius(obstacle) + padding;
      return this.distanceFromPointToSegment(obstacle, start, end) <= radius;
    });
  }

  private getObstacleClearance(point: Vec2): number {
    return this.map.obstacles.reduce((best, obstacle) => {
      const clearance = Phaser.Math.Distance.Between(point.x, point.y, obstacle.x, obstacle.y) - this.getObstacleRadius(obstacle);
      return Math.min(best, clearance);
    }, 600);
  }

  private getObstacleRadius(obstacle: ObstacleConfig): number {
    if (obstacle.kind === "barricade") {
      return 110;
    }

    if (obstacle.kind === "sandbag") {
      return 82;
    }

    return 74;
  }

  private distanceFromPointToSegment(point: Vec2, start: Vec2, end: Vec2): number {
    const segmentX = end.x - start.x;
    const segmentY = end.y - start.y;
    const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;

    if (segmentLengthSquared === 0) {
      return Phaser.Math.Distance.Between(point.x, point.y, start.x, start.y);
    }

    const rawT = ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) / segmentLengthSquared;
    const t = Phaser.Math.Clamp(rawT, 0, 1);
    const closest = {
      x: start.x + segmentX * t,
      y: start.y + segmentY * t,
    };

    return Phaser.Math.Distance.Between(point.x, point.y, closest.x, closest.y);
  }

  private isPointInsideWorld(point: Vec2): boolean {
    return (
      point.x >= SPAWN_MARGIN &&
      point.x <= this.map.width - SPAWN_MARGIN &&
      point.y >= SPAWN_MARGIN &&
      point.y <= this.map.height - SPAWN_MARGIN
    );
  }

  private checkOutcome(): void {
    const outcome = this.isCaptureTheFlag()
      ? getMatchOutcome(this.score, this.map.ctf?.captureLimit ?? 3, this.map.ctf?.captureLimit ?? 3)
      : getMatchOutcome(this.score, this.map.playerScoreLimit, this.map.enemyScoreLimit);

    if (outcome === "playing") {
      return;
    }

    this.ended = true;
    this.stopAllMotorAudio();
    this.callbacks.onMapEnded(outcome);
  }

  private addExplosion(x: number, y: number, scale: number): void {
    const boom = this.add.image(x, y, "explosion");
    boom.setDepth(40);
    boom.setScale(scale);
    this.playRandomSound(EXPLOSION_SFX_KEYS, 0.5);
    this.tweens.add({
      targets: boom,
      alpha: 0,
      scale: scale * 1.5,
      duration: 260,
      onComplete: () => boom.destroy(),
    });
  }

  private updateTreadMarks(time: number): void {
    this.cleanupExpiredTreadMarks(time);

    for (const tank of this.getAllTanks()) {
      if (!tank.alive || !this.isTankMoving(tank)) {
        tank.lastTreadMarkPosition = undefined;
        continue;
      }

      const position = this.getTreadMarkPosition(tank);

      if (!shouldSpawnTreadMark(tank.lastTreadMarkPosition, position)) {
        continue;
      }

      this.addTreadMark(position, tank, time);
      tank.lastTreadMarkPosition = position;
    }
  }

  private updateDustTrails(time: number): void {
    for (const tank of this.getAllTanks()) {
      if (!tank.alive || !this.isTankMoving(tank)) {
        tank.lastDustAt = undefined;
        continue;
      }

      if (tank.lastDustAt !== undefined && time - tank.lastDustAt < DUST_SPAWN_INTERVAL_MS) {
        continue;
      }

      this.addDustTrail(tank);
      tank.lastDustAt = time;
    }
  }

  private addDustTrail(tank: TankRuntime): void {
    const body = tank.hull.body as Phaser.Physics.Arcade.Body | undefined;

    if (!body) {
      return;
    }

    const velocity = body.velocity.clone();

    if (velocity.lengthSq() <= MOTOR_MOVING_SPEED * MOTOR_MOVING_SPEED) {
      return;
    }

    velocity.normalize();
    const scaleMultiplier = this.getTankScaleMultiplier(tank);
    const rearOffset = DUST_REAR_OFFSET * scaleMultiplier;
    const lateralOffset = DUST_LATERAL_OFFSET * scaleMultiplier;
    const baseX = tank.hull.x - velocity.x * rearOffset;
    const baseY = tank.hull.y - velocity.y * rearOffset;
    const sideX = -velocity.y * lateralOffset;
    const sideY = velocity.x * lateralOffset;

    this.addDustPuff(baseX + sideX, baseY + sideY, scaleMultiplier, velocity);
    this.addDustPuff(baseX - sideX, baseY - sideY, scaleMultiplier, velocity);
  }

  private addDustPuff(x: number, y: number, scaleMultiplier: number, velocity: Phaser.Math.Vector2): void {
    const dust = this.add.image(
      x + Phaser.Math.FloatBetween(-4, 4) * scaleMultiplier,
      y + Phaser.Math.FloatBetween(-4, 4) * scaleMultiplier,
      "dustPuff",
    );
    const driftDistance = Phaser.Math.FloatBetween(16, 28) * scaleMultiplier;
    const driftX = -velocity.x * driftDistance + Phaser.Math.FloatBetween(-6, 6) * scaleMultiplier;
    const driftY = -velocity.y * driftDistance + Phaser.Math.FloatBetween(-6, 6) * scaleMultiplier;
    const startScale = Phaser.Math.FloatBetween(DUST_MIN_SCALE, DUST_MAX_SCALE) * scaleMultiplier;

    dust.setDepth(DUST_PUFF_DEPTH);
    dust.setTint(0xcfbf92);
    dust.setAlpha(Phaser.Math.FloatBetween(0.18, 0.28));
    dust.setScale(startScale);
    this.tweens.add({
      targets: dust,
      x: dust.x + driftX,
      y: dust.y + driftY,
      alpha: 0,
      scale: startScale * Phaser.Math.FloatBetween(1.7, 2.3),
      duration: Phaser.Math.Between(240, 360),
      ease: "Quad.Out",
      onComplete: () => dust.destroy(),
    });
  }

  private getTreadMarkPosition(tank: TankRuntime): Vec2 {
    const forwardAngle = tank.hull.rotation - Math.PI / 2;
    const rearOffset = TREAD_MARK_REAR_OFFSET * this.getTankScaleMultiplier(tank);

    return {
      x: tank.hull.x - Math.cos(forwardAngle) * rearOffset,
      y: tank.hull.y - Math.sin(forwardAngle) * rearOffset,
    };
  }

  private getTankScaleMultiplier(tank: TankRuntime): number {
    if (tank.archetype === "boss") {
      return 1.45;
    }

    if (tank.archetype === "heavy") {
      return 1.1;
    }

    return 1;
  }

  private addTreadMark(position: Vec2, tank: TankRuntime, createdAt: number): void {
    const scale = this.getTankScaleMultiplier(tank);
    const trackWidth = 9 * scale;
    const trackLength = 24 * scale;
    const trackGap = 17 * scale;
    const container = this.add.container(position.x, position.y);
    const leftTrack = this.add.rectangle(-trackGap, 0, trackWidth, trackLength, 0x13150f, 1);
    const rightTrack = this.add.rectangle(trackGap, 0, trackWidth, trackLength, 0x13150f, 1);

    leftTrack.setStrokeStyle(1, 0x2b2e22, 0.55);
    rightTrack.setStrokeStyle(1, 0x2b2e22, 0.55);
    container.add([leftTrack, rightTrack]);
    container.setRotation(tank.hull.rotation);
    container.setDepth(TREAD_MARK_DEPTH);
    container.setAlpha(getTreadMarkAlpha(createdAt, createdAt));
    this.treadMarks.push({ container, createdAt });
  }

  private cleanupExpiredTreadMarks(time: number): void {
    this.treadMarks = this.treadMarks.filter((mark) => {
      if (isTreadMarkExpired(mark.createdAt, time)) {
        mark.container.destroy();
        return false;
      }

      mark.container.setAlpha(getTreadMarkAlpha(mark.createdAt, time));
      return true;
    });
  }

  private destroyAllTreadMarks(): void {
    for (const mark of this.treadMarks) {
      mark.container.destroy();
    }

    this.treadMarks = [];
  }

  private createImpactTextures(): void {
    if (!this.textures.exists("dustPuff")) {
      const dust = this.add.graphics();
      dust.setVisible(false);
      dust.fillStyle(0xffffff, 1);
      dust.fillCircle(18, 18, 14);
      dust.generateTexture("dustPuff", 36, 36);
      dust.destroy();
      this.textures.get("dustPuff").setFilter(Phaser.Textures.FilterMode.LINEAR);
    }

    if (!this.textures.exists("impactFlash")) {
      const flash = this.add.graphics();
      flash.setVisible(false);
      flash.fillStyle(0xffffff, 1);
      flash.fillCircle(18, 18, 14);
      flash.generateTexture("impactFlash", 36, 36);
      flash.destroy();
      this.textures.get("impactFlash").setFilter(Phaser.Textures.FilterMode.LINEAR);
    }

    if (!this.textures.exists("impactSpark")) {
      const spark = this.add.graphics();
      spark.setVisible(false);
      spark.fillStyle(0xffffff, 1);
      spark.fillRoundedRect(0, 0, 28, 6, 3);
      spark.generateTexture("impactSpark", 28, 6);
      spark.destroy();
      this.textures.get("impactSpark").setFilter(Phaser.Textures.FilterMode.LINEAR);
    }

    if (!this.textures.exists("impactRing")) {
      const ring = this.add.graphics();
      ring.setVisible(false);
      ring.lineStyle(4, 0xffffff, 1);
      ring.strokeCircle(18, 18, 14);
      ring.generateTexture("impactRing", 36, 36);
      ring.destroy();
      this.textures.get("impactRing").setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
  }

  private addBulletImpact(x: number, y: number, options: ImpactEffectOptions): void {
    const angle = options.angle ?? 0;
    const kind = options.kind ?? "obstacle";
    const scale = options.scale ?? 1;
    const flashTint = kind === "shield" ? 0x8df7ff : kind === "tank" ? 0xffd37a : 0xfff1bd;
    const sparkTint = kind === "shield" ? 0x8fe6ff : kind === "tank" ? 0xff9f6e : 0xf7efd4;
    const ringTint = kind === "shield" ? 0x8df7ff : kind === "tank" ? 0xffc36b : 0xd9cfaa;
    const direction = Phaser.Math.Angle.Wrap(angle + Math.PI);

    const flash = this.add.image(x, y, "impactFlash");
    flash.setDepth(39);
    flash.setTint(flashTint);
    flash.setBlendMode(Phaser.BlendModes.ADD);
    flash.setScale(0.18 * scale);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 0.85 * scale,
      duration: 100,
      ease: "Cubic.Out",
      onComplete: () => flash.destroy(),
    });

    const ring = this.add.image(x, y, "impactRing");
    ring.setDepth(38);
    ring.setTint(ringTint);
    ring.setAlpha(kind === "shield" ? 0.9 : 0.65);
    ring.setScale(0.22 * scale);
    this.tweens.add({
      targets: ring,
      alpha: 0,
      scale: 1.1 * scale,
      duration: kind === "shield" ? 170 : 140,
      ease: "Quad.Out",
      onComplete: () => ring.destroy(),
    });

    const sparkCount = kind === "shield" ? 8 : 6;
    for (let index = 0; index < sparkCount; index += 1) {
      const spread = kind === "shield" ? Math.PI * 0.9 : Math.PI * 0.72;
      const baseAngle =
        kind === "shield"
          ? angle + Phaser.Math.FloatBetween(-Math.PI, Math.PI)
          : direction + Phaser.Math.FloatBetween(-spread / 2, spread / 2);
      const distance = Phaser.Math.Between(
        Math.round(16 * scale),
        Math.round((kind === "shield" ? 42 : 34) * scale),
      );
      const spark = this.add.image(x, y, "impactSpark");
      spark.setDepth(39);
      spark.setTint(sparkTint);
      spark.setRotation(baseAngle);
      spark.setScale(
        Phaser.Math.FloatBetween(0.45, 0.82) * scale,
        Phaser.Math.FloatBetween(0.5, 0.95) * scale,
      );
      spark.setBlendMode(kind === "shield" ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);

      this.tweens.add({
        targets: spark,
        x: x + Math.cos(baseAngle) * distance,
        y: y + Math.sin(baseAngle) * distance,
        alpha: 0,
        scaleX: 0.2 * scale,
        scaleY: 0.14 * scale,
        duration: Phaser.Math.Between(80, 150),
        ease: "Cubic.Out",
        onComplete: () => spark.destroy(),
      });
    }
  }

  private updateTankVisuals(): void {
    for (const tank of this.getAllTanks()) {
      tank.turret.setPosition(tank.hull.x, tank.hull.y);
      tank.turret.setRotation(tank.aimAngle + Math.PI / 2);
      tank.turret.setAlpha(tank.buffs.shieldUntil > this.time.now ? 0.68 : 1);
      tank.hull.setAlpha(tank.buffs.shieldUntil > this.time.now ? 0.78 : 1);

      if (tank.frontMarker) {
        const forwardAngle = tank.hull.rotation - Math.PI / 2;
        tank.frontMarker.setPosition(
          tank.hull.x + Math.cos(forwardAngle) * PLAYER_FRONT_MARKER_OFFSET,
          tank.hull.y + Math.sin(forwardAngle) * PLAYER_FRONT_MARKER_OFFSET,
        );
        tank.frontMarker.setRotation(tank.hull.rotation);
        tank.frontMarker.setAlpha(tank.buffs.shieldUntil > this.time.now ? 0.72 : 0.95);
      }

      if (tank.aiRoleLabel) {
        tank.aiRoleLabel.setPosition(tank.hull.x, tank.hull.y - 76);
        tank.aiRoleLabel.setVisible(this.isCaptureTheFlag() && tank.alive && Boolean(tank.aiRoleLabel.text));
      }
    }
  }

  private setAiRoleLabel(tank: TankRuntime, role: CtfAiRole | ""): void {
    if (!role) {
      tank.aiRoleLabel?.setText("");
      tank.aiRoleLabel?.setVisible(false);
      return;
    }

    if (!tank.aiRoleLabel) {
      const team = this.getTankTeam(tank);
      tank.aiRoleLabel = this.add
        .text(tank.hull.x, tank.hull.y - 76, role, {
          fontFamily: "Arial, sans-serif",
          fontSize: "13px",
          fontStyle: "800",
          color: team === "blue" ? "#bfefff" : "#ffd0c8",
          backgroundColor: "rgba(12, 17, 13, 0.72)",
          padding: { x: 6, y: 3 },
        })
        .setOrigin(0.5)
        .setDepth(70);
    }

    tank.aiRoleLabel.setText(role);
    tank.aiRoleLabel.setVisible(tank.alive);
  }

  private updateCaptureTheFlag(_time: number): void {
    if (!this.ctf) {
      return;
    }

    this.updateFlagVisuals();
    this.handleFlagInteractions();
  }

  private updateFlagVisuals(): void {
    if (!this.ctf) {
      return;
    }

    for (const flag of Object.values(this.ctf.flags)) {
      if (flag.carrier?.alive) {
        flag.position = {
          x: flag.carrier.hull.x,
          y: flag.carrier.hull.y - 58,
        };
      }

      flag.pole.setPosition(flag.position.x - 10, flag.position.y);
      flag.sprite.setPosition(flag.position.x + 15, flag.position.y - 18);
      flag.sprite.setAlpha(flag.state === "dropped" ? 0.78 : 0.95);
      flag.pole.setAlpha(flag.state === "dropped" ? 0.68 : 0.95);
    }
  }

  private handleFlagInteractions(): void {
    if (!this.ctf) {
      return;
    }

    for (const tank of this.getAllTanks()) {
      if (!tank.alive) {
        continue;
      }

      const team = this.getTankTeam(tank);
      const enemyFlag = this.getTeamFlag(this.getOpposingTeam(team));
      const ownFlag = this.getTeamFlag(team);

      if (ownFlag?.state === "dropped" && this.isNear(tank.hull, ownFlag.position, CTF_FLAG_TOUCH_RADIUS)) {
        this.returnFlag(ownFlag);
      }

      if (
        enemyFlag &&
        enemyFlag.state !== "carried" &&
        !this.getCarriedFlag(tank) &&
        this.isNear(tank.hull, enemyFlag.position, CTF_FLAG_TOUCH_RADIUS)
      ) {
        this.pickupFlag(tank, enemyFlag);
      }

      const carriedFlag = this.getCarriedFlag(tank);
      if (carriedFlag && ownFlag?.state === "home" && this.isInsideTeamBase(tank, team)) {
        this.scoreCapture(team, carriedFlag);
      }
    }
  }

  private pickupFlag(tank: TankRuntime, flag: CtfFlagRuntime): void {
    flag.state = "carried";
    flag.carrier = tank;
    this.playSound("pickupSfx", 0.32);
  }

  private returnFlag(flag: CtfFlagRuntime): void {
    flag.state = "home";
    flag.carrier = undefined;
    flag.position = { ...flag.home };
    this.playSound("pickupSfx", 0.24);
  }

  private scoreCapture(team: TeamId, capturedFlag: CtfFlagRuntime): void {
    if (team === "blue") {
      this.score.player += 1;
    } else {
      this.score.enemy += 1;
    }

    this.returnFlag(capturedFlag);
    this.publishScore();
    this.checkOutcome();
  }

  private publishScore(): void {
    this.callbacks.onScoreChanged({ ...this.score });
  }

  private dropCarriedFlag(tank: TankRuntime): void {
    const flag = this.getCarriedFlag(tank);

    if (!flag) {
      return;
    }

    flag.state = "dropped";
    flag.carrier = undefined;
    flag.position = {
      x: Phaser.Math.Clamp(tank.hull.x, SPAWN_MARGIN, this.map.width - SPAWN_MARGIN),
      y: Phaser.Math.Clamp(tank.hull.y, SPAWN_MARGIN, this.map.height - SPAWN_MARGIN),
    };
  }

  private getCarriedFlag(tank: TankRuntime): CtfFlagRuntime | undefined {
    if (!this.ctf) {
      return undefined;
    }

    return Object.values(this.ctf.flags).find((flag) => flag.carrier === tank);
  }

  private getFlagCarrier(flagTeam: TeamId): TankRuntime | undefined {
    return this.getTeamFlag(flagTeam)?.carrier;
  }

  private getTeamFlag(team: TeamId): CtfFlagRuntime | undefined {
    return this.ctf?.flags[team];
  }

  private getTeamBase(team: TeamId): Vec2 {
    const config = this.map.ctf;

    if (!config) {
      return team === "blue" ? this.map.playerSpawn : this.map.enemySpawns[0] ?? this.map.playerSpawn;
    }

    return team === "blue" ? config.blueBase : config.redBase;
  }

  private isInsideTeamBase(tank: TankRuntime, team: TeamId): boolean {
    const config = this.map.ctf;

    if (!config) {
      return false;
    }

    const base = team === "blue" ? config.blueBase : config.redBase;
    return Phaser.Math.Distance.Between(tank.hull.x, tank.hull.y, base.x, base.y) <= base.radius;
  }

  private isNear(object: Phaser.Physics.Arcade.Image, point: Vec2, radius: number): boolean {
    return Phaser.Math.Distance.Between(object.x, object.y, point.x, point.y) <= radius;
  }

  private updateCamera(): void {
    if (!this.usesSharedCamera() || !this.playerTwo) {
      return;
    }

    const camera = this.cameras.main;
    const p1 = this.player.hull;
    const p2 = this.playerTwo.hull;

    const spanX = Math.abs(p1.x - p2.x) + CAMERA_SPAN_MARGIN_X;
    const spanY = Math.abs(p1.y - p2.y) + CAMERA_SPAN_MARGIN_Y;
    const zoom = Phaser.Math.Clamp(
      Math.min(camera.width / spanX, camera.height / spanY),
      CAMERA_MIN_ZOOM,
      1,
    );

    camera.setZoom(zoom);
    // Distance leash: once we hit the zoom-out cap the players still can't be
    // allowed to separate past what the viewport shows, or one drives off-screen.
    // Clamp their separation to the widest gap visible at the minimum zoom.
    this.applyCameraLeash(p1, p2);

    camera.centerOn((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
  }

  private applyCameraLeash(p1: Phaser.Physics.Arcade.Image, p2: Phaser.Physics.Arcade.Image): void {
    const camera = this.cameras.main;
    const maxSeparationX = camera.width / CAMERA_MIN_ZOOM - CAMERA_SPAN_MARGIN_X;
    const maxSeparationY = camera.height / CAMERA_MIN_ZOOM - CAMERA_SPAN_MARGIN_Y;

    const dx = p2.x - p1.x;
    if (Math.abs(dx) > maxSeparationX) {
      const pull = (Math.abs(dx) - maxSeparationX) / 2;
      const direction = Math.sign(dx);
      p1.x += direction * pull;
      p2.x -= direction * pull;
    }

    const dy = p2.y - p1.y;
    if (Math.abs(dy) > maxSeparationY) {
      const pull = (Math.abs(dy) - maxSeparationY) / 2;
      const direction = Math.sign(dy);
      p1.y += direction * pull;
      p2.y -= direction * pull;
    }
  }

  private updatePickupRespawns(time: number): void {
    for (const pickup of this.pickups.getChildren() as PickupSprite[]) {
      if (!pickup.active && pickup.respawnAt > 0 && time >= pickup.respawnAt) {
        pickup.enableBody(false, pickup.x, pickup.baseY, true, true);
        pickup.respawnAt = 0;
        pickup.glow?.setVisible(true);
      }
    }
  }

  private updatePickupVisuals(time: number): void {
    for (const pickup of this.pickups.getChildren() as PickupSprite[]) {
      if (!pickup.active || !pickup.visible) {
        continue;
      }

      const pulse = Math.sin(time / 260 + pickup.floatPhase);
      const baseScale = this.getPickupScale(pickup.pickupType);
      pickup.y = pickup.baseY + pulse * 7;
      pickup.setAlpha(0.82 + (pulse + 1) * 0.08);
      pickup.setScale(baseScale + (pulse + 1) * baseScale * 0.08);
      pickup.glow?.setPosition(pickup.x, pickup.y);
      pickup.glow?.setAlpha(PICKUP_GLOW_ALPHA + (pulse + 1) * 0.09);
      pickup.glow?.setScale(1 + (pulse + 1) * 0.08);
    }
  }

  private publishPlayerStatus(time: number): void {
    const key = [
      this.player.alive ? 1 : 0,
      this.player.health,
      this.player.maxHealth,
      this.player.buffs.speedUntil,
      this.player.buffs.rapidFireUntil,
      this.player.buffs.shieldUntil,
      Math.ceil(Math.max(0, this.playerGunHeat.frozenUntil - time) / 1_000),
    ].join(":");

    if (key === this.lastPlayerStatusKey) {
      return;
    }

    this.lastPlayerStatusKey = key;
    this.callbacks.onPlayerStatusChanged({
      alive: this.player.alive,
      buffs: this.player.buffs,
      health: this.player.health,
      maxHealth: this.player.maxHealth,
      gunFrozenUntil: this.playerGunHeat.frozenUntil,
      now: time,
    });
  }

  private updateMotorAudio(): void {
    for (const tank of this.getAllTanks()) {
      this.updateTankMotorAudio(tank);
    }
  }

  private updateTankMotorAudio(tank: TankRuntime): void {
    if (!tank.alive) {
      this.stopTankMotorAudio(tank);
      return;
    }

    const key = this.getTankMotorKey(tank);
    const audio = this.ensureTankMotorAudio(tank, key);
    audio.volume = this.getTankMotorVolume(tank);

    if (audio.volume <= 0 || this.externallyPaused || this.ended) {
      audio.pause();
      return;
    }

    if (audio.paused) {
      void audio.play().catch(() => {
        audio.volume = 0;
      });
    }
  }

  private ensureTankMotorAudio(tank: TankRuntime, key: AssetKey): HTMLAudioElement {
    if (tank.motorAudio && tank.motorKey === key) {
      return tank.motorAudio;
    }

    this.stopTankMotorAudio(tank);
    const audio = new Audio(ASSETS[key]);
    audio.loop = true;
    audio.volume = 0;
    tank.motorAudio = audio;
    tank.motorKey = key;
    return audio;
  }

  private stopTankMotorAudio(tank: TankRuntime): void {
    if (!tank.motorAudio) {
      return;
    }

    tank.motorAudio.pause();
    tank.motorAudio.currentTime = 0;
    tank.motorAudio = undefined;
    tank.motorKey = undefined;
  }

  private stopAllMotorAudio(): void {
    for (const tank of this.getAllTanks()) {
      this.stopTankMotorAudio(tank);
    }
  }

  private pauseAllMotorAudio(): void {
    for (const tank of this.getAllTanks()) {
      tank.motorAudio?.pause();
    }
  }

  private getTankMotorKey(tank: TankRuntime): AssetKey {
    if (!this.isTankMoving(tank)) {
      return MOTOR_IDLE_KEY;
    }

    if (tank.archetype === "boss") {
      return "motorSfx2";
    }

    if (tank.archetype === "light") {
      return "motorSfx4";
    }

    return "motorSfx3";
  }

  private isTankMoving(tank: TankRuntime): boolean {
    const body = tank.hull.body as Phaser.Physics.Arcade.Body | undefined;
    return Boolean(body && body.velocity.length() > MOTOR_MOVING_SPEED);
  }

  private getTankMotorVolume(tank: TankRuntime): number {
    if (!this.player?.hull?.active || !tank.hull.active) {
      return 0;
    }

    const distance =
      tank === this.player ? 0 : Phaser.Math.Distance.Between(tank.hull.x, tank.hull.y, this.player.hull.x, this.player.hull.y);
    const falloff = Phaser.Math.Clamp(1 - distance / MOTOR_AUDIBLE_RANGE, 0, 1);

    if (falloff <= 0) {
      return 0;
    }

    return Math.max(MOTOR_MIN_VOLUME, MOTOR_BASE_VOLUME * falloff * falloff);
  }

  private getAllTanks(): TankRuntime[] {
    return this.player ? [this.player, ...(this.playerTwo ? [this.playerTwo] : []), ...this.enemies] : [...this.enemies];
  }

  private getHumanTanks(): TankRuntime[] {
    return this.player ? [this.player, ...(this.playerTwo ? [this.playerTwo] : [])] : [];
  }

  // All tanks that can collect pickups: humans always, plus AI in campaign/co-op
  // so enemies opportunistically grab power-ups they drive over.
  private getPickupCollectors(): TankRuntime[] {
    return [...this.getHumanTanks(), ...this.enemies];
  }

  private isHumanTank(tank: TankRuntime): boolean {
    return tank.side === "player" || tank.side === "playerTwo";
  }

  private isHumanControlledTank(tank: TankRuntime): boolean {
    if (tank.side === "player") {
      return true;
    }

    if (tank.side === "playerTwo") {
      return this.isDeathmatch() || this.matchMode === "captureTheFlagCoOp";
    }

    return false;
  }

  private canTankCollectPickup(tank: TankRuntime): boolean {
    return this.isHumanTank(tank) || this.isCaptureTheFlag();
  }

  private getTankTeam(tank: TankRuntime): TeamId {
    return this.getSideTeam(tank.side);
  }

  private getSideTeam(side: BulletOwner): TeamId {
    return side === "enemy" ? "red" : "blue";
  }

  private getOpposingTeam(team: TeamId): TeamId {
    return team === "blue" ? "red" : "blue";
  }

  private getNearestLivingOpponent(tank: TankRuntime): TankRuntime | undefined {
    let best: TankRuntime | undefined;
    let bestDistance = Infinity;

    for (const candidate of this.getAllTanks()) {
      if (!candidate.alive || this.getTankTeam(candidate) === this.getTankTeam(tank)) {
        continue;
      }

      const distance = Phaser.Math.Distance.Between(tank.hull.x, tank.hull.y, candidate.hull.x, candidate.hull.y);
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }

    return best;
  }

  private isDeathmatch(): boolean {
    return this.matchMode === "deathmatch";
  }

  private isCoOp(): boolean {
    return this.matchMode === "coOp";
  }

  private isCaptureTheFlag(): boolean {
    return this.matchMode === "captureTheFlag" || this.matchMode === "captureTheFlagCoOp";
  }

  private usesSharedCamera(): boolean {
    return this.isDeathmatch() || this.matchMode === "captureTheFlagCoOp";
  }

  private playRandomSound(keys: AssetKey[], volume: number): void {
    this.playSound(Phaser.Utils.Array.GetRandom(keys), volume);
  }

  private playSound(key: AssetKey, volume: number): void {
    const path = ASSETS[key];

    if (!path.endsWith(".ogg") && !path.endsWith(".mp3") && !path.endsWith(".wav")) {
      return;
    }

    try {
      const audio = new Audio(path);
      audio.volume = volume;
      void audio.play();
    } catch (error) {
      console.warn(`Failed to play sound ${key}`, error);
    }
  }

  private cleanupFarBullets(): void {
    for (const bullet of this.bullets.getChildren() as Phaser.Physics.Arcade.Image[]) {
      const data = bullet.getData("bullet") as BulletData | undefined;
      const exceededRange =
        data &&
        Phaser.Math.Distance.Between(bullet.x, bullet.y, data.startX, data.startY) >= data.maxRange;

      if (
        bullet.active &&
        (exceededRange ||
          bullet.x < -100 ||
          bullet.x > this.map.width + 100 ||
          bullet.y < -100 ||
          bullet.y > this.map.height + 100)
      ) {
        bullet.disableBody(true, true);
      }
    }
  }

  private getBulletMaxRange(): number {
    return this.cameras.main.worldView.height / 2;
  }

  private registerWindowControls(): void {
    const pause = () => {
      if (!this.externallyPaused) {
        this.pauseMovingBodies();
        this.pauseAllMotorAudio();
      }

      this.externallyPaused = true;
    };
    const resume = () => {
      if (this.ended) {
        return;
      }

      this.externallyPaused = false;
      this.restoreBulletVelocities();
    };

    window.addEventListener("thunder-tank-pause", pause);
    window.addEventListener("thunder-tank-resume", resume);
    this.cleanupListeners.push(() => window.removeEventListener("thunder-tank-pause", pause));
    this.cleanupListeners.push(() => window.removeEventListener("thunder-tank-resume", resume));
  }

  private stopMovingBodies(): void {
    for (const tank of this.getAllTanks()) {
      if (tank.hull.active) {
        tank.hull.setVelocity(0, 0);
      }
    }

    for (const bullet of this.bullets?.getChildren() ?? []) {
      const bulletImage = bullet as Phaser.Physics.Arcade.Image;

      if (bulletImage.active) {
        bulletImage.setVelocity(0, 0);
      }
    }
  }

  private pauseMovingBodies(): void {
    for (const bullet of this.bullets?.getChildren() ?? []) {
      const bulletImage = bullet as Phaser.Physics.Arcade.Image;
      const body = bulletImage.body as Phaser.Physics.Arcade.Body | undefined;

      if (bulletImage.active && body && !this.pausedBulletVelocities.has(bulletImage)) {
        this.pausedBulletVelocities.set(bulletImage, { x: body.velocity.x, y: body.velocity.y });
      }
    }

    this.stopMovingBodies();
  }

  private restoreBulletVelocities(): void {
    for (const [bullet, velocity] of this.pausedBulletVelocities) {
      if (bullet.active) {
        bullet.setVelocity(velocity.x, velocity.y);
      }
    }

    this.pausedBulletVelocities.clear();
  }

  private setTextureFilters(): void {
    for (const key of ASSET_KEYS) {
      const path = ASSETS[key];

      if (!path.endsWith(".ogg")) {
        this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    }
  }

  shutdown(): void {
    for (const cleanup of this.cleanupListeners) {
      cleanup();
    }

    this.stopAllMotorAudio();
    this.destroyAllTreadMarks();
    this.cleanupListeners = [];
  }
}

import Phaser from "phaser";
import { isGamepadButtonPressed, readAim, readDrive, type GamepadMapping } from "../gamepad-config";
import { ASSETS, ASSET_KEYS, type AssetKey } from "./assets";
import { CAMPAIGN_MAPS } from "./maps";
import {
  EMPTY_BUFFS,
  ENEMY_STATS,
  PLAYER_BASE_STATS,
  applyPickupBuff,
  getEffectiveStats,
  getMatchOutcome,
  hasShield,
} from "./rules";
import type {
  CampaignMap,
  EnemyArchetype,
  GameCallbacks,
  ObstacleConfig,
  PickupConfig,
  ScoreState,
  TankRuntime,
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
const PLAYER_RESPAWN_COUNTDOWN_MS = 3_000;
const FIRE_SFX_KEYS: AssetKey[] = ["fireSfx15", "fireSfx16", "fireSfx17"];
const EXPLOSION_SFX_KEYS: AssetKey[] = ["explosionSfx4", "explosionSfx7"];

interface SceneData {
  mapIndex: number;
  gamepadMapping: GamepadMapping;
  callbacks: GameCallbacks;
}

interface BulletData {
  owner: "player" | "enemy";
}

interface PickupSprite extends Phaser.Physics.Arcade.Image {
  pickupType: PickupConfig["type"];
  respawnAt: number;
}

export class CampaignScene extends Phaser.Scene {
  private map!: CampaignMap;
  private callbacks!: GameCallbacks;
  private gamepadMapping!: GamepadMapping;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private player!: TankRuntime;
  private enemies: TankRuntime[] = [];
  private score: ScoreState = { player: 0, enemy: 0 };
  private obstacles!: Phaser.Physics.Arcade.StaticGroup;
  private bullets!: Phaser.Physics.Arcade.Group;
  private pickups!: Phaser.Physics.Arcade.Group;
  private tankByBody = new Map<Phaser.GameObjects.GameObject, TankRuntime>();
  private cleanupListeners: Array<() => void> = [];
  private playerControlLockedUntil = 0;
  private respawnCountdownText?: Phaser.GameObjects.Text;
  private externallyPaused = false;
  private ended = false;

  constructor() {
    super("CampaignScene");
  }

  init(data: SceneData): void {
    this.map = CAMPAIGN_MAPS[data.mapIndex] ?? CAMPAIGN_MAPS[0];
    this.gamepadMapping = data.gamepadMapping;
    this.callbacks = data.callbacks;
    this.score = { player: 0, enemy: 0 };
    this.enemies = [];
    this.tankByBody.clear();
    this.playerControlLockedUntil = 0;
    this.externallyPaused = false;
    this.ended = false;
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

    this.player = this.addTank("player", this.getRandomPlayerSpawn(), "standard");
    this.enemies = this.map.enemySpawns.map((enemy, index) =>
      this.addTank(`enemy-${index}`, enemy, enemy.archetype),
    );

    this.physics.add.collider(this.player.hull, this.obstacles);
    this.physics.add.collider(
      this.enemies.map((enemy) => enemy.hull),
      this.obstacles,
    );
    this.physics.add.collider(this.player.hull, this.enemies.map((enemy) => enemy.hull));
    this.physics.add.collider(this.enemies.map((enemy) => enemy.hull), this.enemies.map((enemy) => enemy.hull));
    this.physics.add.collider(this.bullets, this.obstacles, (bullet) =>
      this.destroyBullet(bullet as Phaser.GameObjects.GameObject),
    );
    this.physics.add.overlap(this.bullets, this.player.hull, (bullet, hull) =>
      this.handleBulletHit(bullet as Phaser.GameObjects.GameObject, hull as Phaser.GameObjects.GameObject),
    );
    this.physics.add.overlap(this.bullets, this.enemies.map((enemy) => enemy.hull), (bullet, hull) =>
      this.handleBulletHit(bullet as Phaser.GameObjects.GameObject, hull as Phaser.GameObjects.GameObject),
    );
    this.physics.add.overlap(this.pickups, [this.player.hull, ...this.enemies.map((enemy) => enemy.hull)], (pickup, hull) =>
      this.handlePickup(pickup as Phaser.GameObjects.GameObject, hull as Phaser.GameObjects.GameObject),
    );

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,SPACE,ESC") as Record<string, Phaser.Input.Keyboard.Key>;
    this.cameras.main.startFollow(this.player.hull, true, 0.08, 0.08);
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
    this.callbacks.onScoreChanged(this.score);
    this.registerWindowControls();
  }

  update(time: number, delta: number): void {
    if (this.ended || this.externallyPaused) {
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.ESC)) {
      window.dispatchEvent(new CustomEvent("thunder-tank-pause-requested"));
    }

    this.updatePlayer(time);
    this.updateEnemies(time);
    this.updateBulletHits();
    this.updateTankVisuals();
    this.updatePickupRespawns(time);
    this.cleanupFarBullets();

    for (const tank of [this.player, ...this.enemies]) {
      if (!tank.alive && time >= tank.respawnAt) {
        this.respawnTank(tank);
      }
    }

    this.updateRespawnCountdown(time);
  }

  private addArena(): void {
    const tile = this.add.tileSprite(0, 0, this.map.width, this.map.height, "crate");
    tile.setOrigin(0);
    tile.setAlpha(0.06);
    tile.setDepth(-10);

    const border = this.add.rectangle(
      this.map.width / 2,
      this.map.height / 2,
      this.map.width - WORLD_PADDING,
      this.map.height - WORLD_PADDING,
      0x000000,
      0,
    );
    border.setStrokeStyle(8, 0x84946f, 0.85);
    border.setDepth(-5);
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
    pickup.setDepth(10);
    pickup.setScale(1);
    pickup.body!.setCircle(23);
  }

  private addTank(id: string, spawn: Vec2, archetype: EnemyArchetype): TankRuntime {
    const side = id === "player" ? "player" : "enemy";
    const hullKey = side === "player" ? "playerHull" : this.enemyHullKey(archetype);
    const turretKey = side === "player" ? "playerTurret" : this.enemyTurretKey(archetype);
    const hull = this.physics.add.image(spawn.x, spawn.y, hullKey);
    const turret = this.add.image(spawn.x, spawn.y, turretKey);
    const frontMarker =
      side === "player" ? this.add.rectangle(spawn.x, spawn.y - PLAYER_FRONT_MARKER_OFFSET, 18, 6, 0xf6df85, 0.95) : undefined;
    const tank: TankRuntime = {
      id,
      side,
      archetype,
      hull,
      turret,
      frontMarker,
      spawn,
      alive: true,
      respawnAt: 0,
      lastFiredAt: -10_000,
      nextDecisionAt: 0,
      aimAngle: side === "player" ? -Math.PI / 2 : 0,
      buffs: { ...EMPTY_BUFFS },
    };

    hull.setDepth(TANK_DEPTH);
    hull.setDrag(0.96);
    hull.setScale(archetype === "heavy" ? 1.1 : 1);
    hull.setCollideWorldBounds(true);
    hull.body!.setSize(56, 56);
    turret.setDepth(TANK_DEPTH + 1);
    turret.setScale(archetype === "heavy" ? 1.55 : 1.4);
    frontMarker?.setDepth(TANK_DEPTH + 2);
    this.tankByBody.set(hull, tank);

    return tank;
  }

  private enemyHullKey(archetype: EnemyArchetype): string {
    if (archetype === "light") {
      return "enemyLightHull";
    }

    if (archetype === "heavy") {
      return "enemyHeavyHull";
    }

    return "enemyStandardHull";
  }

  private enemyTurretKey(archetype: EnemyArchetype): string {
    if (archetype === "light") {
      return "enemyLightTurret";
    }

    if (archetype === "heavy") {
      return "enemyHeavyTurret";
    }

    return "enemyStandardTurret";
  }

  private updatePlayer(time: number): void {
    if (!this.player.alive) {
      this.player.hull.setVelocity(0, 0);
      return;
    }

    if (this.isPlayerInRespawnCountdown(time)) {
      this.player.hull.setVelocity(0, 0);
      return;
    }

    const drive = this.getDriveInput();
    const aim = this.getAimVector();
    const stats = getEffectiveStats(PLAYER_BASE_STATS, this.player.buffs, time);
    const deltaSeconds = this.game.loop.delta / 1_000;
    const effectiveTurn = Math.abs(drive.throttle) > 0 ? drive.turn : 0;
    const hullTurnDelta = effectiveTurn * PLAYER_TURN_RATE * deltaSeconds;
    const nextRotation = this.player.hull.rotation + hullTurnDelta;
    const forwardAngle = nextRotation - Math.PI / 2;

    this.player.hull.setRotation(nextRotation);
    this.player.hull.setVelocity(
      Math.cos(forwardAngle) * drive.throttle * stats.speed,
      Math.sin(forwardAngle) * drive.throttle * stats.speed,
    );

    this.player.aimAngle += hullTurnDelta + aim.x * PLAYER_TURRET_TURN_RATE * deltaSeconds;

    if (this.wantsFire() && time - this.player.lastFiredAt >= stats.fireCooldownMs) {
      this.fireBullet(this.player, stats.bulletSpeed, time);
    }
  }

  private updateEnemies(time: number): void {
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

      const baseStats = ENEMY_STATS[enemy.archetype ?? "standard"];
      const stats = getEffectiveStats(baseStats, enemy.buffs, time);
      const distance = Phaser.Math.Distance.Between(enemy.hull.x, enemy.hull.y, this.player.hull.x, this.player.hull.y);
      const desiredAngle = Phaser.Math.Angle.Between(enemy.hull.x, enemy.hull.y, this.player.hull.x, this.player.hull.y);
      const shouldAdvance = distance > 360;
      const strafe = distance < 260 ? desiredAngle + Math.PI * 0.7 : desiredAngle;
      const moveAngle = shouldAdvance ? desiredAngle : strafe;

      enemy.hull.setVelocity(Math.cos(moveAngle) * stats.speed, Math.sin(moveAngle) * stats.speed);
      enemy.hull.setRotation(moveAngle + Math.PI / 2);

      if (time >= enemy.nextDecisionAt) {
        enemy.aimAngle = desiredAngle;
        enemy.nextDecisionAt = time + stats.aimDelayMs;
      }

      if (distance < 760 && time - enemy.lastFiredAt >= stats.fireCooldownMs) {
        this.fireBullet(enemy, stats.bulletSpeed, time);
      }
    }
  }

  private getDriveInput(): { throttle: number; turn: number } {
    const gamepad = navigator.getGamepads?.()[0];
    const drive = readDrive(gamepad, this.gamepadMapping);
    const keyboardTurn = Number(this.keys.D.isDown) - Number(this.keys.A.isDown);
    const keyboardThrottle = Number(this.keys.W.isDown) - Number(this.keys.S.isDown);

    return {
      throttle: Phaser.Math.Clamp(drive.throttle || keyboardThrottle, -1, 1),
      turn: Phaser.Math.Clamp(drive.turn || keyboardTurn, -1, 1),
    };
  }

  private getAimVector(): Vec2 {
    const gamepad = navigator.getGamepads?.()[0];
    const aim = readAim(gamepad, this.gamepadMapping);
    const keyboardX = Number(this.cursors.right.isDown) - Number(this.cursors.left.isDown);
    return {
      x: aim.x || keyboardX,
      y: 0,
    };
  }

  private wantsFire(): boolean {
    const gamepad = navigator.getGamepads?.()[0];
    return Boolean(
      this.keys.SPACE.isDown ||
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

  private fireBullet(tank: TankRuntime, speed: number, time: number): void {
    if (tank.side === "enemy" && (!this.player.alive || this.isPlayerInRespawnCountdown(time))) {
      return;
    }

    const key = tank.side === "player" ? "bulletPlayer" : "bulletEnemy";
    const offset = 54;
    const bullet = this.bullets.get(
      tank.hull.x + Math.cos(tank.aimAngle) * offset,
      tank.hull.y + Math.sin(tank.aimAngle) * offset,
      key,
    ) as Phaser.Physics.Arcade.Image;

    if (!bullet) {
      return;
    }

    bullet.setActive(true);
    bullet.setVisible(true);
    bullet.setDepth(30);
    bullet.setData("bullet", { owner: tank.side } satisfies BulletData);
    bullet.setScale(1.2);
    bullet.setRotation(tank.aimAngle);
    bullet.body!.enable = true;
    bullet.body!.setCircle(10);
    bullet.setVelocity(Math.cos(tank.aimAngle) * speed, Math.sin(tank.aimAngle) * speed);
    tank.lastFiredAt = time;
    this.playRandomSound(FIRE_SFX_KEYS, 0.42);
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

    this.destroyBullet(bullet);
    this.destroyTank(tank, data.owner);
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

      const targets = data.owner === "player" ? this.enemies : [this.player];

      for (const tank of targets) {
        if (!tank.alive) {
          continue;
        }

        const hitRadius = tank.archetype === "heavy" ? 52 : 46;
        const distance = Phaser.Math.Distance.Between(bullet.x, bullet.y, tank.hull.x, tank.hull.y);

        if (distance <= hitRadius) {
          this.destroyBullet(bullet);
          this.destroyTank(tank, data.owner);
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

    if (!tank || !pickup.active || !tank.alive) {
      return;
    }

    tank.buffs = applyPickupBuff(tank.buffs, pickup.pickupType, this.time.now);
    pickup.disableBody(true, true);
    pickup.respawnAt = this.time.now + PICKUP_RESPAWN_MS;
    this.playSound("pickupSfx", 0.3);
  }

  private destroyBullet(
    bulletObject: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.GameObjects.GameObject,
  ): void {
    const bullet = this.resolveGameObject(bulletObject) as Phaser.Physics.Arcade.Image;
    this.addExplosion(bullet.x, bullet.y, 0.45);
    bullet.disableBody(true, true);
  }

  private resolveGameObject(
    object: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.GameObjects.GameObject,
  ): Phaser.GameObjects.GameObject | undefined {
    if ("gameObject" in object) {
      return object.gameObject as Phaser.GameObjects.GameObject;
    }

    return object as Phaser.GameObjects.GameObject;
  }

  private destroyTank(tank: TankRuntime, scorer: "player" | "enemy"): void {
    if (hasShield(tank.buffs, this.time.now)) {
      tank.buffs.shieldUntil = 0;
      this.addExplosion(tank.hull.x, tank.hull.y, 0.35);
      return;
    }

    tank.alive = false;
    tank.respawnAt = this.time.now + RESPAWN_DELAY_MS;
    tank.hull.disableBody(true, true);
    tank.turret.setVisible(false);
    tank.frontMarker?.setVisible(false);
    tank.buffs = { ...EMPTY_BUFFS };

    if (tank.side === "player") {
      this.clearBullets();
    }

    this.addExplosion(tank.hull.x, tank.hull.y, 0.8);

    if (scorer === "player") {
      this.score.player += 1;
    } else {
      this.score.enemy += 1;
    }

    this.callbacks.onScoreChanged(this.score);
    this.checkOutcome();
  }

  private respawnTank(tank: TankRuntime): void {
    const spawn = tank.side === "player" ? this.getRandomPlayerSpawn(tank) : tank.spawn;

    tank.alive = true;
    tank.spawn = spawn;
    tank.hull.enableBody(true, spawn.x, spawn.y, true, true);
    tank.turret.setVisible(true);
    tank.frontMarker?.setVisible(true);
    tank.lastFiredAt = this.time.now;
    tank.hull.setVelocity(0, 0);

    if (tank.side === "player") {
      this.playerControlLockedUntil = this.time.now + PLAYER_RESPAWN_COUNTDOWN_MS;

      for (const enemy of this.enemies) {
        enemy.lastFiredAt = this.time.now + PLAYER_RESPAWN_GRACE_MS - ENEMY_STATS[enemy.archetype ?? "standard"].fireCooldownMs;
        enemy.nextDecisionAt = this.time.now + PLAYER_RESPAWN_GRACE_MS;
      }
    }
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
      return undefined;
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

    for (const tank of [this.player, ...this.enemies]) {
      if (!tank || tank === ignoreTank || !tank.alive) {
        continue;
      }

      if (Phaser.Math.Distance.Between(point.x, point.y, tank.hull.x, tank.hull.y) < SPAWN_CLEARANCE * 1.8) {
        return false;
      }
    }

    return true;
  }

  private checkOutcome(): void {
    const outcome = getMatchOutcome(this.score, this.map.playerScoreLimit, this.map.enemyScoreLimit);

    if (outcome === "playing") {
      return;
    }

    this.ended = true;
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

  private updateTankVisuals(): void {
    for (const tank of [this.player, ...this.enemies]) {
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
    }
  }

  private updatePickupRespawns(time: number): void {
    for (const pickup of this.pickups.getChildren() as PickupSprite[]) {
      if (!pickup.active && pickup.respawnAt > 0 && time >= pickup.respawnAt) {
        pickup.enableBody(false, pickup.x, pickup.y, true, true);
        pickup.respawnAt = 0;
      }
    }
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
      if (
        bullet.active &&
        (bullet.x < -100 || bullet.x > this.map.width + 100 || bullet.y < -100 || bullet.y > this.map.height + 100)
      ) {
        bullet.disableBody(true, true);
      }
    }
  }

  private registerWindowControls(): void {
    const pause = () => {
      this.externallyPaused = true;
    };
    const resume = () => {
      if (this.ended) {
        return;
      }

      this.externallyPaused = false;
    };

    window.addEventListener("thunder-tank-pause", pause);
    window.addEventListener("thunder-tank-resume", resume);
    this.cleanupListeners.push(() => window.removeEventListener("thunder-tank-pause", pause));
    this.cleanupListeners.push(() => window.removeEventListener("thunder-tank-resume", resume));
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

    this.cleanupListeners = [];
  }
}

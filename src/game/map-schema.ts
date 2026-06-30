import { z } from "zod";
import type { CampaignMap, EnemyArchetype, ObstacleConfig, PickupType, Vec2 } from "./types";

export const CUSTOM_MAP_SCHEMA_VERSION = 1;

const MIN_MAP_SIZE = 900;
const MAX_MAP_SIZE = 5_000;
const MIN_SPAWN_CLEARANCE = 150;
const MIN_SPAWN_SEPARATION = 260;

const objectIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{2,63}$/);
const vec2Schema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const editorObstacleKindSchema = z.enum(["crate", "barrel", "barricade", "sandbag"]);
export const editorPickupTypeSchema = z.enum(["speed", "rapidFire", "shield"]);
export const editorEnemyArchetypeSchema = z.enum(["light", "standard", "heavy", "boss"]);

export const editorObstacleSchema = vec2Schema.extend({
  id: objectIdSchema,
  kind: editorObstacleKindSchema,
  rotation: z.number().finite().default(0),
});

export const editorPickupSchema = vec2Schema.extend({
  id: objectIdSchema,
  type: editorPickupTypeSchema,
});

export const editorSpawnSchema = vec2Schema.extend({
  id: objectIdSchema,
});

export const editorEnemySpawnSchema = editorSpawnSchema.extend({
  archetype: editorEnemyArchetypeSchema,
});

export const customMapSchema = z.object({
  schemaVersion: z.literal(CUSTOM_MAP_SCHEMA_VERSION),
  id: objectIdSchema,
  title: z.string().trim().min(1).max(80),
  authorLabel: z.string().trim().min(1).max(80).default("local"),
  width: z.number().int().min(MIN_MAP_SIZE).max(MAX_MAP_SIZE),
  height: z.number().int().min(MIN_MAP_SIZE).max(MAX_MAP_SIZE),
  playerScoreLimit: z.number().int().min(1).max(30).default(6),
  enemyScoreLimit: z.number().int().min(1).max(30).default(6),
  playerSpawn: editorSpawnSchema,
  playerTwoSpawn: editorSpawnSchema.optional(),
  coOpDriverSpawn: editorSpawnSchema.optional(),
  coOpGunnerSpawn: editorSpawnSchema.optional(),
  enemySpawns: z.array(editorEnemySpawnSchema).min(1).max(12),
  obstacles: z.array(editorObstacleSchema).max(160).default([]),
  pickups: z.array(editorPickupSchema).max(40).default([]),
});

export type CustomMapData = z.infer<typeof customMapSchema>;
export type CustomMapValidationMode = "onePlayer" | "twoPlayer" | "coOp";

export interface MapValidationMessage {
  code: string;
  message: string;
  objectId?: string;
  severity: "error" | "warning";
}

export interface MapValidationResult {
  success: boolean;
  data?: CustomMapData;
  messages: MapValidationMessage[];
}

export function createBlankCustomMap(): CustomMapData {
  return {
    schemaVersion: CUSTOM_MAP_SCHEMA_VERSION,
    id: "new-arena",
    title: "New Arena",
    authorLabel: "local",
    width: 1800,
    height: 1200,
    playerScoreLimit: 6,
    enemyScoreLimit: 6,
    playerSpawn: { id: "player-spawn", x: 260, y: 300 },
    playerTwoSpawn: { id: "player-two-spawn", x: 260, y: 900 },
    coOpDriverSpawn: { id: "coop-driver-spawn", x: 560, y: 300 },
    coOpGunnerSpawn: { id: "coop-gunner-spawn", x: 560, y: 900 },
    enemySpawns: [{ id: "enemy-spawn-1", x: 1500, y: 600, archetype: "light" }],
    obstacles: [
      { id: "crate-1", x: 780, y: 430, kind: "crate", rotation: 0 },
      { id: "barricade-1", x: 960, y: 600, kind: "barricade", rotation: 90 },
      { id: "barrel-1", x: 1140, y: 760, kind: "barrel", rotation: 0 },
    ],
    pickups: [
      { id: "pickup-speed-1", x: 740, y: 820, type: "speed" },
      { id: "pickup-rapid-1", x: 910, y: 310, type: "rapidFire" },
      { id: "pickup-shield-1", x: 1110, y: 900, type: "shield" },
    ],
  };
}

export function validateCustomMap(
  value: unknown,
  mode: CustomMapValidationMode = "onePlayer",
): MapValidationResult {
  const parsed = customMapSchema.safeParse(value);

  if (!parsed.success) {
    return {
      success: false,
      messages: parsed.error.issues.map((issue) => ({
        code: "schema",
        message: `${issue.path.join(".") || "map"}: ${issue.message}`,
        severity: "error",
      })),
    };
  }

  const map = parsed.data;
  const messages: MapValidationMessage[] = [
    ...validateUniqueIds(map),
    ...validateBounds(map),
    ...validateRequiredSpawns(map, mode),
    ...validateSpawnClearance(map),
  ];
  const success = !messages.some((message) => message.severity === "error");

  return { success, data: map, messages };
}

export function customMapToCampaignMap(map: CustomMapData): CampaignMap {
  return {
    id: map.id,
    name: map.title,
    width: map.width,
    height: map.height,
    playerSpawn: { x: map.playerSpawn.x, y: map.playerSpawn.y },
    enemySpawns: map.enemySpawns.map((spawn) => ({
      x: spawn.x,
      y: spawn.y,
      archetype: spawn.archetype,
    })),
    obstacles: map.obstacles.map((obstacle) => ({
      x: obstacle.x,
      y: obstacle.y,
      kind: obstacle.kind,
      rotation: obstacle.rotation,
    })),
    pickups: map.pickups.map((pickup) => ({
      x: pickup.x,
      y: pickup.y,
      type: pickup.type,
    })),
    playerScoreLimit: map.playerScoreLimit,
    enemyScoreLimit: map.enemyScoreLimit,
  };
}

function validateUniqueIds(map: CustomMapData): MapValidationMessage[] {
  const ids = [
    map.playerSpawn.id,
    map.playerTwoSpawn?.id,
    map.coOpDriverSpawn?.id,
    map.coOpGunnerSpawn?.id,
    ...map.enemySpawns.map((spawn) => spawn.id),
    ...map.obstacles.map((obstacle) => obstacle.id),
    ...map.pickups.map((pickup) => pickup.id),
  ].filter((id): id is string => Boolean(id));
  const seen = new Set<string>();
  const messages: MapValidationMessage[] = [];

  for (const id of ids) {
    if (seen.has(id)) {
      messages.push({
        code: "duplicate-id",
        message: `Object id "${id}" is used more than once.`,
        objectId: id,
        severity: "error",
      });
    }

    seen.add(id);
  }

  return messages;
}

function validateBounds(map: CustomMapData): MapValidationMessage[] {
  const messages: MapValidationMessage[] = [];
  const objects: Array<Vec2 & { id: string; label: string }> = [
    { ...map.playerSpawn, label: "Player spawn" },
    ...(map.playerTwoSpawn ? [{ ...map.playerTwoSpawn, label: "Player 2 spawn" }] : []),
    ...(map.coOpDriverSpawn ? [{ ...map.coOpDriverSpawn, label: "Co-op driver spawn" }] : []),
    ...(map.coOpGunnerSpawn ? [{ ...map.coOpGunnerSpawn, label: "Co-op gunner spawn" }] : []),
    ...map.enemySpawns.map((spawn) => ({ ...spawn, label: "Enemy spawn" })),
    ...map.obstacles.map((obstacle) => ({ ...obstacle, label: "Obstacle" })),
    ...map.pickups.map((pickup) => ({ ...pickup, label: "Pickup" })),
  ];

  for (const object of objects) {
    if (object.x < 0 || object.x > map.width || object.y < 0 || object.y > map.height) {
      messages.push({
        code: "out-of-bounds",
        message: `${object.label} "${object.id}" is outside the map bounds.`,
        objectId: object.id,
        severity: "error",
      });
    }
  }

  return messages;
}

function validateRequiredSpawns(map: CustomMapData, mode: CustomMapValidationMode): MapValidationMessage[] {
  const messages: MapValidationMessage[] = [];

  if (mode === "twoPlayer" && !map.playerTwoSpawn) {
    messages.push({
      code: "missing-player-two-spawn",
      message: "2P maps require a Player 2 spawn.",
      severity: "error",
    });
  }

  if (mode === "coOp" && (!map.coOpDriverSpawn || !map.coOpGunnerSpawn)) {
    messages.push({
      code: "missing-coop-spawn",
      message: "Co-op maps require driver and gunner spawn markers.",
      severity: "error",
    });
  }

  return messages;
}

function validateSpawnClearance(map: CustomMapData): MapValidationMessage[] {
  const messages: MapValidationMessage[] = [];
  const spawns = [
    map.playerSpawn,
    map.playerTwoSpawn,
    map.coOpDriverSpawn,
    map.coOpGunnerSpawn,
    ...map.enemySpawns,
  ].filter((spawn): spawn is { id: string; x: number; y: number } => Boolean(spawn));

  for (const spawn of spawns) {
    for (const obstacle of map.obstacles) {
      const clearance = obstacle.kind === "barricade" ? MIN_SPAWN_CLEARANCE + 50 : MIN_SPAWN_CLEARANCE;

      if (distance(spawn, obstacle) < clearance) {
        messages.push({
          code: "spawn-obstructed",
          message: `Spawn "${spawn.id}" is too close to obstacle "${obstacle.id}".`,
          objectId: spawn.id,
          severity: "error",
        });
      }
    }
  }

  for (let index = 0; index < spawns.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < spawns.length; otherIndex += 1) {
      if (distance(spawns[index], spawns[otherIndex]) < MIN_SPAWN_SEPARATION) {
        messages.push({
          code: "spawn-too-close",
          message: `Spawn "${spawns[index].id}" is too close to spawn "${spawns[otherIndex].id}".`,
          objectId: spawns[index].id,
          severity: "error",
        });
      }
    }
  }

  return messages;
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function makeObjectId(prefix: string, existingIds: Iterable<string>): string {
  const cleanPrefix = prefix.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/^-+|-+$/g, "") || "object";
  const used = new Set(existingIds);
  let index = 1;

  while (used.has(`${cleanPrefix}-${index}`)) {
    index += 1;
  }

  return `${cleanPrefix}-${index}`;
}

export type EditableObstacleKind = z.infer<typeof editorObstacleKindSchema>;
export type EditablePickupType = z.infer<typeof editorPickupTypeSchema>;
export type EditableEnemyArchetype = z.infer<typeof editorEnemyArchetypeSchema>;

export const EDITOR_OBSTACLE_KINDS = editorObstacleKindSchema.options;
export const EDITOR_PICKUP_TYPES = editorPickupTypeSchema.options as PickupType[];
export const EDITOR_ENEMY_ARCHETYPES = editorEnemyArchetypeSchema.options as EnemyArchetype[];

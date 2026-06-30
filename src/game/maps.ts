import type { CampaignMap, EnemyArchetype, ObstacleConfig, PickupConfig, Vec2 } from "./types";

const BASE_CAMPAIGN_MAPS: CampaignMap[] = [
  {
    id: "map-1",
    name: "Dust Yard",
    width: 1800,
    height: 1200,
    playerSpawn: { x: 260, y: 280 },
    playerScoreLimit: 4,
    enemyScoreLimit: 4,
    enemySpawns: [
      { x: 1460, y: 900, archetype: "light" },
    ],
    pickups: [
      { x: 880, y: 330, type: "speed" },
      { x: 880, y: 600, type: "rapidFire" },
      { x: 910, y: 860, type: "shield" },
    ],
    obstacles: [
      { x: 520, y: 260, kind: "crate" },
      { x: 660, y: 260, kind: "crate" },
      { x: 790, y: 600, kind: "barricade", rotation: 90 },
      { x: 980, y: 600, kind: "barricade", rotation: 90 },
      { x: 1240, y: 360, kind: "barrel" },
      { x: 1240, y: 820, kind: "barrel" },
      { x: 1030, y: 250, kind: "sandbag" },
      { x: 1030, y: 950, kind: "sandbag" },
    ],
  },
  {
    id: "map-2",
    name: "Iron Lanes",
    width: 2200,
    height: 1500,
    playerSpawn: { x: 250, y: 750 },
    playerScoreLimit: 6,
    enemyScoreLimit: 5,
    enemySpawns: [
      { x: 1840, y: 320, archetype: "light" },
      { x: 1880, y: 760, archetype: "standard" },
      { x: 1840, y: 1180, archetype: "light" },
    ],
    pickups: [
      { x: 900, y: 260, type: "rapidFire" },
      { x: 1180, y: 760, type: "shield" },
      { x: 900, y: 1240, type: "speed" },
    ],
    obstacles: [
      { x: 660, y: 330, kind: "barricade" },
      { x: 930, y: 330, kind: "barricade" },
      { x: 660, y: 1170, kind: "barricade" },
      { x: 930, y: 1170, kind: "barricade" },
      { x: 1160, y: 530, kind: "crate" },
      { x: 1160, y: 650, kind: "crate" },
      { x: 1160, y: 850, kind: "crate" },
      { x: 1160, y: 970, kind: "crate" },
      { x: 1460, y: 460, kind: "sandbag", rotation: 90 },
      { x: 1460, y: 1040, kind: "sandbag", rotation: 90 },
      { x: 1720, y: 750, kind: "barrel" },
    ],
  },
  {
    id: "map-3",
    name: "Broken Foundry",
    width: 2600,
    height: 1700,
    playerSpawn: { x: 300, y: 850 },
    playerScoreLimit: 8,
    enemyScoreLimit: 6,
    enemySpawns: [
      { x: 2140, y: 320, archetype: "light" },
      { x: 2260, y: 760, archetype: "standard" },
      { x: 2140, y: 1260, archetype: "heavy" },
      { x: 1840, y: 1020, archetype: "standard" },
    ],
    pickups: [
      { x: 960, y: 360, type: "rapidFire" },
      { x: 1220, y: 1360, type: "speed" },
      { x: 1550, y: 850, type: "shield" },
      { x: 1980, y: 520, type: "rapidFire" },
    ],
    obstacles: [
      { x: 720, y: 420, kind: "crate" },
      { x: 840, y: 420, kind: "crate" },
      { x: 960, y: 420, kind: "crate" },
      { x: 740, y: 1280, kind: "barrel" },
      { x: 900, y: 1280, kind: "barrel" },
      { x: 1180, y: 720, kind: "barricade", rotation: 90 },
      { x: 1180, y: 980, kind: "barricade", rotation: 90 },
      { x: 1460, y: 420, kind: "sandbag" },
      { x: 1580, y: 420, kind: "sandbag" },
      { x: 1460, y: 1280, kind: "sandbag" },
      { x: 1580, y: 1280, kind: "sandbag" },
      { x: 1880, y: 850, kind: "crate" },
      { x: 2000, y: 850, kind: "crate" },
      { x: 2120, y: 850, kind: "crate" },
    ],
  },
];

const GENERATED_MAP_NAMES = [
  "Crater Relay",
  "Switchback Depot",
  "Ember Flats",
  "Glassworks",
  "Cobalt Cut",
  "Ridge Split",
  "Ash Causeway",
  "Copper Maze",
  "Floodgate",
  "Signal Yard",
  "Blacktop Ring",
  "Turbine Row",
  "Cinder Locks",
  "Mirror Quarry",
  "Redline Basin",
  "Anchor Field",
  "Thunder Gate",
];

export const CAMPAIGN_MAPS: CampaignMap[] = [
  ...BASE_CAMPAIGN_MAPS,
  ...GENERATED_MAP_NAMES.map((name, index) => createGeneratedCampaignMap(index + 4, name)),
].map(numberCampaignMap);

export function getMapByIndex(index: number): CampaignMap {
  const map = CAMPAIGN_MAPS[index];

  if (!map) {
    throw new Error(`Unknown campaign map index ${index}`);
  }

  return map;
}

function createGeneratedCampaignMap(mapNumber: number, name: string): CampaignMap {
  const width = 2600 + Math.min(700, (mapNumber - 4) * 70);
  const height = 1700 + Math.min(500, (mapNumber - 4) * 45);
  const enemySpawns = createEnemySpawns(mapNumber, width, height);
  const playerSpawn = getOppositePoint(averagePoint(enemySpawns), width, height);
  const isBossMap = mapNumber % 5 === 0;

  return {
    id: `map-${mapNumber}`,
    name,
    width,
    height,
    playerSpawn,
    playerScoreLimit: isBossMap ? 1 : Math.min(14, 7 + Math.floor(mapNumber / 3)),
    enemyScoreLimit: isBossMap ? 4 : Math.min(10, 5 + Math.floor(mapNumber / 5)),
    enemySpawns,
    pickups: createPickups(width, height, mapNumber),
    obstacles: createObstacles(width, height, mapNumber),
  };
}

function createEnemySpawns(
  mapNumber: number,
  width: number,
  height: number,
): Array<Vec2 & { archetype: EnemyArchetype }> {
  if (mapNumber % 5 === 0) {
    return [
      {
        x: Math.round(width * 0.78),
        y: Math.round(height * 0.5),
        archetype: "boss",
      },
    ];
  }

  const count = Math.min(7, 2 + Math.floor(mapNumber / 4));
  const archetypes: EnemyArchetype[] = ["light", "standard", "light", "standard", "heavy", "standard", "heavy"];
  const side = mapNumber % 2 === 0 ? "right" : "bottom";
  const spawns: Array<Vec2 & { archetype: EnemyArchetype }> = [];

  for (let index = 0; index < count; index += 1) {
    const spread = (index + 1) / (count + 1);
    const wave = Math.sin((mapNumber + index) * 1.7);
    const x = side === "right" ? width - 320 - (index % 2) * 180 : 520 + spread * (width - 1040);
    const y = side === "right" ? 260 + spread * (height - 520) : height - 300 - Math.abs(wave) * 220;

    spawns.push({
      x: Math.round(x),
      y: Math.round(y),
      archetype: archetypes[Math.min(index, archetypes.length - 1)],
    });
  }

  return spawns;
}

function numberCampaignMap(map: CampaignMap, index: number): CampaignMap {
  const number = String(index + 1).padStart(2, "0");
  return {
    ...map,
    name: `${number}. ${map.name}`,
  };
}

function createPickups(width: number, height: number, mapNumber: number): PickupConfig[] {
  const extraRapid = mapNumber % 3 === 0 ? [{ x: width * 0.74, y: height * 0.28, type: "rapidFire" as const }] : [];

  return [
    { x: Math.round(width * 0.32), y: Math.round(height * 0.28), type: "speed" },
    { x: Math.round(width * 0.5), y: Math.round(height * 0.5), type: "rapidFire" },
    { x: Math.round(width * 0.34), y: Math.round(height * 0.75), type: "shield" },
    { x: Math.round(width * 0.68), y: Math.round(height * 0.68), type: mapNumber % 2 === 0 ? "shield" : "speed" },
    ...extraRapid.map((pickup) => ({ ...pickup, x: Math.round(pickup.x), y: Math.round(pickup.y) })),
  ];
}

function createObstacles(width: number, height: number, mapNumber: number): ObstacleConfig[] {
  const obstacles: ObstacleConfig[] = [];
  const centerX = width / 2;
  const centerY = height / 2;
  const laneCount = 3 + (mapNumber % 3);

  for (let index = 0; index < laneCount; index += 1) {
    const y = centerY - 280 + index * 140;
    obstacles.push({ x: Math.round(centerX - 190), y: Math.round(y), kind: "barricade", rotation: 90 });
    obstacles.push({ x: Math.round(centerX + 190), y: Math.round(y + 55), kind: "barricade", rotation: 90 });
  }

  for (let index = 0; index < 6; index += 1) {
    const angle = (Math.PI * 2 * index) / 6 + mapNumber * 0.18;
    obstacles.push({
      x: Math.round(centerX + Math.cos(angle) * 520),
      y: Math.round(centerY + Math.sin(angle) * 330),
      kind: index % 2 === 0 ? "crate" : "barrel",
    });
  }

  obstacles.push(
    { x: Math.round(width * 0.22), y: Math.round(height * 0.52), kind: "sandbag" },
    { x: Math.round(width * 0.78), y: Math.round(height * 0.48), kind: "sandbag" },
    { x: Math.round(width * 0.5), y: Math.round(height * 0.18), kind: "crate" },
    { x: Math.round(width * 0.5), y: Math.round(height * 0.82), kind: "crate" },
  );

  return obstacles;
}

function averagePoint(points: Vec2[]): Vec2 {
  return {
    x: points.reduce((total, point) => total + point.x, 0) / points.length,
    y: points.reduce((total, point) => total + point.y, 0) / points.length,
  };
}

function getOppositePoint(point: Vec2, width: number, height: number): Vec2 {
  return {
    x: Math.round(clamp(width - point.x, 220, width - 220)),
    y: Math.round(clamp(height - point.y, 220, height - 220)),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

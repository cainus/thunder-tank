import type { CampaignMap } from "./types";

export const CAMPAIGN_MAPS: CampaignMap[] = [
  {
    id: "map-1",
    name: "Dust Yard",
    width: 1800,
    height: 1200,
    playerSpawn: { x: 220, y: 600 },
    playerScoreLimit: 4,
    enemyScoreLimit: 4,
    enemySpawns: [
      { x: 1460, y: 900, archetype: "light" },
    ],
    pickups: [
      { x: 880, y: 330, type: "speed" },
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

export function getMapByIndex(index: number): CampaignMap {
  const map = CAMPAIGN_MAPS[index];

  if (!map) {
    throw new Error(`Unknown campaign map index ${index}`);
  }

  return map;
}

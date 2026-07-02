import type { CampaignMap, EnemyArchetype, ObstacleConfig, PickupConfig } from "./types";

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
      { x: 880, y: 500, type: "rapidFire" },
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
      { x: 880, y: 200, type: "rapidFire" },
      { x: 1200, y: 760, type: "shield" },
      { x: 880, y: 1300, type: "speed" },
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
      { x: 960, y: 320, type: "rapidFire" },
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

// Hand-authored campaign maps for positions 4-20. Each is a deliberate arena:
// enemies cluster on the right, the player starts on the left at vertical center,
// and the obstacle layout echoes the map's name.
const AUTHORED_CAMPAIGN_MAPS: CampaignMap[] = [
  {
    // Crater Relay: a pockmarked field of barrels scattered like impact craters.
    id: "map-4",
    name: "Crater Relay",
    width: 2100,
    height: 1400,
    playerSpawn: { x: 320, y: 700 },
    playerScoreLimit: 4,
    enemyScoreLimit: 5,
    enemySpawns: [
      { x: 1720, y: 520, archetype: "light" },
      { x: 1780, y: 900, archetype: "standard" },
    ],
    pickups: [
      { x: 820, y: 700, type: "speed" },
      { x: 1100, y: 540, type: "rapidFire" },
      { x: 1120, y: 840, type: "shield" },
    ],
    obstacles: [
      { x: 640, y: 420, kind: "barrel" },
      { x: 820, y: 300, kind: "barrel" },
      { x: 980, y: 560, kind: "barrel" },
      { x: 700, y: 880, kind: "barrel" },
      { x: 900, y: 1020, kind: "barrel" },
      { x: 1180, y: 700, kind: "crate" },
      { x: 1160, y: 420, kind: "barrel" },
      { x: 1040, y: 900, kind: "barrel" },
      { x: 560, y: 640, kind: "sandbag" },
      { x: 1320, y: 560, kind: "barrel" },
      { x: 1300, y: 940, kind: "barrel" },
      { x: 1420, y: 720, kind: "crate" },
    ],
  },
  {
    // Switchback Depot: a boss arena laced with staggered barricade switchbacks.
    id: "map-5",
    name: "Switchback Depot",
    width: 2200,
    height: 1500,
    playerSpawn: { x: 340, y: 750 },
    playerScoreLimit: 1,
    enemyScoreLimit: 4,
    enemySpawns: [
      { x: 1780, y: 750, archetype: "boss" },
    ],
    pickups: [
      { x: 700, y: 750, type: "speed" },
      { x: 1060, y: 520, type: "rapidFire" },
      { x: 1060, y: 980, type: "shield" },
    ],
    obstacles: [
      { x: 760, y: 540, kind: "barricade", rotation: 90 },
      { x: 760, y: 960, kind: "barricade", rotation: 90 },
      { x: 1080, y: 660, kind: "barricade", rotation: 90 },
      { x: 1080, y: 840, kind: "barricade", rotation: 90 },
      { x: 1400, y: 540, kind: "barricade", rotation: 90 },
      { x: 1400, y: 960, kind: "barricade", rotation: 90 },
      { x: 940, y: 750, kind: "crate" },
      { x: 1240, y: 750, kind: "crate" },
    ],
  },
  {
    // Ember Flats: a wide-open flat dotted with smouldering barrels and low sandbag lines.
    id: "map-6",
    name: "Ember Flats",
    width: 2200,
    height: 1450,
    playerSpawn: { x: 340, y: 725 },
    playerScoreLimit: 5,
    enemyScoreLimit: 6,
    enemySpawns: [
      { x: 1780, y: 480, archetype: "light" },
      { x: 1820, y: 725, archetype: "standard" },
      { x: 1780, y: 970, archetype: "light" },
    ],
    pickups: [
      { x: 780, y: 725, type: "speed" },
      { x: 1120, y: 560, type: "rapidFire" },
      { x: 1120, y: 900, type: "shield" },
    ],
    obstacles: [
      { x: 680, y: 400, kind: "barrel" },
      { x: 680, y: 1050, kind: "barrel" },
      { x: 900, y: 560, kind: "sandbag" },
      { x: 900, y: 890, kind: "sandbag" },
      { x: 1120, y: 420, kind: "barrel" },
      { x: 1120, y: 1030, kind: "barrel" },
      { x: 1000, y: 725, kind: "crate" },
      { x: 1320, y: 560, kind: "barrel" },
      { x: 1320, y: 890, kind: "barrel" },
      { x: 1200, y: 725, kind: "sandbag" },
    ],
  },
  {
    // Glassworks: rows of thin barricade "panes" like a shattered glass factory.
    id: "map-7",
    name: "Glassworks",
    width: 2300,
    height: 1500,
    playerSpawn: { x: 340, y: 750 },
    playerScoreLimit: 5,
    enemyScoreLimit: 6,
    enemySpawns: [
      { x: 1860, y: 500, archetype: "standard" },
      { x: 1920, y: 760, archetype: "light" },
      { x: 1860, y: 1020, archetype: "heavy" },
    ],
    pickups: [
      { x: 860, y: 750, type: "speed" },
      { x: 1140, y: 540, type: "rapidFire" },
      { x: 1140, y: 960, type: "shield" },
    ],
    obstacles: [
      { x: 720, y: 450, kind: "barricade" },
      { x: 720, y: 750, kind: "barricade" },
      { x: 720, y: 1050, kind: "barricade" },
      { x: 1000, y: 450, kind: "barricade" },
      { x: 1000, y: 750, kind: "barricade" },
      { x: 1000, y: 1050, kind: "barricade" },
      { x: 1280, y: 600, kind: "barricade" },
      { x: 1280, y: 900, kind: "barricade" },
      { x: 1500, y: 750, kind: "crate" },
      { x: 1500, y: 450, kind: "barrel" },
      { x: 1500, y: 1050, kind: "barrel" },
    ],
  },
  {
    // Cobalt Cut: a diagonal trench of barricades slicing across the arena.
    id: "map-8",
    name: "Cobalt Cut",
    width: 2400,
    height: 1550,
    playerSpawn: { x: 340, y: 775 },
    playerScoreLimit: 6,
    enemyScoreLimit: 6,
    enemySpawns: [
      { x: 1960, y: 460, archetype: "light" },
      { x: 2020, y: 720, archetype: "standard" },
      { x: 1960, y: 980, archetype: "standard" },
      { x: 2020, y: 1200, archetype: "heavy" },
    ],
    pickups: [
      { x: 820, y: 775, type: "speed" },
      { x: 1160, y: 560, type: "rapidFire" },
      { x: 1160, y: 1000, type: "shield" },
    ],
    obstacles: [
      { x: 700, y: 400, kind: "barricade", rotation: 45 },
      { x: 860, y: 540, kind: "barricade", rotation: 45 },
      { x: 1020, y: 680, kind: "barricade", rotation: 45 },
      { x: 1180, y: 820, kind: "barricade", rotation: 45 },
      { x: 1340, y: 960, kind: "barricade", rotation: 45 },
      { x: 1500, y: 1100, kind: "barricade", rotation: 45 },
      { x: 760, y: 1000, kind: "crate" },
      { x: 760, y: 1150, kind: "crate" },
      { x: 1500, y: 460, kind: "barrel" },
      { x: 1620, y: 600, kind: "barrel" },
      { x: 620, y: 700, kind: "sandbag" },
      { x: 1200, y: 400, kind: "sandbag" },
    ],
  },
  {
    // Ridge Split: a broken central spine of sandbags with a gap in the middle.
    id: "map-9",
    name: "Ridge Split",
    width: 2500,
    height: 1600,
    playerSpawn: { x: 350, y: 800 },
    playerScoreLimit: 6,
    enemyScoreLimit: 7,
    enemySpawns: [
      { x: 2040, y: 500, archetype: "light" },
      { x: 2100, y: 760, archetype: "light" },
      { x: 2040, y: 1020, archetype: "standard" },
      { x: 2100, y: 1280, archetype: "heavy" },
    ],
    pickups: [
      { x: 840, y: 800, type: "speed" },
      { x: 1250, y: 800, type: "rapidFire" },
      { x: 1650, y: 800, type: "shield" },
    ],
    obstacles: [
      { x: 1250, y: 360, kind: "sandbag" },
      { x: 1250, y: 520, kind: "sandbag" },
      { x: 1250, y: 680, kind: "sandbag" },
      { x: 1250, y: 920, kind: "sandbag" },
      { x: 1250, y: 1080, kind: "sandbag" },
      { x: 1250, y: 1240, kind: "sandbag" },
      { x: 800, y: 500, kind: "crate" },
      { x: 800, y: 1100, kind: "crate" },
      { x: 1650, y: 500, kind: "barrel" },
      { x: 1650, y: 1100, kind: "barrel" },
      { x: 1000, y: 800, kind: "barricade", rotation: 90 },
      { x: 1500, y: 800, kind: "barricade", rotation: 90 },
    ],
  },
  {
    // Ash Causeway: a boss arena framed by two sandbag lines forming a raised path.
    id: "map-10",
    name: "Ash Causeway",
    width: 2500,
    height: 1600,
    playerSpawn: { x: 360, y: 800 },
    playerScoreLimit: 1,
    enemyScoreLimit: 4,
    enemySpawns: [
      { x: 2040, y: 800, archetype: "boss" },
    ],
    pickups: [
      { x: 820, y: 800, type: "speed" },
      { x: 1180, y: 660, type: "rapidFire" },
      { x: 1180, y: 940, type: "shield" },
    ],
    obstacles: [
      { x: 800, y: 620, kind: "sandbag" },
      { x: 1050, y: 620, kind: "sandbag" },
      { x: 1300, y: 620, kind: "sandbag" },
      { x: 1550, y: 620, kind: "sandbag" },
      { x: 800, y: 980, kind: "sandbag" },
      { x: 1050, y: 980, kind: "sandbag" },
      { x: 1300, y: 980, kind: "sandbag" },
      { x: 1550, y: 980, kind: "sandbag" },
      { x: 1150, y: 800, kind: "barrel" },
      { x: 1400, y: 800, kind: "barrel" },
    ],
  },
  {
    // Copper Maze: a genuine maze of interlocking barricade corridors.
    id: "map-11",
    name: "Copper Maze",
    width: 2600,
    height: 1650,
    playerSpawn: { x: 360, y: 825 },
    playerScoreLimit: 6,
    enemyScoreLimit: 7,
    enemySpawns: [
      { x: 2160, y: 520, archetype: "standard" },
      { x: 2220, y: 800, archetype: "standard" },
      { x: 2160, y: 1080, archetype: "heavy" },
      { x: 2260, y: 1300, archetype: "light" },
    ],
    pickups: [
      { x: 840, y: 825, type: "speed" },
      { x: 1120, y: 480, type: "rapidFire" },
      { x: 1300, y: 1080, type: "shield" },
    ],
    obstacles: [
      { x: 760, y: 400, kind: "barricade", rotation: 90 },
      { x: 760, y: 540, kind: "barricade", rotation: 90 },
      { x: 760, y: 680, kind: "barricade", rotation: 90 },
      { x: 1000, y: 680, kind: "barricade" },
      { x: 1140, y: 680, kind: "barricade" },
      { x: 1000, y: 900, kind: "barricade", rotation: 90 },
      { x: 1000, y: 1040, kind: "barricade", rotation: 90 },
      { x: 1000, y: 1180, kind: "barricade", rotation: 90 },
      { x: 1240, y: 400, kind: "barricade", rotation: 90 },
      { x: 1240, y: 540, kind: "barricade", rotation: 90 },
      { x: 1400, y: 900, kind: "barricade" },
      { x: 1540, y: 900, kind: "barricade" },
      { x: 1540, y: 1100, kind: "barricade", rotation: 90 },
      { x: 1540, y: 1240, kind: "barricade", rotation: 90 },
      { x: 1300, y: 1300, kind: "crate" },
      { x: 760, y: 1200, kind: "crate" },
    ],
  },
  {
    // Floodgate: successive vertical barricade rows like a series of sluice gates.
    id: "map-12",
    name: "Floodgate",
    width: 2700,
    height: 1700,
    playerSpawn: { x: 380, y: 850 },
    playerScoreLimit: 7,
    enemyScoreLimit: 7,
    enemySpawns: [
      { x: 2240, y: 520, archetype: "light" },
      { x: 2300, y: 780, archetype: "standard" },
      { x: 2240, y: 1040, archetype: "standard" },
      { x: 2300, y: 1300, archetype: "heavy" },
      { x: 2240, y: 900, archetype: "light" },
    ],
    pickups: [
      { x: 780, y: 810, type: "speed" },
      { x: 1100, y: 520, type: "rapidFire" },
      { x: 1100, y: 1180, type: "shield" },
    ],
    obstacles: [
      { x: 900, y: 400, kind: "barricade", rotation: 90 },
      { x: 900, y: 560, kind: "barricade", rotation: 90 },
      { x: 900, y: 880, kind: "barricade", rotation: 90 },
      { x: 900, y: 1040, kind: "barricade", rotation: 90 },
      { x: 900, y: 1200, kind: "barricade", rotation: 90 },
      { x: 1300, y: 300, kind: "barricade", rotation: 90 },
      { x: 1300, y: 460, kind: "barricade", rotation: 90 },
      { x: 1300, y: 620, kind: "barricade", rotation: 90 },
      { x: 1300, y: 940, kind: "barricade", rotation: 90 },
      { x: 1300, y: 1100, kind: "barricade", rotation: 90 },
      { x: 1700, y: 520, kind: "barricade", rotation: 90 },
      { x: 1700, y: 680, kind: "barricade", rotation: 90 },
      { x: 1700, y: 1000, kind: "barricade", rotation: 90 },
      { x: 1700, y: 1160, kind: "barricade", rotation: 90 },
      { x: 1100, y: 850, kind: "barrel" },
      { x: 1500, y: 850, kind: "barrel" },
    ],
  },
  {
    // Signal Yard: a grid of antenna-mast barrels wired together by sandbag rails.
    id: "map-13",
    name: "Signal Yard",
    width: 2800,
    height: 1750,
    playerSpawn: { x: 380, y: 875 },
    playerScoreLimit: 7,
    enemyScoreLimit: 8,
    enemySpawns: [
      { x: 2320, y: 540, archetype: "light" },
      { x: 2380, y: 820, archetype: "standard" },
      { x: 2320, y: 1100, archetype: "heavy" },
      { x: 2380, y: 1380, archetype: "standard" },
      { x: 2320, y: 900, archetype: "heavy" },
    ],
    pickups: [
      { x: 880, y: 835, type: "speed" },
      { x: 1110, y: 560, type: "rapidFire" },
      { x: 1110, y: 1190, type: "shield" },
    ],
    obstacles: [
      { x: 800, y: 450, kind: "barrel" },
      { x: 800, y: 900, kind: "barrel" },
      { x: 800, y: 1350, kind: "barrel" },
      { x: 1150, y: 650, kind: "barrel" },
      { x: 1150, y: 1100, kind: "barrel" },
      { x: 1500, y: 450, kind: "barrel" },
      { x: 1500, y: 900, kind: "barrel" },
      { x: 1500, y: 1350, kind: "barrel" },
      { x: 1850, y: 650, kind: "barrel" },
      { x: 1850, y: 1100, kind: "barrel" },
      { x: 1000, y: 875, kind: "sandbag" },
      { x: 1650, y: 875, kind: "sandbag" },
      { x: 1325, y: 600, kind: "sandbag" },
      { x: 1325, y: 1150, kind: "sandbag" },
    ],
  },
  {
    // Blacktop Ring: a circular racetrack of cover ringing an open centre.
    id: "map-14",
    name: "Blacktop Ring",
    width: 2900,
    height: 1800,
    playerSpawn: { x: 400, y: 900 },
    playerScoreLimit: 7,
    enemyScoreLimit: 8,
    enemySpawns: [
      { x: 2400, y: 560, archetype: "standard" },
      { x: 2460, y: 880, archetype: "heavy" },
      { x: 2400, y: 1200, archetype: "light" },
      { x: 2460, y: 720, archetype: "standard" },
      { x: 2400, y: 1040, archetype: "heavy" },
    ],
    pickups: [
      { x: 940, y: 860, type: "speed" },
      { x: 1450, y: 900, type: "rapidFire" },
      { x: 1250, y: 650, type: "shield" },
    ],
    obstacles: [
      { x: 2050, y: 900, kind: "crate" },
      { x: 1874, y: 1218, kind: "barrel" },
      { x: 1450, y: 1350, kind: "sandbag" },
      { x: 1026, y: 1218, kind: "crate" },
      { x: 850, y: 900, kind: "barrel" },
      { x: 1026, y: 582, kind: "sandbag" },
      { x: 1450, y: 450, kind: "crate" },
      { x: 1874, y: 582, kind: "barrel" },
      { x: 1250, y: 900, kind: "barricade", rotation: 90 },
      { x: 1650, y: 900, kind: "barricade", rotation: 90 },
      { x: 1450, y: 700, kind: "barricade" },
      { x: 1450, y: 1100, kind: "barricade" },
    ],
  },
  {
    // Turbine Row: rows of hulking barrel turbines with sandbag housings.
    id: "map-15",
    name: "Turbine Row",
    width: 2900,
    height: 1800,
    playerSpawn: { x: 400, y: 900 },
    playerScoreLimit: 1,
    enemyScoreLimit: 4,
    enemySpawns: [
      { x: 2380, y: 900, archetype: "boss" },
    ],
    pickups: [
      { x: 800, y: 900, type: "speed" },
      { x: 1300, y: 700, type: "rapidFire" },
      { x: 1300, y: 1100, type: "shield" },
    ],
    obstacles: [
      { x: 900, y: 500, kind: "barrel" },
      { x: 900, y: 900, kind: "barrel" },
      { x: 900, y: 1300, kind: "barrel" },
      { x: 1300, y: 500, kind: "barrel" },
      { x: 1300, y: 900, kind: "barrel" },
      { x: 1300, y: 1300, kind: "barrel" },
      { x: 1700, y: 500, kind: "barrel" },
      { x: 1700, y: 900, kind: "barrel" },
      { x: 1700, y: 1300, kind: "barrel" },
      { x: 1100, y: 700, kind: "sandbag" },
      { x: 1100, y: 1100, kind: "sandbag" },
      { x: 1500, y: 700, kind: "sandbag" },
      { x: 1500, y: 1100, kind: "sandbag" },
    ],
  },
  {
    // Cinder Locks: interlocking barricade blocks slotted together like lock plates.
    id: "map-16",
    name: "Cinder Locks",
    width: 3000,
    height: 1850,
    playerSpawn: { x: 400, y: 925 },
    playerScoreLimit: 7,
    enemyScoreLimit: 8,
    enemySpawns: [
      { x: 2500, y: 560, archetype: "light" },
      { x: 2560, y: 880, archetype: "standard" },
      { x: 2500, y: 1200, archetype: "standard" },
      { x: 2560, y: 720, archetype: "heavy" },
      { x: 2500, y: 1040, archetype: "light" },
    ],
    pickups: [
      { x: 900, y: 965, type: "speed" },
      { x: 1160, y: 520, type: "rapidFire" },
      { x: 1200, y: 1290, type: "shield" },
    ],
    obstacles: [
      { x: 800, y: 500, kind: "barricade" },
      { x: 940, y: 500, kind: "barricade" },
      { x: 800, y: 700, kind: "barricade", rotation: 90 },
      { x: 800, y: 860, kind: "barricade", rotation: 90 },
      { x: 1200, y: 650, kind: "barricade" },
      { x: 1340, y: 650, kind: "barricade" },
      { x: 1340, y: 800, kind: "barricade", rotation: 90 },
      { x: 1340, y: 960, kind: "barricade", rotation: 90 },
      { x: 1200, y: 1150, kind: "barricade" },
      { x: 1340, y: 1150, kind: "barricade" },
      { x: 800, y: 1150, kind: "barricade" },
      { x: 940, y: 1150, kind: "barricade" },
      { x: 1700, y: 500, kind: "barricade", rotation: 90 },
      { x: 1700, y: 660, kind: "barricade", rotation: 90 },
      { x: 1700, y: 1050, kind: "barricade", rotation: 90 },
      { x: 1700, y: 1210, kind: "barricade", rotation: 90 },
      { x: 1500, y: 925, kind: "crate" },
      { x: 1050, y: 925, kind: "crate" },
    ],
  },
  {
    // Mirror Quarry: crate blocks arranged in perfect symmetry about the mid-line.
    id: "map-17",
    name: "Mirror Quarry",
    width: 3100,
    height: 1950,
    playerSpawn: { x: 420, y: 975 },
    playerScoreLimit: 8,
    enemyScoreLimit: 9,
    enemySpawns: [
      { x: 2600, y: 520, archetype: "light" },
      { x: 2660, y: 780, archetype: "standard" },
      { x: 2600, y: 1040, archetype: "heavy" },
      { x: 2660, y: 1300, archetype: "standard" },
      { x: 2600, y: 1560, archetype: "heavy" },
      { x: 2660, y: 900, archetype: "light" },
    ],
    pickups: [
      { x: 880, y: 975, type: "speed" },
      { x: 1300, y: 700, type: "rapidFire" },
      { x: 1300, y: 1250, type: "shield" },
    ],
    obstacles: [
      { x: 850, y: 625, kind: "crate" },
      { x: 850, y: 1325, kind: "crate" },
      { x: 1150, y: 525, kind: "crate" },
      { x: 1150, y: 1425, kind: "crate" },
      { x: 1450, y: 675, kind: "crate" },
      { x: 1450, y: 1275, kind: "crate" },
      { x: 1750, y: 525, kind: "crate" },
      { x: 1750, y: 1425, kind: "crate" },
      { x: 1000, y: 825, kind: "crate" },
      { x: 1000, y: 1125, kind: "crate" },
      { x: 1600, y: 825, kind: "crate" },
      { x: 1600, y: 1125, kind: "crate" },
      { x: 1300, y: 975, kind: "barrel" },
      { x: 1900, y: 975, kind: "barrel" },
    ],
  },
  {
    // Redline Basin: sweeping sandbag arcs cupping a sunken crate-lined basin.
    id: "map-18",
    name: "Redline Basin",
    width: 3200,
    height: 2000,
    playerSpawn: { x: 420, y: 1000 },
    playerScoreLimit: 8,
    enemyScoreLimit: 9,
    enemySpawns: [
      { x: 2680, y: 560, archetype: "standard" },
      { x: 2740, y: 840, archetype: "standard" },
      { x: 2680, y: 1120, archetype: "heavy" },
      { x: 2740, y: 1400, archetype: "heavy" },
      { x: 2680, y: 1600, archetype: "light" },
      { x: 2740, y: 700, archetype: "standard" },
    ],
    pickups: [
      { x: 920, y: 1000, type: "speed" },
      { x: 1300, y: 760, type: "rapidFire" },
      { x: 1300, y: 1240, type: "shield" },
    ],
    obstacles: [
      { x: 900, y: 500, kind: "sandbag" },
      { x: 1100, y: 420, kind: "sandbag" },
      { x: 1300, y: 400, kind: "sandbag" },
      { x: 1500, y: 420, kind: "sandbag" },
      { x: 1700, y: 500, kind: "sandbag" },
      { x: 900, y: 1500, kind: "sandbag" },
      { x: 1100, y: 1580, kind: "sandbag" },
      { x: 1300, y: 1600, kind: "sandbag" },
      { x: 1500, y: 1580, kind: "sandbag" },
      { x: 1700, y: 1500, kind: "sandbag" },
      { x: 800, y: 1000, kind: "sandbag" },
      { x: 1900, y: 1000, kind: "barrel" },
      { x: 1250, y: 850, kind: "crate" },
      { x: 1250, y: 1150, kind: "crate" },
      { x: 1550, y: 850, kind: "crate" },
      { x: 1550, y: 1150, kind: "crate" },
    ],
  },
  {
    // Anchor Field: crate clusters shaped like anchors staked across the field.
    id: "map-19",
    name: "Anchor Field",
    width: 3400,
    height: 2100,
    playerSpawn: { x: 440, y: 1050 },
    playerScoreLimit: 9,
    enemyScoreLimit: 9,
    enemySpawns: [
      { x: 2860, y: 560, archetype: "light" },
      { x: 2920, y: 880, archetype: "standard" },
      { x: 2860, y: 1200, archetype: "standard" },
      { x: 2920, y: 1520, archetype: "heavy" },
      { x: 2860, y: 1720, archetype: "heavy" },
      { x: 2920, y: 720, archetype: "light" },
    ],
    pickups: [
      { x: 900, y: 1050, type: "speed" },
      { x: 1600, y: 760, type: "rapidFire" },
      { x: 1600, y: 1340, type: "shield" },
    ],
    obstacles: [
      { x: 1000, y: 560, kind: "crate" },
      { x: 1000, y: 700, kind: "crate" },
      { x: 1000, y: 840, kind: "crate" },
      { x: 860, y: 700, kind: "crate" },
      { x: 1140, y: 700, kind: "crate" },
      { x: 1600, y: 910, kind: "crate" },
      { x: 1600, y: 1050, kind: "crate" },
      { x: 1600, y: 1190, kind: "crate" },
      { x: 1460, y: 1050, kind: "crate" },
      { x: 1740, y: 1050, kind: "crate" },
      { x: 1000, y: 1310, kind: "crate" },
      { x: 1000, y: 1450, kind: "crate" },
      { x: 1000, y: 1590, kind: "crate" },
      { x: 860, y: 1450, kind: "crate" },
      { x: 1140, y: 1450, kind: "crate" },
      { x: 2000, y: 700, kind: "barrel" },
      { x: 2000, y: 1400, kind: "barrel" },
    ],
  },
  {
    // Thunder Gate: a colossal barricade gate arch dominating a vast open boss arena.
    id: "map-20",
    name: "Thunder Gate",
    width: 3600,
    height: 2400,
    playerSpawn: { x: 460, y: 1200 },
    playerScoreLimit: 1,
    enemyScoreLimit: 4,
    enemySpawns: [
      { x: 3060, y: 1200, archetype: "boss" },
    ],
    pickups: [
      { x: 900, y: 1200, type: "speed" },
      { x: 1600, y: 820, type: "rapidFire" },
      { x: 1600, y: 1580, type: "shield" },
    ],
    obstacles: [
      { x: 1300, y: 700, kind: "barricade", rotation: 90 },
      { x: 1300, y: 860, kind: "barricade", rotation: 90 },
      { x: 1300, y: 1020, kind: "barricade", rotation: 90 },
      { x: 1300, y: 1380, kind: "barricade", rotation: 90 },
      { x: 1300, y: 1540, kind: "barricade", rotation: 90 },
      { x: 1300, y: 1700, kind: "barricade", rotation: 90 },
      { x: 1900, y: 700, kind: "barricade", rotation: 90 },
      { x: 1900, y: 860, kind: "barricade", rotation: 90 },
      { x: 1900, y: 1020, kind: "barricade", rotation: 90 },
      { x: 1900, y: 1380, kind: "barricade", rotation: 90 },
      { x: 1900, y: 1540, kind: "barricade", rotation: 90 },
      { x: 1900, y: 1700, kind: "barricade", rotation: 90 },
      { x: 1450, y: 600, kind: "barricade" },
      { x: 1600, y: 600, kind: "barricade" },
      { x: 1750, y: 600, kind: "barricade" },
      { x: 1000, y: 1200, kind: "barrel" },
      { x: 2200, y: 1200, kind: "barrel" },
      { x: 1600, y: 1200, kind: "crate" },
    ],
  },
];

export const CAMPAIGN_MAPS: CampaignMap[] = [
  ...BASE_CAMPAIGN_MAPS,
  ...AUTHORED_CAMPAIGN_MAPS,
].map(numberCampaignMap);

const BASE_CTF_MAPS: CampaignMap[] = [
  {
    id: "ctf-1",
    name: "Twin Depot",
    width: 2200,
    height: 1400,
    playerSpawn: { x: 280, y: 560 },
    playerTwoSpawn: { x: 280, y: 840 },
    playerScoreLimit: 3,
    enemyScoreLimit: 3,
    enemySpawns: [
      { x: 1920, y: 560, archetype: "light" },
      { x: 1920, y: 840, archetype: "light" },
    ],
    ctf: {
      blueBase: { x: 230, y: 700, radius: 120 },
      redBase: { x: 1970, y: 700, radius: 120 },
      blueFlag: { x: 230, y: 700 },
      redFlag: { x: 1970, y: 700 },
      blueSpawns: [
        { x: 330, y: 500 },
        { x: 330, y: 900 },
      ],
      redSpawns: [
        { x: 1870, y: 500 },
        { x: 1870, y: 900 },
      ],
      captureLimit: 3,
    },
    pickups: [
      { x: 1100, y: 700, type: "speed" },
      { x: 760, y: 350, type: "rapidFire" },
      { x: 1440, y: 1050, type: "shield" },
    ],
    obstacles: [
      { x: 760, y: 560, kind: "crate" },
      { x: 760, y: 840, kind: "crate" },
      { x: 1100, y: 420, kind: "barricade" },
      { x: 1100, y: 980, kind: "barricade" },
      { x: 1440, y: 560, kind: "crate" },
      { x: 1440, y: 840, kind: "crate" },
      { x: 1100, y: 700, kind: "barrel" },
    ],
  },
  {
    id: "ctf-2",
    name: "Bridge Cut",
    width: 2400,
    height: 1500,
    playerSpawn: { x: 320, y: 560 },
    playerTwoSpawn: { x: 320, y: 940 },
    playerScoreLimit: 3,
    enemyScoreLimit: 3,
    enemySpawns: [
      { x: 2080, y: 560, archetype: "light" },
      { x: 2080, y: 940, archetype: "standard" },
    ],
    ctf: {
      blueBase: { x: 260, y: 750, radius: 125 },
      redBase: { x: 2140, y: 750, radius: 125 },
      blueFlag: { x: 260, y: 750 },
      redFlag: { x: 2140, y: 750 },
      blueSpawns: [
        { x: 380, y: 520 },
        { x: 380, y: 980 },
      ],
      redSpawns: [
        { x: 2020, y: 520 },
        { x: 2020, y: 980 },
      ],
      captureLimit: 3,
    },
    pickups: [
      { x: 1200, y: 750, type: "shield" },
      { x: 900, y: 300, type: "speed" },
      { x: 1500, y: 1200, type: "rapidFire" },
    ],
    obstacles: [
      { x: 760, y: 380, kind: "sandbag" },
      { x: 760, y: 1120, kind: "sandbag" },
      { x: 1050, y: 650, kind: "barricade", rotation: 90 },
      { x: 1050, y: 850, kind: "barricade", rotation: 90 },
      { x: 1350, y: 650, kind: "barricade", rotation: 90 },
      { x: 1350, y: 850, kind: "barricade", rotation: 90 },
      { x: 1640, y: 380, kind: "sandbag" },
      { x: 1640, y: 1120, kind: "sandbag" },
    ],
  },
  {
    id: "ctf-3",
    name: "Forked Yard",
    width: 2600,
    height: 1600,
    playerSpawn: { x: 360, y: 600 },
    playerTwoSpawn: { x: 360, y: 1000 },
    playerScoreLimit: 3,
    enemyScoreLimit: 3,
    enemySpawns: [
      { x: 2240, y: 600, archetype: "standard" },
      { x: 2240, y: 1000, archetype: "standard" },
    ],
    ctf: {
      blueBase: { x: 290, y: 800, radius: 130 },
      redBase: { x: 2310, y: 800, radius: 130 },
      blueFlag: { x: 290, y: 800 },
      redFlag: { x: 2310, y: 800 },
      blueSpawns: [
        { x: 430, y: 540 },
        { x: 430, y: 1060 },
      ],
      redSpawns: [
        { x: 2170, y: 540 },
        { x: 2170, y: 1060 },
      ],
      captureLimit: 3,
    },
    pickups: [
      { x: 1300, y: 800, type: "speed" },
      { x: 1040, y: 410, type: "rapidFire" },
      { x: 1560, y: 1190, type: "shield" },
    ],
    obstacles: [
      { x: 860, y: 520, kind: "crate" },
      { x: 860, y: 1080, kind: "crate" },
      { x: 1160, y: 650, kind: "barricade" },
      { x: 1160, y: 950, kind: "barricade" },
      { x: 1300, y: 800, kind: "barrel" },
      { x: 1440, y: 650, kind: "barricade" },
      { x: 1440, y: 950, kind: "barricade" },
      { x: 1740, y: 520, kind: "crate" },
      { x: 1740, y: 1080, kind: "crate" },
    ],
  },
  {
    id: "ctf-4",
    name: "Shell Garden",
    width: 2800,
    height: 1700,
    playerSpawn: { x: 380, y: 650 },
    playerTwoSpawn: { x: 380, y: 1050 },
    playerScoreLimit: 3,
    enemyScoreLimit: 3,
    enemySpawns: [
      { x: 2420, y: 650, archetype: "standard" },
      { x: 2420, y: 1050, archetype: "heavy" },
    ],
    ctf: {
      blueBase: { x: 320, y: 850, radius: 135 },
      redBase: { x: 2480, y: 850, radius: 135 },
      blueFlag: { x: 320, y: 850 },
      redFlag: { x: 2480, y: 850 },
      blueSpawns: [
        { x: 470, y: 590 },
        { x: 470, y: 1110 },
      ],
      redSpawns: [
        { x: 2330, y: 590 },
        { x: 2330, y: 1110 },
      ],
      captureLimit: 3,
    },
    pickups: [
      { x: 1400, y: 850, type: "shield" },
      { x: 1080, y: 430, type: "speed" },
      { x: 1720, y: 1270, type: "rapidFire" },
      { x: 1400, y: 300, type: "speed" },
    ],
    obstacles: [
      { x: 820, y: 420, kind: "barrel" },
      { x: 820, y: 1280, kind: "barrel" },
      { x: 1040, y: 680, kind: "sandbag", rotation: 90 },
      { x: 1040, y: 1020, kind: "sandbag", rotation: 90 },
      { x: 1400, y: 620, kind: "crate" },
      { x: 1400, y: 1080, kind: "crate" },
      { x: 1760, y: 680, kind: "sandbag", rotation: 90 },
      { x: 1760, y: 1020, kind: "sandbag", rotation: 90 },
      { x: 1980, y: 420, kind: "barrel" },
      { x: 1980, y: 1280, kind: "barrel" },
    ],
  },
  {
    id: "ctf-5",
    name: "Citadel Run",
    width: 3000,
    height: 1800,
    playerSpawn: { x: 420, y: 680 },
    playerTwoSpawn: { x: 420, y: 1120 },
    playerScoreLimit: 3,
    enemyScoreLimit: 3,
    enemySpawns: [
      { x: 2580, y: 680, archetype: "heavy" },
      { x: 2580, y: 1120, archetype: "heavy" },
    ],
    ctf: {
      blueBase: { x: 350, y: 900, radius: 145 },
      redBase: { x: 2650, y: 900, radius: 145 },
      blueFlag: { x: 350, y: 900 },
      redFlag: { x: 2650, y: 900 },
      blueSpawns: [
        { x: 520, y: 620 },
        { x: 520, y: 1180 },
      ],
      redSpawns: [
        { x: 2480, y: 620 },
        { x: 2480, y: 1180 },
      ],
      captureLimit: 3,
    },
    pickups: [
      { x: 1500, y: 900, type: "shield" },
      { x: 1180, y: 520, type: "rapidFire" },
      { x: 1820, y: 1280, type: "speed" },
    ],
    obstacles: [
      { x: 900, y: 520, kind: "barricade" },
      { x: 900, y: 900, kind: "crate" },
      { x: 900, y: 1280, kind: "barricade" },
      { x: 1260, y: 720, kind: "sandbag", rotation: 90 },
      { x: 1260, y: 1080, kind: "sandbag", rotation: 90 },
      { x: 1500, y: 540, kind: "barrel" },
      { x: 1500, y: 1260, kind: "barrel" },
      { x: 1740, y: 720, kind: "sandbag", rotation: 90 },
      { x: 1740, y: 1080, kind: "sandbag", rotation: 90 },
      { x: 2100, y: 520, kind: "barricade" },
      { x: 2100, y: 900, kind: "crate" },
      { x: 2100, y: 1280, kind: "barricade" },
    ],
  },
];

const AUTHORED_CTF_MAPS: CampaignMap[] = [
  createCaptureTheFlagMap(6, "Canal Break", 3200, 1840, ["light", "standard"], 0),
  createCaptureTheFlagMap(7, "Iron Switch", 3300, 1880, ["standard", "standard"], 1),
  createCaptureTheFlagMap(8, "Depot Loop", 3400, 1920, ["standard", "heavy"], 2),
  createCaptureTheFlagMap(9, "River Teeth", 3500, 1960, ["light", "heavy"], 3),
  createCaptureTheFlagMap(10, "Bunker Split", 3600, 2000, ["heavy", "heavy"], 4),
  createCaptureTheFlagMap(11, "Twin Locks", 3200, 1880, ["standard", "light"], 5),
  createCaptureTheFlagMap(12, "Crossfire Yard", 3350, 1920, ["standard", "heavy"], 6),
  createCaptureTheFlagMap(13, "Signal Flats", 3500, 1980, ["light", "standard"], 7),
  createCaptureTheFlagMap(14, "Redline Pass", 3650, 2020, ["heavy", "standard"], 8),
  createCaptureTheFlagMap(15, "Command Gate", 3800, 2060, ["heavy", "heavy"], 9),
  createCaptureTheFlagMap(16, "Switchback", 3400, 1960, ["standard", "standard"], 10),
  createCaptureTheFlagMap(17, "Battery Row", 3550, 2020, ["light", "heavy"], 11),
  createCaptureTheFlagMap(18, "Causeway", 3700, 2080, ["standard", "heavy"], 12),
  createCaptureTheFlagMap(19, "Forklift Maze", 3850, 2120, ["heavy", "standard"], 13),
  createCaptureTheFlagMap(20, "Final Relay", 4000, 2160, ["heavy", "heavy"], 14),
];

export const CAPTURE_THE_FLAG_MAPS: CampaignMap[] = [
  ...BASE_CTF_MAPS,
  ...AUTHORED_CTF_MAPS,
].map(numberCaptureTheFlagMap);

function createCaptureTheFlagMap(
  number: number,
  name: string,
  width: number,
  height: number,
  enemyArchetypes: [EnemyArchetype, EnemyArchetype],
  variant: number,
): CampaignMap {
  const centerX = width / 2;
  const centerY = height / 2;
  const baseInset = Math.round(width * 0.12);
  const spawnInset = baseInset + 180;
  const upperLane = Math.round(height * 0.32);
  const lowerLane = Math.round(height * 0.68);
  const baseRadius = 130 + (variant % 4) * 8;

  return {
    id: `ctf-${number}`,
    name,
    width,
    height,
    playerSpawn: { x: spawnInset, y: upperLane },
    playerTwoSpawn: { x: spawnInset, y: lowerLane },
    playerScoreLimit: 3,
    enemyScoreLimit: 3,
    enemySpawns: [
      { x: width - spawnInset, y: upperLane, archetype: enemyArchetypes[0] },
      { x: width - spawnInset, y: lowerLane, archetype: enemyArchetypes[1] },
    ],
    ctf: {
      blueBase: { x: baseInset, y: centerY, radius: baseRadius },
      redBase: { x: width - baseInset, y: centerY, radius: baseRadius },
      blueFlag: { x: baseInset, y: centerY },
      redFlag: { x: width - baseInset, y: centerY },
      blueSpawns: [
        { x: spawnInset, y: upperLane },
        { x: spawnInset, y: lowerLane },
      ],
      redSpawns: [
        { x: width - spawnInset, y: upperLane },
        { x: width - spawnInset, y: lowerLane },
      ],
      captureLimit: 3,
    },
    pickups: createCtfPickups(width, height, variant),
    obstacles: createCtfObstacles(width, height, variant),
  };
}

function createCtfPickups(width: number, height: number, variant: number): PickupConfig[] {
  const centerX = width / 2;
  const centerY = height / 2;
  const stagger = (variant % 3) * 70;

  return [
    { x: centerX, y: centerY, type: variant % 2 === 0 ? "speed" : "shield" },
    { x: Math.round(width * 0.34), y: Math.round(height * 0.24) + stagger, type: "rapidFire" },
    { x: Math.round(width * 0.66), y: Math.round(height * 0.76) - stagger, type: "speed" },
    { x: Math.round(width * 0.5), y: variant % 2 === 0 ? Math.round(height * 0.18) : Math.round(height * 0.82), type: "shield" },
  ];
}

function createCtfObstacles(width: number, height: number, variant: number): ObstacleConfig[] {
  const centerX = width / 2;
  const centerY = height / 2;
  const upperLane = Math.round(height * 0.34);
  const lowerLane = Math.round(height * 0.66);
  const leftGate = Math.round(width * 0.34);
  const rightGate = Math.round(width * 0.66);
  const offset = (variant % 4) * 34;
  const middleKind: ObstacleConfig["kind"] = variant % 2 === 0 ? "crate" : "barrel";

  const obstacles: ObstacleConfig[] = [
    { x: leftGate, y: upperLane - offset, kind: "sandbag" },
    { x: leftGate, y: lowerLane + offset, kind: "sandbag" },
    { x: rightGate, y: upperLane + offset, kind: "sandbag" },
    { x: rightGate, y: lowerLane - offset, kind: "sandbag" },
    { x: centerX - 240, y: centerY - 170, kind: "barricade", rotation: 90 },
    { x: centerX - 240, y: centerY + 170, kind: "barricade", rotation: 90 },
    { x: centerX + 240, y: centerY - 170, kind: "barricade", rotation: 90 },
    { x: centerX + 240, y: centerY + 170, kind: "barricade", rotation: 90 },
    { x: centerX, y: centerY - 310, kind: middleKind },
    { x: centerX, y: centerY + 310, kind: middleKind },
  ];

  if (variant % 3 === 0) {
    obstacles.push(
      { x: Math.round(width * 0.24), y: centerY, kind: "crate" },
      { x: Math.round(width * 0.76), y: centerY, kind: "crate" },
    );
  } else if (variant % 3 === 1) {
    obstacles.push(
      { x: Math.round(width * 0.44), y: Math.round(height * 0.2), kind: "barrel" },
      { x: Math.round(width * 0.56), y: Math.round(height * 0.8), kind: "barrel" },
    );
  } else {
    obstacles.push(
      { x: Math.round(width * 0.44), y: Math.round(height * 0.8), kind: "crate" },
      { x: Math.round(width * 0.56), y: Math.round(height * 0.2), kind: "crate" },
    );
  }

  return obstacles;
}

export function getMapByIndex(index: number): CampaignMap {
  const map = CAMPAIGN_MAPS[index];

  if (!map) {
    throw new Error(`Unknown campaign map index ${index}`);
  }

  return map;
}

export function getCaptureTheFlagMapByIndex(index: number): CampaignMap {
  const map = CAPTURE_THE_FLAG_MAPS[index];

  if (!map) {
    throw new Error(`Unknown capture the flag map index ${index}`);
  }

  return map;
}

function numberCampaignMap(map: CampaignMap, index: number): CampaignMap {
  const number = String(index + 1).padStart(2, "0");
  return {
    ...map,
    name: `${number}. ${map.name}`,
  };
}

function numberCaptureTheFlagMap(map: CampaignMap, index: number): CampaignMap {
  const number = String(index + 1).padStart(2, "0");
  return {
    ...map,
    name: `${number}. ${map.name}`,
  };
}

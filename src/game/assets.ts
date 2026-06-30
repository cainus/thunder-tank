export const ASSET_BASE = "/assets/kenney";

export const ASSETS = {
  playerHull: `${ASSET_BASE}/top-down-tanks/PNG/Retina/tankBody_blue.png`,
  playerTurret: `${ASSET_BASE}/top-down-tanks/PNG/Retina/tankBlue_barrel1.png`,
  enemyLightHull: `${ASSET_BASE}/top-down-tanks/PNG/Retina/tankBody_red.png`,
  enemyLightTurret: `${ASSET_BASE}/top-down-tanks/PNG/Retina/tankRed_barrel1.png`,
  enemyStandardHull: `${ASSET_BASE}/top-down-tanks/PNG/Retina/tankBody_dark.png`,
  enemyStandardTurret: `${ASSET_BASE}/top-down-tanks/PNG/Retina/tankDark_barrel2.png`,
  enemyHeavyHull: `${ASSET_BASE}/top-down-tanks/PNG/Retina/tankBody_bigRed.png`,
  enemyHeavyTurret: `${ASSET_BASE}/top-down-tanks/PNG/Retina/tankRed_barrel3.png`,
  bulletPlayer: `${ASSET_BASE}/top-down-tanks/PNG/Retina/bulletBlue1.png`,
  bulletEnemy: `${ASSET_BASE}/top-down-tanks/PNG/Retina/bulletRed1.png`,
  explosion: `${ASSET_BASE}/top-down-tanks/PNG/Retina/explosion1.png`,
  crate: `${ASSET_BASE}/top-down-tanks/PNG/Retina/crateMetal.png`,
  barrel: `${ASSET_BASE}/top-down-tanks/PNG/Retina/barrelRed_side.png`,
  barricade: `${ASSET_BASE}/top-down-tanks/PNG/Retina/barricadeMetal.png`,
  sandbag: `${ASSET_BASE}/top-down-tanks/PNG/Retina/sandbagBeige.png`,
  pickupSpeed: "/assets/game-icons/power-lightning.svg",
  pickupRapidFire: `${ASSET_BASE}/top-down-tanks/PNG/Retina/specialBarrel5_outline.png`,
  pickupShield: "/assets/game-icons/shield.svg",
  fireSfx15: "/assets/opengameart/bang-firework-rubberduck/cannon_01.ogg",
  fireSfx16: "/assets/opengameart/bang-firework-rubberduck/cannon_02.ogg",
  fireSfx17: "/assets/opengameart/bang-firework-rubberduck/cannon_03.ogg",
  explosionSfx4: "/assets/opengameart/sfx-pack-2-phoenix1291/explosion_04.ogg",
  explosionSfx7: "/assets/opengameart/sfx-pack-2-phoenix1291/explosion_07.ogg",
  motorSfx1: "/assets/opengameart/motor-loops/engine_heavy_loop_2.ogg",
  motorSfx2: "/assets/opengameart/motor-loops/engine_heavy_slow_loop_0.ogg",
  motorSfx3: "/assets/opengameart/motor-loops/engine_heavy_average_loop_0.ogg",
  motorSfx4: "/assets/opengameart/motor-loops/engine_heavy_fast_loop_0.ogg",
  pickupSfx: `${ASSET_BASE}/impact-sounds/Audio/impactTin_medium_001.ogg`,
  uiSfx: `${ASSET_BASE}/interface-sounds/Audio/select_004.ogg`,
};

export const ASSET_KEYS = Object.keys(ASSETS) as Array<keyof typeof ASSETS>;
export type AssetKey = keyof typeof ASSETS;

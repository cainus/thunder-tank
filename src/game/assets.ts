export const ASSET_BASE = "/assets/kenney";

export const ASSETS = {
  // Every tank shares a neutral grey body/turret; team identity is shown with a
  // colored stripe overlay instead of a colored hull.
  greyHull: `${ASSET_BASE}/top-down-tanks/PNG/Retina/tankBody_dark.png`,
  greyHullLarge: `${ASSET_BASE}/top-down-tanks/PNG/Retina/tankBody_darkLarge.png`,
  greyTurretLight: `${ASSET_BASE}/top-down-tanks/PNG/Retina/tankDark_barrel1.png`,
  greyTurretStandard: `${ASSET_BASE}/top-down-tanks/PNG/Retina/tankDark_barrel2.png`,
  greyTurretHeavy: `${ASSET_BASE}/top-down-tanks/PNG/Retina/tankDark_barrel3.png`,
  bulletPlayer: `${ASSET_BASE}/top-down-tanks/PNG/Retina/bulletDark1.png`,
  bulletEnemy: `${ASSET_BASE}/top-down-tanks/PNG/Retina/bulletDark1.png`,
  explosion: `${ASSET_BASE}/top-down-tanks/PNG/Retina/explosion1.png`,
  crate: `${ASSET_BASE}/top-down-tanks/PNG/Retina/crateMetal.png`,
  barrel: `${ASSET_BASE}/top-down-tanks/PNG/Retina/barrelRed_side.png`,
  barricade: `${ASSET_BASE}/top-down-tanks/PNG/Retina/barricadeMetal.png`,
  sandbag: `${ASSET_BASE}/top-down-tanks/PNG/Retina/sandbagBeige.png`,
  treeGreenLarge: `${ASSET_BASE}/top-down-tanks/PNG/Retina/treeGreen_large.png`,
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

// 3D models are loaded by the three.js overlay (see tree-3d.ts), not by Phaser's
// image loader, so they live outside the ASSETS map that `preload` iterates.
export const MODEL_ASSETS = {
  // Low-poly urban tree, authored by scripts/generate-tree-model.mjs. The .obj
  // references tree.mtl via `mtllib`, so both files must sit side by side.
  tree: "/assets/models/tree.obj",
  // Low-poly tank hull and turret, authored by scripts/generate-tank-model.mjs.
  // The turret is a separate model so it can rotate independently of the hull.
  // Each .obj references its sibling .mtl via `mtllib`.
  tankHull: "/assets/models/tank-hull.obj",
  tankTurret: "/assets/models/tank-turret.obj",
  // Low-poly crate obstacle, authored by scripts/generate-crate-model.mjs. As
  // with the tree, the .obj references crate.mtl via `mtllib`.
  crate: "/assets/models/crate.obj",
};

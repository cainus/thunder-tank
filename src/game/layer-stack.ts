// Single source of truth for the game view's cross-canvas stacking order.
//
// The in-game view is a stack of sibling elements mounted on one persistent DOM
// host: the Phaser base canvas at the bottom, one or more three.js WebGL overlay
// canvases composited above it, and the DOM HUD on top. Two independent systems
// decide what draws over what, and they DO NOT compose:
//
//   * Phaser `setDepth`  — orders sprites only WITHIN the base game canvas. It
//                          cannot lift anything above the sibling overlay
//                          canvases, which are separate DOM elements.
//   * CSS `z-index`      — orders the sibling canvases and the DOM HUD relative
//                          to each other across the canvas boundary.
//
// TT-28: the RESPAWN countdown and the CTF AI role labels were authored as
// Phaser Text at depth 100 / 70, which looks like "top of everything" but is
// really pinned to the base canvas layer (z-index auto/0) — UNDER the 3D
// overlays. The lesson encoded here: the CSS z-index stack below is the ONLY
// canonical owner of cross-canvas stacking. Anything that must read above the 3D
// overlays MUST live in a DOM layer in this scale, not rely on Phaser depth.
//
//   base Phaser canvas ........... z-index auto (0)   2D sprites, ground
//   3D tree / crate / car overlay  z-index auto (0)
//   3D tank overlay .............. z-index 1          tanks over the canopy
//   DOM game HUD overlay ......... z-index 4          RESPAWN, AI role labels
//   React HUD (.hud, styles.css) . z-index 5          score / lives panels
//
// styles.css mirrors the `hud` value; keep the two in sync if either moves.
export const LAYER_Z = {
  // The 3D tank overlay canvas (tank-3d.ts) — the highest of the 3D overlays.
  tankOverlay: 1,
  // The DOM HUD overlay that carries in-world HUD messages which must read on
  // top of every 3D overlay (game-hud-overlay.ts).
  gameHudOverlay: 4,
  // The React HUD panel stack (styles.css `.hud`).
  hud: 5,
} as const;

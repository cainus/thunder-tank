// Single source of truth for the game view's cross-canvas stacking order.
//
// The in-game view is a stack of sibling elements mounted on one persistent DOM
// host: the Phaser base canvas at the bottom, a single three.js WebGL overlay
// canvas composited above it, and the DOM HUD on top. Two independent systems
// decide what draws over what, and they DO NOT compose:
//
//   * Phaser `setDepth`  — orders sprites only WITHIN the base game canvas. It
//                          cannot lift anything above the sibling overlay
//                          canvas, which is a separate DOM element.
//   * CSS `z-index`      — orders the sibling canvas and the DOM HUD relative
//                          to each other across the canvas boundary.
//
// TT-29: trees, crates, cars, and tanks used to each render into their own
// stacked WebGL canvas, so their depth buffers could not sort against one
// another — a tank behind a tree still drew on top because the tank canvas was
// pinned above the tree canvas. They now share ONE three.js scene on ONE overlay
// canvas (overlay-3d.ts) so the depth buffer sorts every 3D object correctly.
//
// TT-28: the RESPAWN countdown and the CTF AI role labels were authored as
// Phaser Text at depth 100 / 70, which looks like "top of everything" but is
// really pinned to the base canvas layer (z-index auto/0) — UNDER the 3D
// overlay. The lesson encoded here: the CSS z-index stack below is the ONLY
// canonical owner of cross-canvas stacking. Anything that must read above the 3D
// overlay MUST live in a DOM layer in this scale, not rely on Phaser depth.
//
//   base Phaser canvas ........... z-index auto (0)   2D sprites, ground
//   3D world overlay ............. z-index 1          trees, crates, cars, tanks
//   DOM game HUD overlay ......... z-index 4          RESPAWN, AI role labels
//   React HUD (.hud, styles.css) . z-index 5          score / lives panels
//
// styles.css mirrors the `hud` value; keep the two in sync if either moves.
export const LAYER_Z = {
  // The single 3D world overlay canvas (overlay-3d.ts) that draws all depth-
  // sorted 3D decor and tanks above the base game canvas.
  worldOverlay: 1,
  // The DOM HUD overlay that carries in-world HUD messages which must read on
  // top of the 3D overlay (game-hud-overlay.ts).
  gameHudOverlay: 4,
  // The React HUD panel stack (styles.css `.hud`).
  hud: 5,
} as const;

// Pure geometry helpers for the urban map decoration. These are kept free of
// Phaser and three.js so they can be unit-tested and shared between the 2D
// scene (CampaignScene) and the 3D tree overlay (tree-3d.ts) without pulling in
// a rendering engine.
import type { Vec2 } from "./types";

// World tilt (radians) applied to the orthographic 3D tree camera. A small tilt
// keeps each tree's trunk base aligned with its flat 2D map position while
// letting the canopy lean up-screen, which is what sells the models as 3D.
export const TREE_CAMERA_TILT = (24 * Math.PI) / 180;

// Uniform world-units-per-model-unit scale applied to the loaded tree model.
// The model is authored with a ~1-unit canopy radius, so this makes a canopy
// read at roughly URBAN_TREE_SIZE (96px) across.
export const TREE_WORLD_SCALE = 46;

// Peak deviation from the base tree size, as a fraction. A tree's size is
// multiplied by treeScaleFactor(), which lands within [1 - v, 1 + v], so the
// canopies read as a varied grove instead of identical stamps.
export const TREE_SCALE_VARIATION = 0.3;

/**
 * Deterministic per-tree size multiplier in [1 - TREE_SCALE_VARIATION,
 * 1 + TREE_SCALE_VARIATION]. Keyed off the tree's index so the layout is stable
 * across renders (and testable) while neighbouring trees still differ markedly.
 * Shared by the 3D overlay, the flat-sprite fallback, and their ground shadows
 * so a given tree reads at the same size whichever renderer draws it.
 */
export function treeScaleFactor(index: number): number {
  // Cheap hash → fractional part gives a well-spread pseudo-random value in
  // [0, 1) that jumps between adjacent indices (unlike a smooth ramp).
  const hash = Math.sin((index + 1) * 12.9898) * 43758.5453;
  const fraction = hash - Math.floor(hash);
  return 1 - TREE_SCALE_VARIATION + fraction * (2 * TREE_SCALE_VARIATION);
}

// data-testid stamped on the 3D tree overlay canvas. Exported so the overlay
// (which stamps it) and the duplicate-cleanup sweep agree on one selector.
export const TREE_OVERLAY_TESTID = "tree-overlay-3d";

/**
 * Removes any pre-existing 3D tree overlay canvases from `host`. Each map runs
 * inside a fresh Phaser.Game mounted on the same persistent DOM host, so an
 * overlay canvas left behind by a prior game would stack a second grove on top
 * of the new map's — the reported "trees duplicate on every map". Sweeping the
 * host before appending a new overlay guarantees at most one overlay canvas,
 * regardless of Phaser teardown timing or async model-load races.
 */
export function removeExistingTreeOverlays(host: HTMLElement): void {
  const existing = host.querySelectorAll(`[data-testid="${TREE_OVERLAY_TESTID}"]`);
  existing.forEach((node) => node.remove());
}

/**
 * Fixed positions for the urban trees, expressed in world coordinates. The
 * layout hugs the plaza corners and the mid-points of each road edge so the
 * trees frame the arena without blocking the drivable road. Mirrored between
 * CampaignScene (renders them) and the Level Editor preview (schematic).
 */
export function computeUrbanTreeSpots(
  width: number,
  height: number,
  roadInsetX: number,
  roadInsetY: number,
): Vec2[] {
  return [
    { x: roadInsetX * 0.55, y: roadInsetY * 0.58 },
    { x: width - roadInsetX * 0.55, y: roadInsetY * 0.58 },
    { x: roadInsetX * 0.55, y: height - roadInsetY * 0.58 },
    { x: width - roadInsetX * 0.55, y: height - roadInsetY * 0.58 },
    { x: width / 2, y: roadInsetY * 0.46 },
    { x: width / 2, y: height - roadInsetY * 0.46 },
    { x: roadInsetX * 0.42, y: height / 2 },
    { x: width - roadInsetX * 0.42, y: height / 2 },
  ];
}

/**
 * Orthographic frustum half-extents that make the ground plane (y = 0) of the
 * tilted 3D camera map 1:1 onto a Phaser camera's visible world rectangle. The
 * vertical extent is foreshortened by cos(tilt) so that ground positions still
 * land exactly under their flat 2D counterparts; only elevated geometry (the
 * canopy) shifts on screen, producing the 3D lean.
 */
export function treeOrthoFrustum(
  viewWidth: number,
  viewHeight: number,
  tilt: number = TREE_CAMERA_TILT,
): { halfWidth: number; halfHeight: number } {
  return {
    halfWidth: viewWidth / 2,
    halfHeight: (viewHeight * Math.cos(tilt)) / 2,
  };
}

/**
 * Whether the current environment can create a WebGL context. Kept here (free of
 * three.js) so callers can decide synchronously whether to lazy-load the 3D tree
 * overlay or fall back to flat sprites, without pulling three into the main
 * bundle. Returns false in non-DOM/test environments.
 */
export function isWebglAvailable(): boolean {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return false;
  }

  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")),
    );
  } catch {
    return false;
  }
}

/**
 * How far up-screen (in world pixels) a point at the given height above the
 * ground appears, relative to its base, under the tilted tree camera. Used only
 * for reasoning/tests about the lean; the actual projection is done by three.js.
 */
export function treeHeightScreenOffset(height: number, tilt: number = TREE_CAMERA_TILT): number {
  return height * Math.sin(tilt);
}

// World-space radius of the soft hole punched into the 3D tree canopy for each
// tank so the tank (drawn by Phaser underneath) always reads on top of the
// decoration, matching the pre-3D depth order (flat trees sat below tanks).
export const TREE_OCCLUDER_WORLD_RADIUS = 54;

export interface TreeViewRect {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

/**
 * Maps a ground-plane world position + radius onto the tree overlay's clip
 * space, returning the centre and full width/height of an axis-aligned quad in
 * normalized device coordinates ([-1, 1], y-up). Because the tree camera
 * keeps ground positions in 1:1 registration with the Phaser view (see
 * treeOrthoFrustum), a ground point maps linearly across the view rectangle.
 * Kept engine-free so the occlusion mapping can be unit-tested without WebGL.
 */
export function occluderClipTransform(
  worldX: number,
  worldY: number,
  view: TreeViewRect,
  radius: number = TREE_OCCLUDER_WORLD_RADIUS,
): { x: number; y: number; width: number; height: number } {
  return {
    x: ((worldX - view.centerX) / view.width) * 2,
    // Screen/clip Y grows downward in world space but upward in NDC, so flip.
    y: -((worldY - view.centerY) / view.height) * 2,
    width: (2 * radius) / view.width,
    height: (2 * radius) / view.height,
  };
}

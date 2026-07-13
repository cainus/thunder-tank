// Pure geometry helpers for the urban map decoration. These are kept free of
// Phaser and three.js so they can be unit-tested and shared between the 2D
// scene (CampaignScene) and the 3D tree overlay (tree-3d.ts) without pulling in
// a rendering engine.
import type { Vec2 } from "./types";

// World tilt (radians) applied to the orthographic 3D tree camera. The tilt
// keeps each tree's trunk base aligned with its flat 2D map position (ground
// registration is tilt-independent — see treeOrthoFrustum) while letting the
// canopy lean up-screen, which both sells the models as 3D and — crucially —
// exposes the trunk below the canopy. An almost-top-down tilt hid the trunk
// entirely because the canopy overhangs the trunk base from directly above, so
// trees rendered as bare blobs (the "trees have no trunks" defect). This more
// oblique angle lifts the leaned canopy clear of the trunk base; the visible,
// ground-planted trunk also anchors each tree to its fixed map spot so the
// canopy no longer reads as an unmoored blob drifting with the camera.
export const TREE_CAMERA_TILT = (42 * Math.PI) / 180;

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

// data-testid stamped on the 3D crate overlay canvas (the square obstacles).
// Kept distinct from the tree overlay so the two stacked overlays can be found,
// swept, and cleaned up independently.
export const CRATE_OVERLAY_TESTID = "crate-overlay-3d";

// data-testid stamped on the 3D parked-car overlay canvas. Distinct from the
// tree and crate overlays so all three stacked overlays can be found, swept, and
// cleaned up independently.
export const CAR_OVERLAY_TESTID = "car-overlay-3d";

// Uniform world-units-per-model-unit scale applied to the loaded crate model.
// The model is authored with a 1-unit footprint, so this makes a crate read at
// roughly the size of the flat crateMetal sprite it replaces (56px sprite scaled
// 1.25 in-scene ≈ 70px).
export const CRATE_WORLD_SCALE = 70;

// Footprint of a parked car in world pixels: length along its facing axis and
// width across it, matching the flat car sprite the 3D model replaces. Shared by
// the collision body, the flat fallback sprite, and the 3D overlay so a car reads
// (and blocks) the same size whichever renderer draws it.
export const CAR_BODY_LENGTH = 64;
export const CAR_BODY_WIDTH = 30;

// Uniform world-units-per-model-unit scale applied to the loaded car model. The
// model is authored with a 1-unit length, so this makes a car read at roughly
// CAR_BODY_LENGTH pixels long.
export const CAR_WORLD_SCALE = CAR_BODY_LENGTH;

// Single owner for "how solid a real 3D obstacle reads". Trees and crates are
// solid objects (not the translucent ground dressing washed back by
// URBAN_DECOR_ALPHA), so both their 3D overlay canvases — and the flat-sprite
// fallback trees — composite fully opaque. Hoisted here so the tree and crate
// overlays share one value and cannot drift apart again.
export const OPAQUE_OVERLAY_OPACITY = 1;

/**
 * Removes any pre-existing 3D tree overlay canvases from `host`. Each map runs
 * inside a fresh Phaser.Game mounted on the same persistent DOM host, so an
 * overlay canvas left behind by a prior game would stack a second grove on top
 * of the new map's — the reported "trees duplicate on every map". Sweeping the
 * host before appending a new overlay guarantees at most one overlay canvas,
 * regardless of Phaser teardown timing or async model-load races.
 */
export function removeExistingTreeOverlays(host: HTMLElement): void {
  removeOverlayCanvases(host, TREE_OVERLAY_TESTID);
}

/**
 * Removes any pre-existing 3D crate overlay canvases from `host`, for the same
 * reason as {@link removeExistingTreeOverlays}: each map runs inside a fresh
 * Phaser.Game on the same persistent DOM host, so an overlay left behind by a
 * prior game would stack a second set of crates on top of the new map's.
 */
export function removeExistingCrateOverlays(host: HTMLElement): void {
  removeOverlayCanvases(host, CRATE_OVERLAY_TESTID);
}

/**
 * Removes any pre-existing 3D parked-car overlay canvases from `host`, for the
 * same reason as {@link removeExistingTreeOverlays}: each map runs inside a fresh
 * Phaser.Game on the same persistent DOM host, so an overlay left behind by a
 * prior game would stack a second row of cars on top of the new map's.
 */
export function removeExistingCarOverlays(host: HTMLElement): void {
  removeOverlayCanvases(host, CAR_OVERLAY_TESTID);
}

/** Removes every overlay canvas under `host` tagged with the given data-testid. */
function removeOverlayCanvases(host: HTMLElement, testId: string): void {
  const existing = host.querySelectorAll(`[data-testid="${testId}"]`);
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

/** A parked car to place: ground position, screen-space rotation (degrees), and
 * the painted body colour (0xRRGGBB) used to keep the row of cars varied. */
export interface ParkedCarSpot extends Vec2 {
  rotation: number;
  color: number;
}

/**
 * Fixed positions, rotations, and body colours for the parked cars that line the
 * urban road, expressed in world coordinates. The cars sit in the parking lanes
 * flanking the mid-points of each road edge, just off the drivable road. Shared
 * between CampaignScene (renders + collides them) and the Level Editor preview
 * (schematic) so both agree on the layout. Horizontal cars (top/bottom edges)
 * use rotation 0; vertical cars (left/right edges) use rotation 90.
 */
export function computeParkedCarSpots(
  width: number,
  height: number,
  roadInsetX: number,
  roadInsetY: number,
  roadWidth: number,
  roadHeight: number,
): ParkedCarSpot[] {
  return [
    { x: width / 2 - 180, y: roadInsetY - 74, color: 0xc94a3f, rotation: 0 },
    { x: width / 2 + 180, y: roadInsetY - 74, color: 0x4e89d8, rotation: 0 },
    { x: width / 2 - 180, y: roadInsetY + roadHeight + 74, color: 0xd7a53d, rotation: 0 },
    { x: width / 2 + 180, y: roadInsetY + roadHeight + 74, color: 0x8f5fd1, rotation: 0 },
    { x: roadInsetX - 74, y: height / 2 - 180, color: 0x3ca7a2, rotation: 90 },
    { x: roadInsetX - 74, y: height / 2 + 180, color: 0xbb5252, rotation: 90 },
    { x: roadInsetX + roadWidth + 74, y: height / 2 - 180, color: 0x9babb7, rotation: 90 },
    { x: roadInsetX + roadWidth + 74, y: height / 2 + 180, color: 0x50565d, rotation: 90 },
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
 * Eye (position) of the tilted orthographic tree camera for a given Phaser world
 * view, plus the point it looks at. Both are pinned to the *world view centre* —
 * a value the Phaser camera derives independently of any single tank — and never
 * to a player/tank position. That is the whole reason a world-fixed tree scrolls
 * with the ground instead of appearing to travel with player 1: as player 1
 * moves the Phaser camera pans, `view.centerX/centerY` change, and the tree eye +
 * target pan with the *world*, keeping each tree's ground base registered to its
 * fixed map spot (see the world-locking tests in urban-decor.test.ts). Extracted
 * from tree-3d.ts's render() so the production camera math is directly testable
 * without a WebGL context.
 */
export function treeCameraEye(
  view: TreeViewRect,
  cameraHeight: number,
  tilt: number = TREE_CAMERA_TILT,
): { eye: Vec2AndHeight; target: Vec2AndHeight } {
  return {
    // Eye above the view centre, nudged toward +Z (down-screen) by the tilt so
    // canopies lean up-screen while trunk bases stay pinned to their map spots.
    eye: {
      x: view.centerX,
      height: cameraHeight * Math.cos(tilt),
      z: view.centerY + cameraHeight * Math.sin(tilt),
    },
    // Looks straight at the view centre on the ground plane (height 0).
    target: { x: view.centerX, height: 0, z: view.centerY },
  };
}

// A three.js world-space point on the tree camera's XZ ground plane: `x` maps to
// screen X, `z` maps to screen Y (Phaser's downward Y), `height` is elevation.
export interface Vec2AndHeight {
  x: number;
  height: number;
  z: number;
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

// Authored proportions (in model units) of the tree model's lowest canopy tier,
// mirrored from scripts/generate-tree-model.mjs. Kept here so the trunk-exposure
// geometry can be reasoned about / unit-tested without loading the .obj.
export const TREE_CANOPY_BASE_HEIGHT = 2.2;
export const TREE_CANOPY_BASE_RADIUS = 0.95;

/**
 * How far the trunk base peeks out below the leaned lower edge of the canopy,
 * in model units, under the tilted tree camera. The canopy base ring sits at
 * `canopyBaseHeight` and leans up-screen by `canopyBaseHeight * sin(tilt)`,
 * while its lower rim still reaches `canopyBaseRadius` down-screen of the trunk;
 * a positive result means the trunk is visible (not fully overhung). Used only
 * for reasoning/tests about trunk visibility; the actual projection is done by
 * three.js.
 */
export function trunkExposureBelowCanopy(
  canopyBaseHeight: number = TREE_CANOPY_BASE_HEIGHT,
  canopyBaseRadius: number = TREE_CANOPY_BASE_RADIUS,
  tilt: number = TREE_CAMERA_TILT,
): number {
  return canopyBaseHeight * Math.sin(tilt) - canopyBaseRadius;
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

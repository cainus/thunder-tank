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

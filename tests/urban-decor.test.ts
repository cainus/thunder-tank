import { describe, expect, it } from "vitest";
import {
  CRATE_OVERLAY_TESTID,
  CRATE_WORLD_SCALE,
  TREE_CAMERA_TILT,
  TREE_OVERLAY_TESTID,
  TREE_SCALE_VARIATION,
  computeUrbanTreeSpots,
  occluderClipTransform,
  removeExistingCrateOverlays,
  removeExistingTreeOverlays,
  treeHeightScreenOffset,
  treeOrthoFrustum,
  treeScaleFactor,
} from "../src/game/urban-decor";

describe("computeUrbanTreeSpots", () => {
  const width = 2400;
  const height = 1800;
  const roadInsetX = Math.round(width * 0.2);
  const roadInsetY = Math.round(height * 0.2);
  const spots = computeUrbanTreeSpots(width, height, roadInsetX, roadInsetY);

  it("places eight trees", () => {
    expect(spots).toHaveLength(8);
  });

  it("keeps every tree inside the map bounds", () => {
    for (const spot of spots) {
      expect(spot.x).toBeGreaterThan(0);
      expect(spot.x).toBeLessThan(width);
      expect(spot.y).toBeGreaterThan(0);
      expect(spot.y).toBeLessThan(height);
    }
  });

  it("keeps the corner trees off the drivable road inset", () => {
    // The first four spots are the corner trees; they must sit within the
    // decorative border, not on the road itself.
    for (const corner of spots.slice(0, 4)) {
      const onRoad =
        corner.x > roadInsetX &&
        corner.x < width - roadInsetX &&
        corner.y > roadInsetY &&
        corner.y < height - roadInsetY;
      expect(onRoad).toBe(false);
    }
  });

  it("is symmetric about the map centre", () => {
    const centreColumn = spots.filter((spot) => Math.abs(spot.x - width / 2) < 1);
    expect(centreColumn).toHaveLength(2);
    expect(centreColumn[0].y + centreColumn[1].y).toBeCloseTo(height, 5);
  });
});

describe("treeOrthoFrustum", () => {
  it("maps the ground plane 1:1 horizontally", () => {
    const { halfWidth } = treeOrthoFrustum(1920, 1080);
    expect(halfWidth).toBe(960);
  });

  it("foreshortens the vertical extent by cos(tilt) so bases stay aligned", () => {
    const { halfHeight } = treeOrthoFrustum(1920, 1080);
    expect(halfHeight).toBeCloseTo((1080 * Math.cos(TREE_CAMERA_TILT)) / 2, 5);
    expect(halfHeight).toBeLessThan(540);
  });
});

describe("occluderClipTransform", () => {
  const view = { centerX: 1000, centerY: 800, width: 1920, height: 1080 };

  it("maps the view centre to the clip-space origin", () => {
    const transform = occluderClipTransform(view.centerX, view.centerY, view, 54);
    expect(transform.x).toBeCloseTo(0, 5);
    expect(transform.y).toBeCloseTo(0, 5);
  });

  it("maps the view edges to the clip-space extents", () => {
    const right = occluderClipTransform(view.centerX + view.width / 2, view.centerY, view, 54);
    const top = occluderClipTransform(view.centerX, view.centerY - view.height / 2, view, 54);
    // Clip X grows to +1 at the right edge; clip Y grows to +1 up-screen (world
    // Y decreasing), confirming the vertical flip.
    expect(right.x).toBeCloseTo(1, 5);
    expect(top.y).toBeCloseTo(1, 5);
  });

  it("scales the hole with the world radius relative to the view", () => {
    const transform = occluderClipTransform(view.centerX, view.centerY, view, 54);
    expect(transform.width).toBeCloseTo((2 * 54) / view.width, 5);
    expect(transform.height).toBeCloseTo((2 * 54) / view.height, 5);
  });
});

describe("treeHeightScreenOffset", () => {
  it("returns no offset at ground level", () => {
    expect(treeHeightScreenOffset(0)).toBe(0);
  });

  it("leans taller geometry further up-screen", () => {
    expect(treeHeightScreenOffset(200)).toBeGreaterThan(treeHeightScreenOffset(100));
  });
});

describe("treeScaleFactor", () => {
  const indices = Array.from({ length: 8 }, (_, index) => index);

  it("is deterministic for a given index", () => {
    for (const index of indices) {
      expect(treeScaleFactor(index)).toBe(treeScaleFactor(index));
    }
  });

  it("stays within [1 - variation, 1 + variation]", () => {
    for (const index of indices) {
      const factor = treeScaleFactor(index);
      expect(factor).toBeGreaterThanOrEqual(1 - TREE_SCALE_VARIATION);
      expect(factor).toBeLessThanOrEqual(1 + TREE_SCALE_VARIATION);
    }
  });

  it("actually varies tree sizes (not all the same)", () => {
    const factors = indices.map(treeScaleFactor);
    const unique = new Set(factors.map((factor) => factor.toFixed(6)));
    expect(unique.size).toBeGreaterThan(1);
    // The spread should be visibly wide, not a token nudge.
    expect(Math.max(...factors) - Math.min(...factors)).toBeGreaterThan(0.2);
  });
});

describe("removeExistingTreeOverlays", () => {
  function makeOverlayCanvas(): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("data-testid", TREE_OVERLAY_TESTID);
    return canvas;
  }

  it("removes a stray overlay canvas left by a prior game", () => {
    const host = document.createElement("div");
    host.appendChild(makeOverlayCanvas());
    host.appendChild(makeOverlayCanvas());

    removeExistingTreeOverlays(host);

    expect(host.querySelectorAll(`[data-testid="${TREE_OVERLAY_TESTID}"]`)).toHaveLength(0);
  });

  it("leaves non-overlay children (e.g. the Phaser canvas) untouched", () => {
    const host = document.createElement("div");
    const gameCanvas = document.createElement("canvas");
    host.appendChild(gameCanvas);
    host.appendChild(makeOverlayCanvas());

    removeExistingTreeOverlays(host);

    expect(host.contains(gameCanvas)).toBe(true);
    expect(host.querySelectorAll(`[data-testid="${TREE_OVERLAY_TESTID}"]`)).toHaveLength(0);
  });
});

describe("removeExistingCrateOverlays", () => {
  function makeCrateOverlayCanvas(): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("data-testid", CRATE_OVERLAY_TESTID);
    return canvas;
  }

  it("uses a distinct testid from the tree overlay", () => {
    expect(CRATE_OVERLAY_TESTID).not.toBe(TREE_OVERLAY_TESTID);
  });

  it("removes a stray crate overlay canvas left by a prior game", () => {
    const host = document.createElement("div");
    host.appendChild(makeCrateOverlayCanvas());
    host.appendChild(makeCrateOverlayCanvas());

    removeExistingCrateOverlays(host);

    expect(host.querySelectorAll(`[data-testid="${CRATE_OVERLAY_TESTID}"]`)).toHaveLength(0);
  });

  it("leaves the tree overlay and non-overlay children untouched", () => {
    const host = document.createElement("div");
    const gameCanvas = document.createElement("canvas");
    const treeOverlay = document.createElement("canvas");
    treeOverlay.setAttribute("data-testid", TREE_OVERLAY_TESTID);
    host.appendChild(gameCanvas);
    host.appendChild(treeOverlay);
    host.appendChild(makeCrateOverlayCanvas());

    removeExistingCrateOverlays(host);

    expect(host.contains(gameCanvas)).toBe(true);
    expect(host.contains(treeOverlay)).toBe(true);
    expect(host.querySelectorAll(`[data-testid="${CRATE_OVERLAY_TESTID}"]`)).toHaveLength(0);
  });
});

describe("CRATE_WORLD_SCALE", () => {
  it("scales the 1-unit crate model to roughly the flat sprite's in-scene size", () => {
    // 56px crateMetal sprite scaled 1.25 in-scene ≈ 70px; the model is authored
    // with a 1-unit footprint, so the world scale should land near that size.
    expect(CRATE_WORLD_SCALE).toBeGreaterThan(40);
    expect(CRATE_WORLD_SCALE).toBeLessThan(120);
  });
});

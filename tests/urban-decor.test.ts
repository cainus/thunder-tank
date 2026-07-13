import { describe, expect, it } from "vitest";
import {
  CRATE_OVERLAY_TESTID,
  CRATE_WORLD_SCALE,
  TREE_CAMERA_TILT,
  TREE_CANOPY_BASE_HEIGHT,
  TREE_CANOPY_BASE_RADIUS,
  TREE_OVERLAY_TESTID,
  TREE_SCALE_VARIATION,
  computeUrbanTreeSpots,
  occluderClipTransform,
  removeExistingCrateOverlays,
  removeExistingTreeOverlays,
  treeCameraEye,
  treeHeightScreenOffset,
  treeOrthoFrustum,
  treeScaleFactor,
  trunkExposureBelowCanopy,
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

describe("treeCameraEye", () => {
  const cameraHeight = 4000;

  it("anchors the eye and look-at target to the world view centre, not any player", () => {
    const view = { centerX: 1000, centerY: 800, width: 1920, height: 1080 };
    const { eye, target } = treeCameraEye(view, cameraHeight, TREE_CAMERA_TILT);

    // The eye tracks the view centre horizontally/in depth (offset only by the
    // fixed tilt lean) and the look-at target sits exactly on the ground plane
    // under the view centre. Nothing here depends on a tank/player position.
    expect(eye.x).toBe(view.centerX);
    expect(eye.z).toBeCloseTo(view.centerY + cameraHeight * Math.sin(TREE_CAMERA_TILT), 5);
    expect(eye.height).toBeCloseTo(cameraHeight * Math.cos(TREE_CAMERA_TILT), 5);
    expect(target).toEqual({ x: view.centerX, height: 0, z: view.centerY });
  });

  it("pans the eye and target by exactly the camera's world movement", () => {
    // As player 1 drives and the Phaser camera follows, only view.centerX/Y move.
    // The eye + target must translate by the same delta so the whole overlay
    // pans with the world (never lagging behind or drifting toward the player).
    const before = treeCameraEye(
      { centerX: 1000, centerY: 800, width: 1920, height: 1080 },
      cameraHeight,
      TREE_CAMERA_TILT,
    );
    const after = treeCameraEye(
      { centerX: 1200, centerY: 900, width: 1920, height: 1080 },
      cameraHeight,
      TREE_CAMERA_TILT,
    );

    expect(after.eye.x - before.eye.x).toBeCloseTo(200, 5);
    expect(after.eye.z - before.eye.z).toBeCloseTo(100, 5);
    expect(after.target.x - before.target.x).toBeCloseTo(200, 5);
    expect(after.target.z - before.target.z).toBeCloseTo(100, 5);
  });
});

describe("trees stay world-locked as the camera follows player 1", () => {
  // Regression evidence for the "trees seem to all move with player 1" symptom.
  // The overlay places each tree at a fixed world position and drives its camera
  // purely from the Phaser world view (treeCameraEye), so a tree's ground base
  // maps to screen via the same linear world->clip transform the eraser holes
  // use (occluderClipTransform). If the overlay were instead pinned to player 1,
  // a world-fixed tree would hold a constant screen position as player 1 moved.
  const width = 1920;
  const height = 1080;
  const tree = { x: 500, y: 400 };

  // Player 1 (and thus the followed camera centre) moves right + down between
  // two frames; the visible world rectangle is otherwise unchanged.
  const player1Before = { x: 1000, y: 800 };
  const player1After = { x: 1200, y: 900 };
  const viewBefore = { centerX: player1Before.x, centerY: player1Before.y, width, height };
  const viewAfter = { centerX: player1After.x, centerY: player1After.y, width, height };

  it("moves the tree on screen when player 1 moves (not pinned to the player)", () => {
    const clipBefore = occluderClipTransform(tree.x, tree.y, viewBefore);
    const clipAfter = occluderClipTransform(tree.x, tree.y, viewAfter);

    // A world-fixed tree must shift on screen; a player-pinned tree would not.
    expect(clipAfter.x).not.toBeCloseTo(clipBefore.x, 5);
    expect(clipAfter.y).not.toBeCloseTo(clipBefore.y, 5);
  });

  it("scrolls the tree opposite to the camera, exactly like the ground", () => {
    const clipBefore = occluderClipTransform(tree.x, tree.y, viewBefore);
    const clipAfter = occluderClipTransform(tree.x, tree.y, viewAfter);

    // The camera moved +200 world-x, so the tree slides -200 world-x on screen
    // (2 * -200 / width in clip units) and likewise for y — pure world scroll.
    expect(clipAfter.x - clipBefore.x).toBeCloseTo((2 * -200) / width, 5);
    expect(clipAfter.y - clipBefore.y).toBeCloseTo((-2 * -100) / height, 5);

    // Any other ground landmark (e.g. the road centre line) scrolls by the same
    // clip delta, confirming the tree tracks the map rather than the player.
    const landmark = { x: 960, y: 540 };
    const landmarkBefore = occluderClipTransform(landmark.x, landmark.y, viewBefore);
    const landmarkAfter = occluderClipTransform(landmark.x, landmark.y, viewAfter);
    expect(clipAfter.x - clipBefore.x).toBeCloseTo(landmarkAfter.x - landmarkBefore.x, 5);
    expect(clipAfter.y - clipBefore.y).toBeCloseTo(landmarkAfter.y - landmarkBefore.y, 5);
  });

  it("would keep a player-pinned decoration fixed on screen (contrast case)", () => {
    // A decoration locked to player 1 sits at the view centre every frame, so it
    // maps to the clip origin regardless of camera movement — the exact drift the
    // bug report described. The tree above demonstrably does NOT behave this way.
    const pinnedBefore = occluderClipTransform(player1Before.x, player1Before.y, viewBefore);
    const pinnedAfter = occluderClipTransform(player1After.x, player1After.y, viewAfter);
    expect(pinnedBefore.x).toBeCloseTo(0, 5);
    expect(pinnedBefore.y).toBeCloseTo(0, 5);
    expect(pinnedAfter.x).toBeCloseTo(0, 5);
    expect(pinnedAfter.y).toBeCloseTo(0, 5);
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

describe("trunkExposureBelowCanopy", () => {
  it("exposes the trunk under the current oblique camera tilt", () => {
    // Regression guard for the "trees have no trunks" defect: at the shipped
    // tilt + canopy proportions the trunk must peek out below the leaned canopy.
    expect(trunkExposureBelowCanopy()).toBeGreaterThan(0);
  });

  it("hides the trunk at the old near-top-down tilt", () => {
    // The pre-fix ~24° tilt could not clear the canopy over the trunk base, no
    // matter the canopy size, which is what rendered trees as bare blobs.
    const oldTilt = (24 * Math.PI) / 180;
    expect(
      trunkExposureBelowCanopy(TREE_CANOPY_BASE_HEIGHT, TREE_CANOPY_BASE_RADIUS, oldTilt),
    ).toBeLessThan(0);
  });

  it("exposes more trunk as the camera tilts further from top-down", () => {
    const shallow = trunkExposureBelowCanopy(TREE_CANOPY_BASE_HEIGHT, TREE_CANOPY_BASE_RADIUS, 0.6);
    const steep = trunkExposureBelowCanopy(TREE_CANOPY_BASE_HEIGHT, TREE_CANOPY_BASE_RADIUS, 0.9);
    expect(steep).toBeGreaterThan(shallow);
  });

  it("uses a tilt oblique enough to reveal the trunk", () => {
    expect(TREE_CAMERA_TILT).toBeGreaterThan((30 * Math.PI) / 180);
  });
});

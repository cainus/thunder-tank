import { describe, expect, it } from "vitest";
import {
  TREE_CAMERA_TILT,
  computeUrbanTreeSpots,
  occluderClipTransform,
  treeHeightScreenOffset,
  treeOrthoFrustum,
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

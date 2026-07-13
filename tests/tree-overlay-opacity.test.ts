// Standing detection for TT-23: "trees are semi-transparent".
//
// The 3D tree overlay (src/game/tree-3d.ts) is a stacked WebGL canvas composited
// on top of the Phaser game canvas. The ENTIRE canvas is given a CSS opacity of
// `TREE_OVERLAY_OPACITY` (currently 0.72), so every tree — trunk and canopy —
// renders at 72% opacity and the road/ground shows straight through the trunks.
// That whole-canvas wash is the reported "semi-transparent trees" defect.
//
// The sibling crate overlay (src/game/crate-3d.ts) makes the intended contrast
// explicit: crates are "opaque, real obstacles (unlike the translucent tree
// dressing), so the overlay renders at full opacity" — CRATE_OVERLAY_OPACITY = 1.
// Trees that read as solid objects must composite the same way. The tree
// overlay's own comment even claims the value "mirrors URBAN_DECOR_ALPHA", but
// 0.72 mirrors neither URBAN_DECOR_ALPHA (0.45) nor the crate policy (1) — a
// two-sources-of-truth drift over "how solid does a tree look".
//
// TreeOverlay3D cannot be instantiated under jsdom (THREE.WebGLRenderer needs a
// real WebGL context), so — like tree-3d-imports.test.ts — this pulls the defect
// forward by reading the module's OWN source and asserting the compositing
// opacity it applies to the overlay canvas is fully opaque. It fails while the
// value is 0.72, and will keep the fix honest once someone raises it to 1.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const treeModulePath = resolve(process.cwd(), "src/game/tree-3d.ts");
const crateModulePath = resolve(process.cwd(), "src/game/crate-3d.ts");

/** Extracts the numeric literal assigned to a `const NAME = <number>;` in `source`. */
function readOverlayOpacity(source: string, name: string): number {
  const match = new RegExp(`\\b${name}\\s*=\\s*(-?\\d+(?:\\.\\d+)?)`).exec(source);
  if (!match) {
    throw new Error(`could not find a numeric ${name} in the source`);
  }
  return Number(match[1]);
}

describe("3D tree overlay compositing opacity (TT-23)", () => {
  const treeSource = readFileSync(treeModulePath, "utf8");

  it("applies TREE_OVERLAY_OPACITY to the overlay canvas (guards the extractor)", () => {
    // If this stops matching, the assertion below is checking a dead constant.
    expect(treeSource).toMatch(/opacity:\s*String\(TREE_OVERLAY_OPACITY\)/);
  });

  it("composites the tree canopy fully opaque, not as translucent dressing", () => {
    const treeOpacity = readOverlayOpacity(treeSource, "TREE_OVERLAY_OPACITY");
    // Trees are meant to read as solid objects, so the whole-canvas wash must be
    // fully opaque. This fails at the reported 0.72 (road visible through trunks).
    expect(treeOpacity).toBe(1);
  });

  it("matches the opaque-obstacle policy the sibling crate overlay already uses", () => {
    const crateOpacity = readOverlayOpacity(readFileSync(crateModulePath, "utf8"), "CRATE_OVERLAY_OPACITY");
    const treeOpacity = readOverlayOpacity(treeSource, "TREE_OVERLAY_OPACITY");
    // The crate overlay is the canonical "opaque real obstacle" 3D overlay; the
    // tree overlay drifting below it is exactly the semi-transparency defect.
    expect(treeOpacity).toBeGreaterThanOrEqual(crateOpacity);
  });
});

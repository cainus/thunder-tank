// Regression guard for TT-23: "trees are semi-transparent".
//
// The 3D tree overlay (src/game/tree-3d.ts) is a stacked WebGL canvas composited
// on top of the Phaser game canvas. The ENTIRE canvas is given a CSS opacity of
// `TREE_OVERLAY_OPACITY`, which used to be 0.72, so every tree — trunk and canopy
// — rendered at 72% opacity and the road/ground showed straight through the
// trunks. That whole-canvas wash was the reported "semi-transparent trees"
// defect. The flat-sprite fallback (CampaignScene.addFlatTrees, used when WebGL
// is unavailable) was worse still, drawing at URBAN_DECOR_ALPHA = 0.45.
//
// Trees are solid objects and must composite the same way the sibling crate
// overlay already does: "opaque, real obstacles ... full opacity". To stop the
// two overlays drifting apart again, the opaque-obstacle opacity is now a single
// shared constant, OPAQUE_OVERLAY_OPACITY, in urban-decor.ts, consumed by both
// the tree and crate overlays (and the flat-sprite fallback trees).
//
// The overlay classes cannot be instantiated under jsdom (THREE.WebGLRenderer
// needs a real WebGL context), so — like tree-3d-imports.test.ts — this pulls the
// behaviour forward by reading the modules' OWN source and asserting the
// compositing opacity they apply is fully opaque and sourced from one owner.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { OPAQUE_OVERLAY_OPACITY } from "../src/game/urban-decor";

const treeModulePath = resolve(process.cwd(), "src/game/tree-3d.ts");
const crateModulePath = resolve(process.cwd(), "src/game/crate-3d.ts");
const decorModulePath = resolve(process.cwd(), "src/game/urban-decor.ts");
const scenePath = resolve(process.cwd(), "src/game/CampaignScene.ts");

/** Extracts the numeric literal assigned to a `const NAME = <number>;` in `source`. */
function readNumericConst(source: string, name: string): number {
  const match = new RegExp(`\\b${name}\\s*=\\s*(-?\\d+(?:\\.\\d+)?)`).exec(source);
  if (!match) {
    throw new Error(`could not find a numeric ${name} in the source`);
  }
  return Number(match[1]);
}

describe("opaque 3D obstacle compositing opacity (TT-23)", () => {
  const treeSource = readFileSync(treeModulePath, "utf8");
  const crateSource = readFileSync(crateModulePath, "utf8");
  const decorSource = readFileSync(decorModulePath, "utf8");
  const sceneSource = readFileSync(scenePath, "utf8");

  it("owns the opaque-obstacle opacity in one place, fully opaque", () => {
    // Trees and crates are solid objects, so the shared owner is fully opaque.
    expect(readNumericConst(decorSource, "OPAQUE_OVERLAY_OPACITY")).toBe(1);
    expect(OPAQUE_OVERLAY_OPACITY).toBe(1);
  });

  it("composites the tree overlay canvas from the shared opaque constant", () => {
    // The whole-canvas wash must be the shared opaque value, not a translucent
    // literal (0.72 let the road show through the trunks — the reported defect).
    expect(treeSource).toMatch(/opacity:\s*String\(TREE_OVERLAY_OPACITY\)/);
    expect(treeSource).toMatch(/TREE_OVERLAY_OPACITY\s*=\s*OPAQUE_OVERLAY_OPACITY/);
    expect(treeSource).toMatch(/OPAQUE_OVERLAY_OPACITY[\s\S]*from "\.\/urban-decor"/);
  });

  it("composites the crate overlay canvas from the same shared constant", () => {
    // The crate overlay is the canonical opaque 3D overlay; both now share one
    // owner so the tree overlay can never drift below it again.
    expect(crateSource).toMatch(/opacity:\s*String\(CRATE_OVERLAY_OPACITY\)/);
    expect(crateSource).toMatch(/CRATE_OVERLAY_OPACITY\s*=\s*OPAQUE_OVERLAY_OPACITY/);
  });

  it("draws the flat-sprite fallback trees opaque, not as subdued dressing", () => {
    // The no-WebGL fallback (addFlatTrees) previously drew trees at
    // URBAN_DECOR_ALPHA (0.45) — even more transparent than the 3D overlay.
    expect(sceneSource).toMatch(/"treeGreenLarge"[\s\S]*?\.setAlpha\(OPAQUE_OVERLAY_OPACITY\)/);
  });
});

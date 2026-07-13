// STANDING RED SPEC for TT-22: "3D items must clear every map; tanks are not
// clearing."
//
// Every map runs inside a fresh Phaser.Game mounted on the same persistent DOM
// host (see GameCanvas.tsx: the effect re-creates the game on mapIndex change).
// A 3D overlay canvas orphaned by a prior game's teardown — or by an async
// model-load race — would otherwise stack a second set of 3D items on top of the
// new map's. The tree overlay defends against this by SWEEPING the host for any
// pre-existing overlay canvas before appending its own (tree-3d.ts calls
// removeExistingTreeOverlays(host) right before host.appendChild). See
// urban-decor.ts + urban-decor.test.ts for that canonical, tested policy.
//
// The tank overlay (tank-3d.ts, added later for TT-17) copied the overlay
// pattern but DROPPED that sweep: its constructor appends its canvas to the host
// with no dedup pass and no removeExisting* helper. That is the bug — stale 3D
// tank canvases accumulate across maps ("the tanks are not clearing").
//
// This test reads the actual source (the same source-of-truth technique used by
// tank-3d-imports.test.ts / tree-3d-imports.test.ts) and asserts BOTH overlays
// obey the same clear-before-append policy. The tree assertion passes and proves
// the check is correct; the tank assertion FAILS until the tank overlay gains the
// missing sweep. Do NOT "fix" this by weakening the check — fix the overlay.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const treeSource = readFileSync(resolve(process.cwd(), "src/game/tree-3d.ts"), "utf8");
const tankSource = readFileSync(resolve(process.cwd(), "src/game/tank-3d.ts"), "utf8");

/**
 * Whether an overlay module clears prior overlay canvases off the shared host
 * BEFORE appending its own — the invariant that keeps 3D items from stacking up
 * map-to-map. Accepts either a dedicated `removeExisting*Overlays(host)` helper
 * (the tree overlay's approach) or an inline querySelectorAll(...).remove()
 * sweep, as long as it runs before the host.appendChild.
 */
function clearsHostBeforeAppend(source: string): boolean {
  const appendIndex = source.indexOf("host.appendChild");
  if (appendIndex < 0) {
    return false;
  }
  const beforeAppend = source.slice(0, appendIndex);
  const callsRemoveHelper = /removeExisting\w*Overlays\s*\(\s*host\s*\)/.test(beforeAppend);
  const inlineSweep = /host\.querySelectorAll\([\s\S]*?\)[\s\S]*?\.remove\(\)/.test(beforeAppend);
  return callsRemoveHelper || inlineSweep;
}

describe("3D overlays clear the shared host before appending (no stacking across maps)", () => {
  it("tree overlay sweeps prior overlays before appending (canonical reference)", () => {
    // Guards the test logic itself: the tree overlay is the known-good pattern.
    expect(clearsHostBeforeAppend(treeSource)).toBe(true);
  });

  it("tank overlay sweeps prior overlays before appending, so 3D tanks clear every map", () => {
    // FAILS today: tank-3d.ts appends its canvas with no dedup sweep, so tank
    // overlay canvases accumulate as the player advances through maps (TT-22).
    expect(clearsHostBeforeAppend(tankSource)).toBe(true);
  });
});

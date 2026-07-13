// Regression spec for TT-27: "3D crates not clearing at the end of a map"
// (a TT-22 regression).
//
// Every map runs inside a fresh Phaser.Game mounted on the same persistent DOM
// host (GameCanvas.tsx re-creates the game on mapIndex change). A CrateOverlay3D
// only sweeps prior crate canvases from that host when it is CONSTRUCTED, which
// happens solely on maps that actually place crates. So advancing from a
// crate-bearing map to a crateless one built no overlay, never swept, and left
// the previous map's 3D crates floating on the new map. (Tanks never showed this
// because every map builds a tank overlay — see the TT-22 tank sweep.)
//
// CampaignScene.addCrateOverlays now sweeps the shared host for orphaned crate
// canvases unconditionally, before its no-crates early return. This exercises
// that exact path: a scene whose map has no crate obstacles must still clear a
// stray crate overlay canvas left on the host by the prior game.
import { describe, expect, it, vi } from "vitest";

// The full Phaser build can't load under jsdom (its WebGL renderer requires an
// optional native dep), and CampaignScene only needs Phaser for its `extends
// Phaser.Scene` base at module-eval time. The crateless sweep path under test
// touches no Phaser API, so a bare Scene base class is enough to import it.
vi.mock("phaser", () => ({ default: { Scene: class Scene {} } }));

import { CampaignScene } from "../src/game/CampaignScene";
import { CRATE_OVERLAY_TESTID } from "../src/game/urban-decor";

const CRATE_SELECTOR = `[data-testid="${CRATE_OVERLAY_TESTID}"]`;

const addCrateOverlays = (
  CampaignScene.prototype as unknown as { addCrateOverlays: (this: unknown) => void }
).addCrateOverlays;

// Minimal stand-in for the parts of the scene addCrateOverlays reads before it
// returns on a crateless map: the map's obstacle list and the Phaser game canvas
// whose parent is the shared overlay host.
function fakeScene(host: HTMLElement, obstacles: unknown[]) {
  return {
    map: { obstacles },
    game: { canvas: { parentElement: host } },
  };
}

function makeCrateOverlayCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("data-testid", CRATE_OVERLAY_TESTID);
  return canvas;
}

describe("CampaignScene.addCrateOverlays clears stale crate overlays (TT-27)", () => {
  it("sweeps a crate canvas left by a prior game even when the new map has no crates", () => {
    const host = document.createElement("div");
    // The previous (crate-bearing) game's overlay canvas is still attached when
    // the next, crateless map's scene is created.
    host.appendChild(makeCrateOverlayCanvas());

    addCrateOverlays.call(fakeScene(host, []));

    expect(host.querySelectorAll(CRATE_SELECTOR)).toHaveLength(0);
  });

  it("leaves the Phaser game canvas on the host while sweeping crate overlays", () => {
    const host = document.createElement("div");
    const gameCanvas = document.createElement("canvas");
    host.appendChild(gameCanvas);
    host.appendChild(makeCrateOverlayCanvas());

    addCrateOverlays.call(fakeScene(host, []));

    expect(host.contains(gameCanvas)).toBe(true);
    expect(host.querySelectorAll(CRATE_SELECTOR)).toHaveLength(0);
  });
});

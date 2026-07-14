// Regression spec for TT-27: "3D crates not clearing at the end of a map"
// (a TT-22 regression), re-expressed after TT-29 unified the overlays.
//
// Every map runs inside a fresh Phaser.Game mounted on the same persistent DOM
// host (GameCanvas.tsx re-creates the game on mapIndex change). Before TT-29 each
// obstacle kind owned its own overlay canvas, swept only when THAT overlay was
// constructed; a crateless map built no crate overlay, never swept, and left the
// previous map's 3D crates floating on the new map.
//
// TT-29 collapsed trees, crates, cars, and tanks into ONE world overlay canvas
// built by the Overlay3D compositor. Every WebGL map builds that compositor for
// its tanks, and the compositor sweeps the shared host on construction — so a
// crateless map now clears any 3D decor (crates included) left by the prior map
// as a matter of course. This exercises that invariant: constructing a fresh
// compositor on a host still holding a prior game's overlay canvas must leave
// exactly one overlay canvas, regardless of whether the new map has crates.
import { afterEach, describe, expect, it, vi } from "vitest";

// jsdom cannot create a WebGL context, so stub three's renderer with one whose
// domElement is a real <canvas> — same shim tank-overlay-clear.test.ts uses.
vi.mock("three", async () => {
  const actual = await vi.importActual<typeof import("three")>("three");
  class FakeWebGLRenderer {
    readonly domElement = document.createElement("canvas");
    setClearColor(): void {}
    setPixelRatio(): void {}
    setSize(): void {}
    render(): void {}
    dispose(): void {}
  }
  return { ...actual, WebGLRenderer: FakeWebGLRenderer };
});

import { Overlay3D } from "../src/game/overlay-3d";
import { WORLD_OVERLAY_TESTID } from "../src/game/urban-decor";

const OVERLAY_SELECTOR = `[data-testid="${WORLD_OVERLAY_TESTID}"]`;

function makeWorldOverlayCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("data-testid", WORLD_OVERLAY_TESTID);
  return canvas;
}

describe("Overlay3D clears stale 3D decor on the next map (TT-27)", () => {
  const overlays: Overlay3D[] = [];

  afterEach(() => {
    while (overlays.length > 0) {
      overlays.pop()!.dispose();
    }
  });

  it("sweeps a prior game's overlay canvas even when the new map has no crates", () => {
    const host = document.createElement("div");
    // The previous (crate-bearing) game's overlay canvas is still attached when
    // the next, crateless map's compositor is built for its tanks.
    host.appendChild(makeWorldOverlayCanvas());

    const overlay = new Overlay3D(host);
    overlays.push(overlay);

    expect(host.querySelectorAll(OVERLAY_SELECTOR)).toHaveLength(1);
  });

  it("leaves the Phaser game canvas on the host while sweeping the stale overlay", () => {
    const host = document.createElement("div");
    const gameCanvas = document.createElement("canvas");
    host.appendChild(gameCanvas);
    host.appendChild(makeWorldOverlayCanvas());

    const overlay = new Overlay3D(host);
    overlays.push(overlay);

    expect(host.contains(gameCanvas)).toBe(true);
    expect(host.querySelectorAll(OVERLAY_SELECTOR)).toHaveLength(1);
  });
});

// Behavioral spec for TT-28: "the RESPAWN counter is under the 3d elements".
//
// EXPECTED: the full-screen "RESPAWN\nN" countdown is a HUD message and must read
// ON TOP of everything — including the 3D tank/tree/crate/car overlays — the way
// the DOM `.hud` (styles.css, z-index 5) sits above the tank overlay (z-index 1).
//
// ACTUAL: the countdown is authored as a Phaser Text drawn on the base game
// canvas (CampaignScene.create(): `this.add.text(...).setDepth(100)`). Phaser's
// `setDepth` only orders objects WITHIN the single game-canvas display list; it
// cannot cross the DOM boundary to the sibling WebGL overlay canvases. Those
// overlays are appended to the same host and composited ABOVE the base game
// canvas (tank-3d.ts pins its canvas at z-index "1"; crate-3d.ts's own header
// notes it is "a separate stacked canvas above every Phaser sprite"). So the 3D
// elements paint over the RESPAWN countdown.
//
// ROOT CAUSE — two sources of truth for stacking:
//   * Phaser depth  → orders sprites inside the base game canvas (RESPAWN = 100)
//   * CSS z-index   → orders the sibling DOM canvases + the DOM HUD (tank = 1,
//                     hud = 5)
// The countdown was placed in the Phaser-depth system, where depth 100 looks
// like "top of everything" but is actually pinned to the base canvas layer
// (z-index auto/0), below the 3D overlays. The canonical owner of cross-canvas
// stacking is the CSS z-index stack; a top-of-screen HUD message must live in a
// layer above the overlays, not baked into the base canvas.
//
// This test reconstructs the real DOM stack GameCanvas + the overlays build and
// asserts the layer carrying the RESPAWN countdown paints above the 3D tank
// overlay. It fails while the countdown is baked into the base game canvas —
// which is exactly the defect. It is the standing red spec for the fix and is
// intentionally NOT satisfied yet.
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

import { TankOverlay3D, TANK_OVERLAY_TESTID } from "../src/game/tank-3d";

// Numeric CSS z-index of an element, treating the `auto`/unset default as 0
// (the base game canvas that carries the RESPAWN countdown sets no z-index).
function zIndexOf(el: HTMLElement): number {
  const raw = el.style.zIndex || "0";
  const value = Number.parseInt(raw, 10);
  return Number.isNaN(value) ? 0 : value;
}

// True when `a` paints above `b` as CSS compositing siblings: higher z-index
// wins; on a tie, the later sibling in DOM order wins.
function paintsAbove(a: HTMLElement, b: HTMLElement): boolean {
  const za = zIndexOf(a);
  const zb = zIndexOf(b);
  if (za !== zb) {
    return za > zb;
  }
  const order = a.compareDocumentPosition(b);
  return (order & Node.DOCUMENT_POSITION_PRECEDING) !== 0;
}

describe("RESPAWN countdown reads above the 3D overlays (TT-28)", () => {
  const overlays: TankOverlay3D[] = [];

  afterEach(() => {
    while (overlays.length > 0) {
      overlays.pop()!.dispose();
    }
  });

  it("paints the RESPAWN countdown layer above the 3D tank overlay canvas", () => {
    // The DOM stack GameCanvas.tsx builds: Phaser mounts its game canvas into the
    // host as the first child; the RESPAWN countdown Text is drawn onto THIS
    // canvas (CampaignScene: `this.add.text(...).setDepth(100)`), so the base
    // game canvas IS the countdown's paint layer.
    const host = document.createElement("div");
    const respawnCountdownLayer = document.createElement("canvas");
    respawnCountdownLayer.setAttribute("data-testid", "game-canvas");
    host.appendChild(respawnCountdownLayer);

    // Then the 3D tank overlay mounts its own canvas on the same host (real code,
    // so the z-index under test is sourced from tank-3d.ts, not fabricated).
    const overlay = new TankOverlay3D(host);
    overlays.push(overlay);
    const tankOverlayCanvas = host.querySelector<HTMLCanvasElement>(
      `[data-testid="${TANK_OVERLAY_TESTID}"]`,
    );
    expect(tankOverlayCanvas).not.toBeNull();

    // The countdown is a HUD message; it must read on top of the 3D tanks.
    expect(paintsAbove(respawnCountdownLayer, tankOverlayCanvas!)).toBe(true);
  });
});

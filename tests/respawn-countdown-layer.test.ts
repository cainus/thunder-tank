// Behavioral spec for TT-28: "the RESPAWN counter is under the 3d elements".
//
// EXPECTED: the full-screen "RESPAWN\nN" countdown is a HUD message and must read
// ON TOP of everything — including the 3D tank/tree/crate/car overlays.
//
// ROOT CAUSE (now fixed) — two sources of truth for stacking:
//   * Phaser depth  → orders sprites inside the base game canvas
//   * CSS z-index   → orders the sibling DOM canvases + the DOM HUD
// The countdown was authored as a Phaser Text at `setDepth(100)` on the base
// game canvas. Phaser depth only orders objects WITHIN that single canvas; it
// cannot cross the DOM boundary to the sibling WebGL overlay canvases, which are
// composited ABOVE the base canvas (tank-3d.ts pins its canvas at z-index 1). So
// the 3D elements painted over the countdown.
//
// THE FIX: the countdown (and the CTF AI role labels) were lifted out of the
// base canvas into a dedicated DOM HUD overlay (game-hud-overlay.ts) that is
// mounted on the same host at a z-index ABOVE every 3D overlay (see the shared
// cross-canvas layer contract in layer-stack.ts). This test reconstructs the
// real DOM stack GameCanvas + the overlays build and asserts the layer carrying
// the RESPAWN countdown paints above the 3D tank overlay.
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
import { GameHudOverlay, GAME_HUD_OVERLAY_TESTID } from "../src/game/game-hud-overlay";

// Numeric CSS z-index of an element, treating the `auto`/unset default as 0
// (the base game canvas that used to carry the RESPAWN countdown sets none).
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
  const tankOverlays: TankOverlay3D[] = [];
  const hudOverlays: GameHudOverlay[] = [];

  afterEach(() => {
    while (tankOverlays.length > 0) {
      tankOverlays.pop()!.dispose();
    }
    while (hudOverlays.length > 0) {
      hudOverlays.pop()!.dispose();
    }
  });

  it("paints the RESPAWN countdown layer above the 3D tank overlay canvas", () => {
    // Reproduce the DOM stack CampaignScene builds on the shared host: the DOM
    // HUD overlay (which now carries the RESPAWN countdown) is mounted first, and
    // the 3D tank overlay canvas is appended after it — real code, so the z-index
    // values under test are sourced from the modules, not fabricated.
    const host = document.createElement("div");

    const hudOverlay = new GameHudOverlay(host);
    hudOverlays.push(hudOverlay);
    const respawnCountdownLayer = host.querySelector<HTMLElement>(
      `[data-testid="${GAME_HUD_OVERLAY_TESTID}"]`,
    );
    expect(respawnCountdownLayer).not.toBeNull();

    const tankOverlay = new TankOverlay3D(host);
    tankOverlays.push(tankOverlay);
    const tankOverlayCanvas = host.querySelector<HTMLCanvasElement>(
      `[data-testid="${TANK_OVERLAY_TESTID}"]`,
    );
    expect(tankOverlayCanvas).not.toBeNull();

    // The countdown is a HUD message; it must read on top of the 3D tanks even
    // though the tank overlay canvas is a later DOM sibling.
    expect(paintsAbove(respawnCountdownLayer!, tankOverlayCanvas!)).toBe(true);
  });
});

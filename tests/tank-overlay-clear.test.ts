// Behavioral spec for TT-22: "3D items must clear every map; tanks are not
// clearing."
//
// Every map runs inside a fresh Phaser.Game mounted on the same persistent DOM
// host (GameCanvas.tsx re-creates the game on mapIndex change). A 3D overlay
// canvas orphaned by a prior game's teardown — or by an async model-load race —
// would otherwise stack a second set of 3D items on top of the new map's. The
// tree overlay defends against this by SWEEPING the host for any pre-existing
// overlay canvas before appending its own (removeExistingTreeOverlays); the tank
// overlay must obey the same clear-before-append policy so 3D tanks clear every
// map.
//
// Rather than matching source text, this mounts two TankOverlay3D instances on
// one shared host (as advancing to a new map does) and asserts the host is left
// holding exactly one tank overlay canvas — the observable invariant that keeps
// 3D tanks from accumulating map-to-map.
import { afterEach, describe, expect, it, vi } from "vitest";

// jsdom cannot create a WebGL context, so stub three's renderer with one whose
// domElement is a real <canvas>. Everything else the overlay touches at
// construction (Scene, OrthographicCamera, lights) is pure JS and left intact.
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

const OVERLAY_SELECTOR = `[data-testid="${TANK_OVERLAY_TESTID}"]`;

describe("TankOverlay3D clears prior tank overlays from the shared host (TT-22)", () => {
  const overlays: TankOverlay3D[] = [];

  function mount(host: HTMLElement): TankOverlay3D {
    const overlay = new TankOverlay3D(host);
    overlays.push(overlay);
    return overlay;
  }

  afterEach(() => {
    while (overlays.length > 0) {
      overlays.pop()!.dispose();
    }
  });

  it("leaves exactly one tank overlay canvas after a second overlay mounts on the same host", () => {
    const host = document.createElement("div");

    // First map's overlay mounts its canvas...
    mount(host);
    // ...then the player advances and a second game mounts its overlay on the
    // same persistent host while the prior canvas is still attached.
    mount(host);

    // Without the sweep the two canvases would both remain (stale 3D tanks
    // stacking up); with it, only the current overlay's canvas is left.
    expect(host.querySelectorAll(OVERLAY_SELECTOR)).toHaveLength(1);
  });

  it("sweeps only tank overlays, leaving the Phaser game canvas on the host", () => {
    const host = document.createElement("div");
    const gameCanvas = document.createElement("canvas");
    host.appendChild(gameCanvas);

    mount(host);
    mount(host);

    expect(host.contains(gameCanvas)).toBe(true);
    expect(host.querySelectorAll(OVERLAY_SELECTOR)).toHaveLength(1);
  });
});

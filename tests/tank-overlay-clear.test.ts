// Behavioral spec for TT-22: "3D items must clear every map; tanks are not
// clearing."
//
// Every map runs inside a fresh Phaser.Game mounted on the same persistent DOM
// host (GameCanvas.tsx re-creates the game on mapIndex change). A 3D overlay
// canvas orphaned by a prior game's teardown — or by an async model-load race —
// would otherwise stack a second set of 3D items on top of the new map's. Since
// TT-29 trees, crates, cars, and tanks share ONE world overlay canvas (see
// overlay-3d.ts), so the compositor SWEEPS the host for any pre-existing overlay
// canvas before appending its own (removeExistingWorldOverlays). Every WebGL map
// builds the compositor for its tanks, so that single sweep clears all stale 3D
// items map-to-map.
//
// Rather than matching source text, this mounts two Overlay3D compositors on one
// shared host (as advancing to a new map does) and asserts the host is left
// holding exactly one overlay canvas — the observable invariant that keeps 3D
// items from accumulating.
import { afterEach, describe, expect, it, vi } from "vitest";

// jsdom cannot create a WebGL context, so stub three's renderer with one whose
// domElement is a real <canvas>. Everything else the compositor touches at
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

import { Overlay3D } from "../src/game/overlay-3d";
import { WORLD_OVERLAY_TESTID } from "../src/game/urban-decor";

const OVERLAY_SELECTOR = `[data-testid="${WORLD_OVERLAY_TESTID}"]`;

describe("Overlay3D clears prior world overlays from the shared host (TT-22)", () => {
  const overlays: Overlay3D[] = [];

  function mount(host: HTMLElement): Overlay3D {
    const overlay = new Overlay3D(host);
    overlays.push(overlay);
    return overlay;
  }

  afterEach(() => {
    while (overlays.length > 0) {
      overlays.pop()!.dispose();
    }
  });

  it("leaves exactly one overlay canvas after a second compositor mounts on the same host", () => {
    const host = document.createElement("div");

    // First map's compositor mounts its canvas...
    mount(host);
    // ...then the player advances and a second game mounts its compositor on the
    // same persistent host while the prior canvas is still attached.
    mount(host);

    // Without the sweep the two canvases would both remain (stale 3D items
    // stacking up); with it, only the current compositor's canvas is left.
    expect(host.querySelectorAll(OVERLAY_SELECTOR)).toHaveLength(1);
  });

  it("sweeps only world overlays, leaving the Phaser game canvas on the host", () => {
    const host = document.createElement("div");
    const gameCanvas = document.createElement("canvas");
    host.appendChild(gameCanvas);

    mount(host);
    mount(host);

    expect(host.contains(gameCanvas)).toBe(true);
    expect(host.querySelectorAll(OVERLAY_SELECTOR)).toHaveLength(1);
  });
});

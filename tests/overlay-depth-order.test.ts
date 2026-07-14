// Regression guard for TT-29: "3D objects render in wrong order; tank behind a
// tree draws on top."
//
// ROOT CAUSE: trees, crates, cars, and tanks each rendered into their OWN stacked
// WebGL canvas. Separate canvases have separate depth buffers, so their depths
// could not be compared — whichever canvas sat higher in the CSS z-index stack
// drew on top regardless of world position. The tank canvas was pinned above the
// obstacle canvases, so a tank behind a tree still painted over it, and each
// obstacle overlay punched a screen-space hole in itself so tanks would show
// through.
//
// THE FIX: every 3D object now lives in ONE THREE.Scene rendered in a single
// depth-tested pass by the Overlay3D compositor (overlay-3d.ts). The shared depth
// buffer sorts trees, crates, cars, and tanks against one another, so a tank
// genuinely behind a tree/crate/car is occluded by it.
//
// A WebGL depth buffer cannot run under jsdom, so this locks in the ARCHITECTURE
// that makes correct depth sorting possible: one compositor owns the sole
// renderer/scene, the four content managers draw into that shared scene rather
// than owning their own renderer, and the old per-canvas hole-punch eraser is
// gone. Two runtime checks (with three's renderer stubbed) confirm the compositor
// exposes a single shared scene the content managers all accept.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// jsdom cannot create a WebGL context, so stub three's renderer with one whose
// domElement is a real <canvas>; the Scene/camera/lights are left intact. The
// source-inspection describe below reads files only and is unaffected.
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

const CONTENT_MODULES = ["tree-3d.ts", "crate-3d.ts", "car-3d.ts", "tank-3d.ts"] as const;

function read(module: string): string {
  return readFileSync(resolve(process.cwd(), "src/game", module), "utf8");
}

describe("all 3D content shares one depth-sorted scene (TT-29)", () => {
  const overlaySource = read("overlay-3d.ts");

  it("the compositor owns exactly one renderer and one scene, drawn in a single pass", () => {
    // One canvas + one scene + one render call is what gives every 3D object a
    // single shared depth buffer to sort against.
    expect(overlaySource.match(/new THREE\.WebGLRenderer/g) ?? []).toHaveLength(1);
    expect(overlaySource.match(/new THREE\.Scene\(\)/g) ?? []).toHaveLength(1);
    expect(overlaySource).toMatch(/this\.renderer\.render\(this\.scene, this\.camera\)/);
    // The shared scene is exposed so the content managers can add into it.
    expect(overlaySource).toMatch(/readonly scene: THREE\.Scene/);
  });

  it.each(CONTENT_MODULES)("%s draws into the shared scene, not its own renderer/canvas", (module) => {
    const source = read(module);
    // A content manager must NOT create its own renderer or scene — doing so would
    // reintroduce a separate depth buffer that cannot sort against the others.
    expect(source).not.toMatch(/new THREE\.WebGLRenderer/);
    expect(source).not.toMatch(/new THREE\.Scene\(/);
    // It takes the shared scene by constructor and adds its objects to it.
    expect(source).toMatch(/constructor\(scene: THREE\.Scene\)/);
    expect(source).toMatch(/this\.scene\.add\(/);
  });

  it.each(CONTENT_MODULES)("%s no longer punches screen-space occlusion holes", (module) => {
    const source = read(module);
    // The per-canvas eraser (subtractive CustomBlending quads over each tank) was
    // the workaround for un-sortable stacked canvases; the depth buffer replaces
    // it, so no occluder/eraser code should remain.
    expect(source).not.toMatch(/occluder/i);
    expect(source).not.toMatch(/CustomBlending/);
  });
});

describe("the compositor exposes a single scene the content managers accept (TT-29)", () => {
  const disposers: Array<() => void> = [];

  afterEach(() => {
    while (disposers.length > 0) {
      disposers.pop()!();
    }
  });

  it("hands the same THREE.Scene to every content manager", async () => {
    const { Overlay3D } = await import("../src/game/overlay-3d");
    const { TreeOverlay3D } = await import("../src/game/tree-3d");
    const { CrateOverlay3D } = await import("../src/game/crate-3d");
    const { CarOverlay3D } = await import("../src/game/car-3d");
    const { TankOverlay3D } = await import("../src/game/tank-3d");

    const host = document.createElement("div");
    const overlay = new Overlay3D(host);
    disposers.push(() => overlay.dispose());

    // Every content manager is constructed against the compositor's ONE scene.
    // Constructing them must not throw, and there is a single scene instance for
    // all of them — the precondition for one shared depth buffer.
    expect(() => {
      new TreeOverlay3D(overlay.scene);
      new CrateOverlay3D(overlay.scene);
      new CarOverlay3D(overlay.scene);
      new TankOverlay3D(overlay.scene);
    }).not.toThrow();

    expect(overlay.scene).toBeDefined();
  });
});

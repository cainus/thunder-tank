// Real-time 3D world overlay compositor. A single three.js WebGL canvas is
// composited directly on top of the Phaser game canvas, and EVERY 3D object —
// trees (tree-3d.ts), crates (crate-3d.ts), parked cars (car-3d.ts), and tanks
// (tank-3d.ts) — is placed into this compositor's one shared THREE.Scene.
//
// TT-29: those four used to render into four separate stacked canvases, each
// with its own depth buffer, so their depths could not be compared: whichever
// canvas sat higher in the CSS z-index stack drew on top regardless of world
// position. A tank behind a tree still painted over the tree because the tank
// canvas was pinned above the tree canvas (and each obstacle overlay punched a
// screen-space hole in itself so the tank would show through). By collapsing all
// 3D content into ONE scene rendered in a single depth-tested pass, the depth
// buffer now sorts every object correctly — a tank genuinely behind a tree,
// crate, or car is occluded by it, and one in front reads on top, with no
// hole-punching required.
//
// The compositor owns the renderer, canvas, camera, and lighting; the per-kind
// modules are thin content managers that only add/update/remove their own
// objects within `scene`. The camera math (a tilted top-down orthographic camera
// kept in lock-step with the Phaser camera) is shared with the flat decor via
// urban-decor.ts.
import * as THREE from "three";
import { LAYER_Z } from "./layer-stack";
import {
  OPAQUE_OVERLAY_OPACITY,
  TREE_CAMERA_TILT,
  WORLD_OVERLAY_TESTID,
  removeExistingWorldOverlays,
  treeCameraEye,
  treeOrthoFrustum,
  type TreeViewRect,
} from "./urban-decor";

export type WorldViewRect = TreeViewRect;

// Orthographic cameras don't foreshorten with distance, so this only needs to be
// large enough to clear the tallest model and keep it inside the near/far planes.
const CAMERA_HEIGHT = 4000;

/**
 * Owns the single stacked WebGL canvas and the one THREE.Scene that every 3D
 * content manager (trees, crates, cars, tanks) draws into. Constructing it
 * sweeps any overlay canvas orphaned by a prior game on the shared host, so 3D
 * items never accumulate map-to-map (TT-22/TT-27), and mounts a fresh canvas.
 */
export class Overlay3D {
  private readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  private readonly camera: THREE.OrthographicCamera;
  private readonly canvas: HTMLCanvasElement;
  private readonly host: HTMLElement;
  private disposed = false;
  private lastPixelWidth = 0;
  private lastPixelHeight = 0;

  constructor(host: HTMLElement) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.canvas = this.renderer.domElement;
    this.canvas.setAttribute("data-testid", WORLD_OVERLAY_TESTID);
    Object.assign(this.canvas.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      // Solid obstacles composite fully opaque (the trunk/canopy must not let the
      // road show through — TT-23); the shared opaque constant keeps the single
      // overlay in step with the flat-sprite fallback.
      opacity: String(OPAQUE_OVERLAY_OPACITY),
      // Sit above the base Phaser canvas (2D sprites/ground) and below the DOM HUD
      // layers, per the cross-canvas layer contract (see layer-stack.ts).
      zIndex: String(LAYER_Z.worldOverlay),
    } satisfies Partial<CSSStyleDeclaration>);
    // Drop any overlay canvas orphaned by a prior game on this shared host before
    // adding ours, so 3D items never stack up across maps (TT-22/TT-27). Every
    // map runs inside a fresh Phaser.Game mounted on the same persistent host, so
    // a canvas left behind by a prior game's teardown — or by an async model-load
    // race — would otherwise stack a second set of 3D items on the new map's.
    removeExistingWorldOverlays(host);
    host.appendChild(this.canvas);

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, CAMERA_HEIGHT * 2);
    // Look straight down onto the XZ ground plane; world X maps to screen X and
    // world Z maps to screen Y (Phaser's downward Y). The tilt is applied per
    // frame in render() by nudging the eye toward +Z.
    this.camera.up.set(0, 0, -1);

    this.addLighting();
  }

  private addLighting(): void {
    const hemisphere = new THREE.HemisphereLight(0xe4edff, 0x2b3628, 0.88);
    this.scene.add(hemisphere);

    const sun = new THREE.DirectionalLight(0xfff2d6, 1.12);
    sun.position.set(-0.6, 1, 0.35);
    this.scene.add(sun);

    const ambient = new THREE.AmbientLight(0xffffff, 0.37);
    this.scene.add(ambient);
  }

  /**
   * Syncs the shared 3D camera to the Phaser camera's visible world rectangle and
   * draws the whole scene in one depth-tested pass. `pixelWidth`/`pixelHeight` are
   * the game canvas size in CSS pixels (used to keep the WebGL buffer aligned with
   * the Phaser canvas). Because there is a single scene and a single pass, three's
   * depth buffer sorts trees, crates, cars, and tanks against one another.
   */
  render(view: WorldViewRect, pixelWidth: number, pixelHeight: number): void {
    if (this.disposed) {
      return;
    }

    if (pixelWidth !== this.lastPixelWidth || pixelHeight !== this.lastPixelHeight) {
      this.renderer.setSize(pixelWidth, pixelHeight, false);
      this.lastPixelWidth = pixelWidth;
      this.lastPixelHeight = pixelHeight;
    }

    const { halfWidth, halfHeight } = treeOrthoFrustum(view.width, view.height);
    this.camera.left = -halfWidth;
    this.camera.right = halfWidth;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.near = 0.1;
    this.camera.far = CAMERA_HEIGHT * 2;
    this.camera.updateProjectionMatrix();

    // Eye sits above the view centre, tilted toward +Z so tops (canopies, turrets)
    // lean up-screen while each object's footprint stays pinned to its flat map
    // position. Both the eye and the look-at target are anchored to the *world
    // view* (never to a tank/player) so the overlay pans with the ground as the
    // Phaser camera scrolls. This only stays lag-free if `view` is the CURRENT
    // frame's worldView; the caller must render after Phaser's preRender (see
    // CampaignScene, which drives this from the post-camera RENDER event).
    const { eye, target } = treeCameraEye(view, CAMERA_HEIGHT, TREE_CAMERA_TILT);
    this.camera.position.set(eye.x, eye.height, eye.z);
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(target.x, target.height, target.z);

    this.renderer.render(this.scene, this.camera);
  }

  setVisible(visible: boolean): void {
    this.canvas.style.display = visible ? "block" : "none";
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.renderer.dispose();
    if (this.canvas.parentElement === this.host) {
      this.host.removeChild(this.canvas);
    }
  }
}

// Real-time 3D crate overlay. Mirrors tree-3d.ts: a three.js WebGL canvas is
// composited directly on top of the Phaser game canvas so the square "crate"
// obstacles that used to be flat sprites are now actual 3D models
// (public/assets/models/crate.obj) rendered with an orthographic, slightly
// tilted top-down camera kept in lock-step with the Phaser camera. The shared
// projection math lives in urban-decor.ts.
//
// Crates are real, collidable obstacles: their Phaser physics body stays in the
// scene (invisible) so collision is unchanged, while this overlay only draws the
// 3D look on top. Because the overlay is a separate stacked canvas above every
// Phaser sprite, a screen-space eraser pass punches a soft hole over each tank's
// ground position so tanks — drawn by Phaser underneath at a higher depth than
// the flat crates were — always read on top of the crate they overlap.
import * as THREE from "three";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import {
  CRATE_OVERLAY_TESTID,
  CRATE_WORLD_SCALE,
  TREE_CAMERA_TILT,
  TREE_OCCLUDER_WORLD_RADIUS,
  occluderClipTransform,
  removeExistingCrateOverlays,
  treeOrthoFrustum,
  type TreeViewRect,
} from "./urban-decor";
import type { Vec2 } from "./types";

export type { TreeViewRect } from "./urban-decor";

/** A crate to place: ground position plus an optional Phaser rotation (degrees). */
export interface CratePlacement extends Vec2 {
  rotation?: number;
}

// Crates are opaque, real obstacles (unlike the translucent tree dressing), so
// the overlay renders at full opacity and fully replaces the flat sprite.
const CRATE_OVERLAY_OPACITY = 1;
// Orthographic cameras don't foreshorten with distance, so this only needs to be
// large enough to clear the tallest model and keep it inside the near/far planes.
const CAMERA_HEIGHT = 4000;

export class CrateOverlay3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.OrthographicCamera;
  private readonly canvas: HTMLCanvasElement;
  private readonly host: HTMLElement;
  // Screen-space eraser pass: a full-clip-space ortho camera and a pool of quads
  // (one per tank) whose alpha is subtracted from the crates so tanks show
  // through. Reusing a mesh pool avoids per-frame allocation/disposal.
  private readonly occluderScene: THREE.Scene;
  private readonly occluderCamera: THREE.OrthographicCamera;
  private readonly occluderTexture: THREE.Texture;
  private readonly occluderMaterial: THREE.MeshBasicMaterial;
  private readonly occluderGeometry: THREE.PlaneGeometry;
  private readonly occluderPool: THREE.Mesh[] = [];
  private template?: THREE.Object3D;
  private disposed = false;
  private lastPixelWidth = 0;
  private lastPixelHeight = 0;

  constructor(host: HTMLElement) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    // The crate pass and the eraser pass share one frame, so drive clearing
    // manually instead of letting each render() call wipe the previous pass.
    this.renderer.autoClear = false;

    this.canvas = this.renderer.domElement;
    this.canvas.setAttribute("data-testid", CRATE_OVERLAY_TESTID);
    Object.assign(this.canvas.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      opacity: String(CRATE_OVERLAY_OPACITY),
    } satisfies Partial<CSSStyleDeclaration>);
    // Drop any overlay canvas orphaned by a prior game on this shared host before
    // adding ours, so crates never stack up across maps (see helper docs).
    removeExistingCrateOverlays(host);
    host.appendChild(this.canvas);

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, CAMERA_HEIGHT * 2);
    // Look straight down onto the XZ ground plane; world X maps to screen X and
    // world Z maps to screen Y (Phaser's downward Y). The tilt is applied per
    // frame in render() by nudging the eye toward +Z.
    this.camera.up.set(0, 0, -1);

    this.occluderScene = new THREE.Scene();
    // A clip-space camera whose world coordinates are exactly NDC, so the eraser
    // quads can be positioned/sized directly from occluderClipTransform().
    this.occluderCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.occluderTexture = createRadialAlphaTexture();
    this.occluderMaterial = new THREE.MeshBasicMaterial({
      map: this.occluderTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      // Subtract this quad's alpha from the crates already in the framebuffer:
      // result = destination * (1 - src.alpha). At the quad centre (alpha ~1) the
      // crate is fully erased (tank shows through); at the edges it is untouched.
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.ZeroFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.occluderGeometry = new THREE.PlaneGeometry(1, 1);

    this.addLighting();
  }

  private addLighting(): void {
    const hemisphere = new THREE.HemisphereLight(0xf1f6ff, 0x2b3138, 0.9);
    this.scene.add(hemisphere);

    const sun = new THREE.DirectionalLight(0xfff2d6, 1.15);
    sun.position.set(-0.6, 1, 0.35);
    this.scene.add(sun);

    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambient);
  }

  /** Loads the crate model (.obj + sibling .mtl) once, ready for placement. */
  async load(modelPath: string): Promise<void> {
    const lastSlash = modelPath.lastIndexOf("/");
    const dir = lastSlash >= 0 ? modelPath.slice(0, lastSlash + 1) : "";
    const objFile = modelPath.slice(lastSlash + 1);
    const mtlFile = objFile.replace(/\.obj$/i, ".mtl");

    const materials = await new MTLLoader().setPath(dir).loadAsync(mtlFile);
    materials.preload();

    const objLoader = new OBJLoader();
    objLoader.setMaterials(materials);
    objLoader.setPath(dir);
    const model = await objLoader.loadAsync(objFile);

    if (this.disposed) {
      disposeObject(model);
      return;
    }

    // The generated .obj has no vertex normals; compute them so the Phong
    // materials from the .mtl shade correctly under the scene lights. Duplicated
    // corner vertices keep the crate's edges hard/faceted rather than smoothed.
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.computeVertexNormals();
      }
    });

    this.template = model;
  }

  /** Places one 3D crate at each placement. Replaces any prior placement. */
  setCrates(placements: CratePlacement[]): void {
    if (!this.template || this.disposed) {
      return;
    }

    this.clearCrates();

    placements.forEach((placement) => {
      const crate = this.template!.clone(true);
      crate.position.set(placement.x, 0, placement.y);
      // Phaser rotation is a screen-space clockwise angle in degrees; on the XZ
      // ground plane (screen Y = world Z) that maps to a clockwise turn about the
      // downward -Y axis, i.e. a negative rotation about three's +Y.
      crate.rotation.y = -THREE.MathUtils.degToRad(placement.rotation ?? 0);
      crate.scale.setScalar(CRATE_WORLD_SCALE);
      crate.userData.isCrate = true;
      this.scene.add(crate);
    });
  }

  /**
   * Syncs the 3D camera to the Phaser camera's visible world rectangle and
   * draws a frame. `pixelWidth`/`pixelHeight` are the game canvas size in CSS
   * pixels (used to keep the WebGL buffer aligned with the Phaser canvas).
   * `occluders` are the world positions (e.g. living tanks) that should stay
   * visible on top of the crates.
   */
  render(view: TreeViewRect, pixelWidth: number, pixelHeight: number, occluders: Vec2[] = []): void {
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

    // Eye sits above the view centre, tilted toward +Z so the crates lean
    // up-screen while their footprints stay pinned to their flat map positions.
    this.camera.position.set(
      view.centerX,
      CAMERA_HEIGHT * Math.cos(TREE_CAMERA_TILT),
      view.centerY + CAMERA_HEIGHT * Math.sin(TREE_CAMERA_TILT),
    );
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(view.centerX, 0, view.centerY);

    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderOccluders(view, occluders);
  }

  // Positions the eraser quad pool over the given world points and draws the
  // subtractive pass, cutting soft holes in the crates so those points (tanks)
  // read on top. autoClear is off, so this composites over the crate render.
  private renderOccluders(view: TreeViewRect, occluders: Vec2[]): void {
    this.syncOccluderPool(occluders.length);

    for (let i = 0; i < this.occluderPool.length; i += 1) {
      const mesh = this.occluderPool[i];
      const point = occluders[i];

      if (!point) {
        mesh.visible = false;
        continue;
      }

      const transform = occluderClipTransform(point.x, point.y, view, TREE_OCCLUDER_WORLD_RADIUS);
      mesh.visible = true;
      mesh.position.set(transform.x, transform.y, 0);
      mesh.scale.set(transform.width, transform.height, 1);
    }

    if (this.occluderPool.length > 0) {
      this.renderer.render(this.occluderScene, this.occluderCamera);
    }
  }

  private syncOccluderPool(count: number): void {
    while (this.occluderPool.length < count) {
      const mesh = new THREE.Mesh(this.occluderGeometry, this.occluderMaterial);
      mesh.frustumCulled = false;
      this.occluderPool.push(mesh);
      this.occluderScene.add(mesh);
    }
  }

  setVisible(visible: boolean): void {
    this.canvas.style.display = visible ? "block" : "none";
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.clearCrates();

    if (this.template) {
      disposeObject(this.template);
      this.template = undefined;
    }

    for (const mesh of this.occluderPool) {
      this.occluderScene.remove(mesh);
    }
    this.occluderPool.length = 0;
    this.occluderGeometry.dispose();
    this.occluderMaterial.dispose();
    this.occluderTexture.dispose();

    this.renderer.dispose();
    if (this.canvas.parentElement === this.host) {
      this.host.removeChild(this.canvas);
    }
  }

  private clearCrates(): void {
    for (const child of [...this.scene.children]) {
      if (child.userData.isCrate) {
        this.scene.remove(child);
        // NB: do NOT dispose the child's geometry/material here. Object3D.clone()
        // shares geometry and materials by reference with the template, so
        // disposing a placed crate would also destroy the resources the template
        // (and every other clone) still points at, breaking a later setCrates().
        // The shared resources are released once, via the template, in dispose().
      }
    }
  }
}

// Radial alpha ramp (opaque centre → transparent edge) used as the eraser mask,
// so each tank cuts a soft-edged hole in the crates rather than a hard square.
function createRadialAlphaTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.6, "rgba(255, 255, 255, 0.85)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const material = child.material as THREE.Material | THREE.Material[];
      if (Array.isArray(material)) {
        material.forEach((entry) => entry.dispose());
      } else {
        material.dispose();
      }
    }
  });
}

// Real-time 3D tree overlay. A three.js WebGL canvas is composited directly on
// top of the Phaser game canvas; the urban "trees" that used to be flat sprites
// are now actual 3D models (public/assets/models/tree.obj) rendered with an
// orthographic, slightly-tilted top-down camera whose ground plane is kept in
// lock-step with the Phaser camera. See urban-decor.ts for the shared math.
//
// Because the overlay is a separate stacked canvas, Phaser cannot depth-sort its
// sprites against the trees. To preserve the pre-3D depth order (flat trees sat
// below the tanks at depth -9), a second screen-space pass punches a soft hole in
// the canopy over each tank's ground position, so tanks — drawn by Phaser
// underneath — always read on top of the decoration instead of being hidden by a
// translucent canopy. The React HUD is a separate DOM layer above this canvas
// (z-index), so it is never covered.
import * as THREE from "three";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import {
  TREE_CAMERA_TILT,
  TREE_OCCLUDER_WORLD_RADIUS,
  TREE_OVERLAY_TESTID,
  TREE_WORLD_SCALE,
  occluderClipTransform,
  removeExistingTreeOverlays,
  treeCameraEye,
  treeOrthoFrustum,
  treeScaleFactor,
  type TreeViewRect,
} from "./urban-decor";
import type { Vec2 } from "./types";

export type { TreeViewRect } from "./urban-decor";

// Kept subdued so the decoration never competes with real, collidable
// obstacles or the tanks it composites over (mirrors URBAN_DECOR_ALPHA).
const TREE_OVERLAY_OPACITY = 0.72;
// Orthographic cameras don't foreshorten with distance, so this only needs to be
// large enough to clear the tallest model and keep it inside the near/far planes.
const CAMERA_HEIGHT = 4000;

export class TreeOverlay3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.OrthographicCamera;
  private readonly canvas: HTMLCanvasElement;
  private readonly host: HTMLElement;
  // Screen-space eraser pass: a full-clip-space ortho camera and a pool of quads
  // (one per tank) whose alpha is subtracted from the canopy so tanks show
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
    // The canopy pass and the eraser pass share one frame, so drive clearing
    // manually instead of letting each render() call wipe the previous pass.
    this.renderer.autoClear = false;

    this.canvas = this.renderer.domElement;
    this.canvas.setAttribute("data-testid", TREE_OVERLAY_TESTID);
    Object.assign(this.canvas.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      opacity: String(TREE_OVERLAY_OPACITY),
    } satisfies Partial<CSSStyleDeclaration>);
    // Drop any overlay canvas orphaned by a prior game on this shared host before
    // adding ours, so trees never stack up across maps (see helper docs).
    removeExistingTreeOverlays(host);
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
      // Subtract this quad's alpha from the canopy already in the framebuffer:
      // result = destination * (1 - src.alpha). At the quad centre (alpha ~1) the
      // canopy is fully erased (tank shows through); at the edges it is untouched.
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.ZeroFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.occluderGeometry = new THREE.PlaneGeometry(1, 1);

    this.addLighting();
  }

  private addLighting(): void {
    const hemisphere = new THREE.HemisphereLight(0xdfeaff, 0x2b3a24, 0.85);
    this.scene.add(hemisphere);

    const sun = new THREE.DirectionalLight(0xfff2d6, 1.1);
    sun.position.set(-0.6, 1, 0.35);
    this.scene.add(sun);

    const ambient = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(ambient);
  }

  /** Loads the tree model (.obj + sibling .mtl) once, ready for placement. */
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
    // materials from the .mtl shade correctly under the scene lights.
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.computeVertexNormals();
      }
    });

    this.template = model;
  }

  /** Places one 3D tree at each world position. Replaces any prior placement. */
  setTrees(positions: Vec2[]): void {
    if (!this.template || this.disposed) {
      return;
    }

    this.clearTrees();

    positions.forEach((spot, index) => {
      const tree = this.template!.clone(true);
      tree.position.set(spot.x, 0, spot.y);
      // Deterministic per-tree rotation + size variation so the copies read as a
      // grove instead of identical stamps.
      tree.rotation.y = (index * 0.7) % (Math.PI * 2);
      tree.scale.setScalar(TREE_WORLD_SCALE * treeScaleFactor(index));
      tree.userData.isTree = true;
      this.scene.add(tree);
    });
  }

  /**
   * Syncs the 3D camera to the Phaser camera's visible world rectangle and
   * draws a frame. `pixelWidth`/`pixelHeight` are the game canvas size in CSS
   * pixels (used to keep the WebGL buffer aligned with the Phaser canvas).
   * `occluders` are the world positions (e.g. living tanks) that should stay
   * visible on top of the canopy.
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

    // Eye sits above the view centre, tilted toward +Z so canopies lean
    // up-screen while trunk bases stay pinned to their flat map positions. Both
    // the eye and the look-at target are anchored to the *world view* (never to a
    // tank/player) so the overlay pans with the ground as the Phaser camera
    // scrolls. Note this only stays lag-free if `view` is the CURRENT frame's
    // worldView; the caller must render after Phaser's preRender (see
    // CampaignScene.renderTreeOverlay), or the trees fall a frame behind the
    // followed camera and appear to drift with player 1. See treeCameraEye + the
    // world-locking tests in urban-decor.test.ts.
    const { eye, target } = treeCameraEye(view, CAMERA_HEIGHT, TREE_CAMERA_TILT);
    this.camera.position.set(eye.x, eye.height, eye.z);
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(target.x, target.height, target.z);

    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderOccluders(view, occluders);
  }

  // Positions the eraser quad pool over the given world points and draws the
  // subtractive pass, cutting soft holes in the canopy so those points (tanks)
  // read on top. autoClear is off, so this composites over the canopy render.
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
    this.clearTrees();

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

  private clearTrees(): void {
    for (const child of [...this.scene.children]) {
      if (child.userData.isTree) {
        this.scene.remove(child);
        // NB: do NOT dispose the child's geometry/material here. Object3D.clone()
        // shares geometry and materials by reference with the template, so
        // disposing a placed tree would also destroy the resources the template
        // (and every other clone) still points at, breaking a later setTrees().
        // The shared resources are released once, via the template, in dispose().
      }
    }
  }
}

// Radial alpha ramp (opaque centre → transparent edge) used as the eraser mask,
// so each tank cuts a soft-edged hole in the canopy rather than a hard square.
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

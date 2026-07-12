// Real-time 3D tree overlay. A three.js WebGL canvas is composited directly on
// top of the Phaser game canvas; the urban "trees" that used to be flat sprites
// are now actual 3D models (public/assets/models/tree.obj) rendered with an
// orthographic, slightly-tilted top-down camera whose ground plane is kept in
// lock-step with the Phaser camera. See urban-decor.ts for the shared math.
import * as THREE from "three";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { TREE_CAMERA_TILT, TREE_WORLD_SCALE, treeOrthoFrustum } from "./urban-decor";
import type { Vec2 } from "./types";

// Kept subdued so the decoration never competes with real, collidable
// obstacles or the tanks it now renders in front of (mirrors URBAN_DECOR_ALPHA).
const TREE_OVERLAY_OPACITY = 0.72;
// Orthographic cameras don't foreshorten with distance, so this only needs to be
// large enough to clear the tallest model and keep it inside the near/far planes.
const CAMERA_HEIGHT = 4000;

export interface TreeViewRect {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

export class TreeOverlay3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.OrthographicCamera;
  private readonly canvas: HTMLCanvasElement;
  private readonly host: HTMLElement;
  private template?: THREE.Object3D;
  private disposed = false;
  private lastPixelWidth = 0;
  private lastPixelHeight = 0;

  constructor(host: HTMLElement) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.canvas = this.renderer.domElement;
    this.canvas.setAttribute("data-testid", "tree-overlay-3d");
    Object.assign(this.canvas.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      opacity: String(TREE_OVERLAY_OPACITY),
    } satisfies Partial<CSSStyleDeclaration>);
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
      tree.scale.setScalar(TREE_WORLD_SCALE);
      // Deterministic per-tree variation so the copies don't look stamped.
      tree.rotation.y = (index * 0.7) % (Math.PI * 2);
      tree.scale.multiplyScalar(0.9 + ((index * 37) % 20) / 100);
      tree.userData.isTree = true;
      this.scene.add(tree);
    });
  }

  /**
   * Syncs the 3D camera to the Phaser camera's visible world rectangle and
   * draws a frame. `pixelWidth`/`pixelHeight` are the game canvas size in CSS
   * pixels (used to keep the WebGL buffer aligned with the Phaser canvas).
   */
  render(view: TreeViewRect, pixelWidth: number, pixelHeight: number): void {
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
    // up-screen while trunk bases stay pinned to their flat map positions.
    this.camera.position.set(
      view.centerX,
      CAMERA_HEIGHT * Math.cos(TREE_CAMERA_TILT),
      view.centerY + CAMERA_HEIGHT * Math.sin(TREE_CAMERA_TILT),
    );
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(view.centerX, 0, view.centerY);

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
    this.clearTrees();

    if (this.template) {
      disposeObject(this.template);
      this.template = undefined;
    }

    this.renderer.dispose();
    if (this.canvas.parentElement === this.host) {
      this.host.removeChild(this.canvas);
    }
  }

  private clearTrees(): void {
    for (const child of [...this.scene.children]) {
      if (child.userData.isTree) {
        this.scene.remove(child);
        disposeObject(child);
      }
    }
  }
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

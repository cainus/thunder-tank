// Real-time 3D parked-car overlay. Mirrors crate-3d.ts: a three.js WebGL canvas
// is composited directly on top of the Phaser game canvas so the parked cars
// that line the urban road — which used to be two flat rectangles each — are now
// actual 3D models (public/assets/models/car.obj) rendered with an orthographic,
// slightly tilted top-down camera kept in lock-step with the Phaser camera. The
// shared projection math lives in urban-decor.ts.
//
// Parked cars are real, collidable obstacles: their Phaser physics body stays in
// the scene (invisible) so collision is unchanged, while this overlay only draws
// the 3D look on top. As with the crate overlay, a screen-space eraser pass
// punches a soft hole over each tank's ground position so tanks — drawn by Phaser
// underneath at a higher depth than the flat cars were — always read on top of a
// car they overlap.
//
// Unlike the crate, each parked car is painted a different body colour so the row
// stays visually varied; setCars clones and recolours the painted-hull material
// per instance (the model's CarBody mesh) while sharing all other resources.
import * as THREE from "three";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import {
  CAR_OVERLAY_TESTID,
  CAR_WORLD_SCALE,
  TREE_CAMERA_TILT,
  TREE_OCCLUDER_WORLD_RADIUS,
  occluderClipTransform,
  removeExistingCarOverlays,
  treeOrthoFrustum,
  type TreeViewRect,
} from "./urban-decor";
import type { Vec2 } from "./types";

export type { TreeViewRect } from "./urban-decor";

/** A parked car to place: ground position, screen-space rotation (degrees), and
 * an optional painted body colour (0xRRGGBB). */
export interface CarPlacement extends Vec2 {
  rotation?: number;
  color?: number;
}

// Cars are opaque, real obstacles (like crates), so the overlay renders at full
// opacity and fully replaces the flat sprite.
const CAR_OVERLAY_OPACITY = 1;
// Name of the model's painted-hull material, recoloured per car (see tintBody).
const CAR_BODY_MATERIAL = "carBody";
// Orthographic cameras don't foreshorten with distance, so this only needs to be
// large enough to clear the tallest model and keep it inside the near/far planes.
const CAMERA_HEIGHT = 4000;

export class CarOverlay3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.OrthographicCamera;
  private readonly canvas: HTMLCanvasElement;
  private readonly host: HTMLElement;
  // Screen-space eraser pass (see crate-3d.ts): a full-clip-space ortho camera
  // and a pool of quads (one per tank) whose alpha is subtracted from the cars so
  // tanks show through. Reusing a mesh pool avoids per-frame allocation.
  private readonly occluderScene: THREE.Scene;
  private readonly occluderCamera: THREE.OrthographicCamera;
  private readonly occluderTexture: THREE.Texture;
  private readonly occluderMaterial: THREE.MeshBasicMaterial;
  private readonly occluderGeometry: THREE.PlaneGeometry;
  private readonly occluderPool: THREE.Mesh[] = [];
  private template?: THREE.Object3D;
  // Placed car meshes, in the same order they were passed to setCars, so pushed
  // cars can be repositioned by index each frame via syncPositions (see TT-26).
  private readonly cars: THREE.Object3D[] = [];
  private disposed = false;
  private lastPixelWidth = 0;
  private lastPixelHeight = 0;

  constructor(host: HTMLElement) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    // The car pass and the eraser pass share one frame, so drive clearing
    // manually instead of letting each render() call wipe the previous pass.
    this.renderer.autoClear = false;

    this.canvas = this.renderer.domElement;
    this.canvas.setAttribute("data-testid", CAR_OVERLAY_TESTID);
    Object.assign(this.canvas.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      opacity: String(CAR_OVERLAY_OPACITY),
    } satisfies Partial<CSSStyleDeclaration>);
    // Drop any overlay canvas orphaned by a prior game on this shared host before
    // adding ours, so cars never stack up across maps (see helper docs).
    removeExistingCarOverlays(host);
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
      // Subtract this quad's alpha from the cars already in the framebuffer:
      // result = destination * (1 - src.alpha). At the quad centre (alpha ~1) the
      // car is fully erased (tank shows through); at the edges it is untouched.
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

  /** Loads the car model (.obj + sibling .mtl) once, ready for placement. */
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
    // corner vertices keep the car's edges hard/faceted rather than smoothed.
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.computeVertexNormals();
      }
    });

    this.template = model;
  }

  /** Places one 3D car at each placement, recolouring its body. Replaces any
   * prior placement. */
  setCars(placements: CarPlacement[]): void {
    if (!this.template || this.disposed) {
      return;
    }

    this.clearCars();

    placements.forEach((placement) => {
      const car = this.template!.clone(true);
      car.position.set(placement.x, 0, placement.y);
      // Phaser rotation is a screen-space clockwise angle in degrees; on the XZ
      // ground plane (screen Y = world Z) that maps to a clockwise turn about the
      // downward -Y axis, i.e. a negative rotation about three's +Y.
      car.rotation.y = -THREE.MathUtils.degToRad(placement.rotation ?? 0);
      car.scale.setScalar(CAR_WORLD_SCALE);
      car.userData.isCar = true;
      if (placement.color !== undefined) {
        tintBody(car, placement.color);
      }
      this.scene.add(car);
      this.cars.push(car);
    });
  }

  /**
   * Repositions the placed cars on the ground plane, by index against the order
   * passed to setCars. Used when a tank shoves a parked car so the 3D model
   * tracks its moving physics body (see TT-26). Rotation is left untouched
   * because pushed cars keep their parked orientation (Arcade bodies don't spin).
   */
  syncPositions(positions: Vec2[]): void {
    if (this.disposed) {
      return;
    }

    for (let i = 0; i < this.cars.length; i += 1) {
      const position = positions[i];
      if (position) {
        this.cars[i].position.x = position.x;
        this.cars[i].position.z = position.y;
      }
    }
  }

  /**
   * Syncs the 3D camera to the Phaser camera's visible world rectangle and draws
   * a frame. `pixelWidth`/`pixelHeight` are the game canvas size in CSS pixels
   * (used to keep the WebGL buffer aligned with the Phaser canvas). `occluders`
   * are the world positions (e.g. living tanks) that should stay visible on top
   * of the cars.
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

    // Eye sits above the view centre, tilted toward +Z so the cars lean up-screen
    // while their footprints stay pinned to their flat map positions.
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
  // subtractive pass, cutting soft holes in the cars so those points (tanks) read
  // on top. autoClear is off, so this composites over the car render.
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
    this.clearCars();

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

  private clearCars(): void {
    this.cars.length = 0;
    for (const child of [...this.scene.children]) {
      if (child.userData.isCar) {
        this.scene.remove(child);
        // Dispose only the per-instance body materials cloned in tintBody; the
        // shared geometry and the other materials are owned by the template
        // (Object3D.clone() shares them by reference) and are released once, via
        // the template, in dispose().
        disposePerInstanceMaterials(child);
      }
    }
  }
}

// Clones and recolours the painted-hull material of one placed car so each parked
// car can carry its own body colour without mutating the shared template. The
// cloned material is flagged so clearCars() can dispose it (and only it).
function tintBody(car: THREE.Object3D, color: number): void {
  car.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    const recolour = (material: THREE.Material): THREE.Material => {
      if (material.name !== CAR_BODY_MATERIAL) {
        return material;
      }
      // The body material is a MeshPhongMaterial (from the .mtl), which carries a
      // `.color`; guard the cast so a future material swap fails soft.
      const cloned = material.clone() as THREE.Material & { color?: THREE.Color };
      if (cloned.color instanceof THREE.Color) {
        cloned.color.setHex(color);
      }
      cloned.userData.isPerInstance = true;
      return cloned;
    };

    child.material = Array.isArray(child.material)
      ? child.material.map(recolour)
      : recolour(child.material);
  });
}

// Disposes the per-instance body materials created by tintBody for one placed
// car, leaving the shared template resources untouched.
function disposePerInstanceMaterials(car: THREE.Object3D): void {
  car.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (material.userData?.isPerInstance) {
        material.dispose();
      }
    }
  });
}

// Radial alpha ramp (opaque centre → transparent edge) used as the eraser mask,
// so each tank cuts a soft-edged hole in the cars rather than a hard square.
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

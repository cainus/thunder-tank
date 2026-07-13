// Real-time 3D tank overlay. Like the tree overlay (tree-3d.ts), a three.js
// WebGL canvas is composited directly on top of the Phaser game canvas; the
// tanks and their turrets that used to be flat sprites are rendered here as
// actual 3D models (public/assets/models/tank-hull.obj + tank-turret.obj) using
// the same tilted, top-down orthographic camera the trees use, so the models
// stay locked to their flat 2D ground positions.
//
// The overlay canvas is stacked ABOVE the tree overlay (higher z-index) so tanks
// always read on top of the 3D canopy, preserving the pre-3D depth order without
// needing per-frame occlusion. CampaignScene hides the flat hull/turret/stripe
// sprites while this overlay is active and feeds it each living tank's position,
// hull rotation, turret rotation, team colour, and shield state every frame.
import * as THREE from "three";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { TREE_CAMERA_TILT, treeOrthoFrustum, type TreeViewRect } from "./urban-decor";

export type TankViewRect = TreeViewRect;

// One tank's per-frame render state, all in flat gameplay terms; the overlay
// converts these to 3D transforms internally.
export interface TankRender {
  x: number;
  y: number;
  hullYaw: number;
  turretYaw: number;
  scale: number;
  // Team colour as a 0xRRGGBB int (see team-stripe.ts).
  color: number;
  shielded: boolean;
}

// Matches the tree overlay so both stacked canvases stay near/far aligned.
const CAMERA_HEIGHT = 4000;
// Opacity applied to a tank's materials while its shield buff is active, so the
// 3D tank keeps the translucent "shielded" cue the flat sprite had.
const SHIELDED_OPACITY = 0.72;

// A pooled tank instance: cloned hull + turret groups with per-instance
// materials so each tank can be tinted (and faded when shielded) independently.
interface TankInstance {
  readonly group: THREE.Group;
  readonly hull: THREE.Object3D;
  readonly turret: THREE.Object3D;
  readonly materials: THREE.Material[];
  readonly hullMaterials: THREE.MeshPhongMaterial[];
  lastColor: number;
  lastShielded: boolean;
}

export class TankOverlay3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.OrthographicCamera;
  private readonly canvas: HTMLCanvasElement;
  private readonly host: HTMLElement;
  private readonly pool: TankInstance[] = [];
  private hullTemplate?: THREE.Object3D;
  private turretTemplate?: THREE.Object3D;
  private disposed = false;
  private lastPixelWidth = 0;
  private lastPixelHeight = 0;

  constructor(host: HTMLElement) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.canvas = this.renderer.domElement;
    this.canvas.setAttribute("data-testid", "tank-overlay-3d");
    Object.assign(this.canvas.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      // Sit above the tree overlay canvas (which uses the default auto/0 stacking)
      // so tanks always draw on top of the 3D canopy, and below the HUD (z 5).
      zIndex: "1",
    } satisfies Partial<CSSStyleDeclaration>);
    // TT-22 observability: unlike the tree overlay (which sweeps the host via
    // removeExistingTreeOverlays before appending), this overlay does NOT clear
    // prior tank canvases, so stale 3D tanks stack up as the player advances
    // through maps. Surface that here without silently masking it — if any prior
    // tank overlay canvas is already mounted on this shared host, we are about to
    // add a duplicate. This only reports the defect; it does not remove them.
    const orphanedTankOverlays = host.querySelectorAll('[data-testid="tank-overlay-3d"]').length;
    if (orphanedTankOverlays > 0) {
      console.warn(
        `[tank-3d] ${orphanedTankOverlays} stale 3D tank overlay canvas(es) still on the game host; ` +
          "3D tanks are not clearing between maps (TT-22).",
      );
    }
    host.appendChild(this.canvas);

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, CAMERA_HEIGHT * 2);
    // Look straight down the +Y axis onto the XZ ground plane; world X maps to
    // screen X and world Z maps to screen Y. The tilt is applied per frame in
    // render() by nudging the eye toward +Z (see tree-3d.ts for the shared math).
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

  /**
   * Loads the hull and turret models (each an .obj + sibling .mtl) once, ready
   * for placement. Both must resolve before the overlay can render tanks.
   */
  async load(hullPath: string, turretPath: string): Promise<void> {
    const [hull, turret] = await Promise.all([loadObj(hullPath), loadObj(turretPath)]);

    if (this.disposed) {
      disposeObject(hull);
      disposeObject(turret);
      return;
    }

    this.hullTemplate = hull;
    this.turretTemplate = turret;
  }

  /** True once both models have loaded and the overlay can render tanks. */
  get ready(): boolean {
    return Boolean(this.hullTemplate && this.turretTemplate) && !this.disposed;
  }

  /**
   * Syncs the 3D camera to the Phaser camera's visible world rectangle and draws
   * the given tanks. `pixelWidth`/`pixelHeight` are the game canvas size in CSS
   * pixels (used to keep the WebGL buffer aligned with the Phaser canvas).
   */
  render(view: TankViewRect, pixelWidth: number, pixelHeight: number, tanks: TankRender[]): void {
    if (!this.ready) {
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

    // Eye sits above the view centre, tilted toward +Z so tank tops (turret,
    // barrel) lean up-screen while each tank's footprint stays pinned to its flat
    // map position — the same registration the tree overlay uses.
    this.camera.position.set(
      view.centerX,
      CAMERA_HEIGHT * Math.cos(TREE_CAMERA_TILT),
      view.centerY + CAMERA_HEIGHT * Math.sin(TREE_CAMERA_TILT),
    );
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(view.centerX, 0, view.centerY);

    this.syncPool(tanks.length);

    for (let i = 0; i < this.pool.length; i += 1) {
      const instance = this.pool[i];
      const tank = tanks[i];

      if (!tank) {
        instance.group.visible = false;
        continue;
      }

      instance.group.visible = true;
      instance.group.position.set(tank.x, 0, tank.y);
      instance.group.scale.setScalar(tank.scale);
      instance.hull.rotation.y = tank.hullYaw;
      instance.turret.rotation.y = tank.turretYaw;
      this.applyTankStyle(instance, tank.color, tank.shielded);
    }

    this.renderer.render(this.scene, this.camera);
  }

  // Recolours the hull materials to the team colour and fades the whole tank
  // while shielded, mirroring the flat sprite's shield cue. Both are cached so
  // the (cheap but not free) material updates only run when something changes.
  private applyTankStyle(instance: TankInstance, color: number, shielded: boolean): void {
    if (instance.lastColor !== color) {
      for (const material of instance.hullMaterials) {
        material.color.setHex(color);
      }
      instance.lastColor = color;
    }

    if (instance.lastShielded !== shielded) {
      for (const material of instance.materials) {
        material.transparent = shielded;
        material.opacity = shielded ? SHIELDED_OPACITY : 1;
        material.needsUpdate = true;
      }
      instance.lastShielded = shielded;
    }
  }

  private syncPool(count: number): void {
    while (this.pool.length < count) {
      this.pool.push(this.createInstance());
    }
  }

  // Builds one poolable tank: a group holding a cloned hull and turret, with all
  // materials cloned so this tank can be tinted/faded without touching the
  // shared templates. Geometry is shared with the templates (cloned by
  // reference), so it is NOT disposed per-instance — see dispose().
  private createInstance(): TankInstance {
    const hull = this.hullTemplate!.clone(true);
    const turret = this.turretTemplate!.clone(true);
    const materials: THREE.Material[] = [];
    const hullMaterials: THREE.MeshPhongMaterial[] = [];

    const cloneMaterials = (root: THREE.Object3D, collectHull: boolean): void => {
      root.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) {
          return;
        }
        const source = child.material as THREE.Material | THREE.Material[];
        if (Array.isArray(source)) {
          const cloned = source.map((entry) => entry.clone());
          child.material = cloned;
          materials.push(...cloned);
          if (collectHull) {
            collectHullMaterials(cloned, hullMaterials);
          }
        } else {
          const cloned = source.clone();
          child.material = cloned;
          materials.push(cloned);
          if (collectHull) {
            collectHullMaterials([cloned], hullMaterials);
          }
        }
      });
    };

    cloneMaterials(hull, true);
    cloneMaterials(turret, false);

    const group = new THREE.Group();
    group.add(hull);
    group.add(turret);
    group.frustumCulled = false;
    this.scene.add(group);

    return { group, hull, turret, materials, hullMaterials, lastColor: -1, lastShielded: false };
  }

  setVisible(visible: boolean): void {
    this.canvas.style.display = visible ? "block" : "none";
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    for (const instance of this.pool) {
      this.scene.remove(instance.group);
      // Dispose only the per-instance cloned materials; geometry is shared with
      // the templates and released once, via the templates, below.
      for (const material of instance.materials) {
        material.dispose();
      }
    }
    this.pool.length = 0;

    if (this.hullTemplate) {
      disposeObject(this.hullTemplate);
      this.hullTemplate = undefined;
    }
    if (this.turretTemplate) {
      disposeObject(this.turretTemplate);
      this.turretTemplate = undefined;
    }

    this.renderer.dispose();
    if (this.canvas.parentElement === this.host) {
      this.host.removeChild(this.canvas);
    }
  }
}

// Collects the recolourable "hull" materials (named in the .mtl) so team tint can
// be applied to just the body, leaving treads and turret their authored colours.
function collectHullMaterials(materials: THREE.Material[], into: THREE.MeshPhongMaterial[]): void {
  for (const material of materials) {
    if (material instanceof THREE.MeshPhongMaterial && material.name === "hull") {
      into.push(material);
    }
  }
}

// Loads a Wavefront .obj plus its sibling .mtl and computes vertex normals (the
// generated .obj has none) so the Phong materials shade under the scene lights.
async function loadObj(modelPath: string): Promise<THREE.Object3D> {
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

  model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.computeVertexNormals();
    }
  });

  return model;
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

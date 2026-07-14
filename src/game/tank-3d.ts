// 3D tank content for the shared world overlay. The tanks and their turrets that
// used to be flat sprites are actual 3D models (public/assets/models/tank-hull.obj
// + tank-turret.obj), placed into the compositor's one shared THREE.Scene (see
// overlay-3d.ts) alongside the trees, crates, and cars so the depth buffer sorts
// them all against each other.
//
// TT-29: tanks used to render into their own stacked canvas pinned ABOVE the
// tree/crate/car canvases, so a tank always drew on top of the 3D decor
// regardless of world position (a tank behind a tree still painted over it). Now
// that every 3D object shares one depth-sorted scene, a tank genuinely behind a
// tree/crate/car is occluded by it, and one in front reads on top — resolved by
// the depth buffer rather than by z-index stacking or canopy hole-punching.
//
// CampaignScene hides the flat hull/turret/stripe sprites while this content is
// active and feeds it each living tank's position, hull rotation, turret
// rotation, team colour, and shield state every frame via sync().
import * as THREE from "three";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

// One tank's per-frame render state, all in flat gameplay terms; this content
// manager converts these to 3D transforms internally.
export interface TankRender {
  x: number;
  y: number;
  hullYaw: number;
  turretYaw: number;
  scale: number;
  // Team colour as a 0xRRGGBB int (see team-stripe.ts).
  color: number;
  shielded: boolean;
  // Gun readiness for the barrel tint: 1 = ready (grey), 0 = just overheated
  // (orange). Eases back to 1 as the overheat freeze cools down. Enemies pass 1.
  gunReadiness: number;
}

// Opacity applied to a tank's materials while its shield buff is active, so the
// 3D tank keeps the translucent "shielded" cue the flat sprite had.
const SHIELDED_OPACITY = 0.72;

// Barrel tint endpoints for the gun-readiness cue: the authored neutral grey at
// full readiness (gun ready), lerped toward a hot orange the moment the gun
// overheats and back again as it cools. Mirrors the shield tint approach.
const BARREL_GREY = new THREE.Color(0.34, 0.35, 0.34);
const BARREL_ORANGE = new THREE.Color(0xff7a1a);

// A pooled tank instance: cloned hull + turret groups with per-instance
// materials so each tank can be tinted (and faded when shielded) independently.
interface TankInstance {
  readonly group: THREE.Group;
  readonly hull: THREE.Object3D;
  readonly turret: THREE.Object3D;
  readonly materials: THREE.Material[];
  readonly hullMaterials: THREE.MeshPhongMaterial[];
  readonly barrelMaterials: THREE.MeshPhongMaterial[];
  lastColor: number;
  lastShielded: boolean;
  lastReadiness: number;
}

export class TankOverlay3D {
  private readonly scene: THREE.Scene;
  private readonly pool: TankInstance[] = [];
  private hullTemplate?: THREE.Object3D;
  private turretTemplate?: THREE.Object3D;
  private disposed = false;

  /** @param scene the shared world-overlay scene the tanks are added to. */
  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /**
   * Loads the hull and turret models (each an .obj + sibling .mtl) once, ready
   * for placement. Both must resolve before the content can render tanks.
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

  /** True once both models have loaded and the content can render tanks. */
  get ready(): boolean {
    return Boolean(this.hullTemplate && this.turretTemplate) && !this.disposed;
  }

  /**
   * Updates the pooled 3D tank instances to match the given tanks. The compositor
   * draws the shared scene; this only writes each tank's transform, tint, and
   * shield/readiness state so the next depth-sorted pass reflects it.
   */
  sync(tanks: TankRender[]): void {
    if (!this.ready) {
      return;
    }

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
      this.applyGunReadiness(instance, tank.gunReadiness);
    }
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

  // Tints the gun barrel to signal readiness: grey when ready (readiness 1) and
  // orange the moment it overheats (readiness 0), lerping between the two as the
  // overheat freeze cools. Cached so the material update only runs when the
  // readiness actually changes (i.e. never for an always-ready enemy barrel),
  // matching the change-guard used by applyTankStyle.
  private applyGunReadiness(instance: TankInstance, readiness: number): void {
    const clamped = Math.min(1, Math.max(0, readiness));
    if (instance.lastReadiness === clamped) {
      return;
    }

    for (const material of instance.barrelMaterials) {
      material.color.copy(BARREL_ORANGE).lerp(BARREL_GREY, clamped);
    }
    instance.lastReadiness = clamped;
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
    const barrelMaterials: THREE.MeshPhongMaterial[] = [];

    const cloneMaterials = (root: THREE.Object3D): void => {
      root.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) {
          return;
        }
        const source = child.material as THREE.Material | THREE.Material[];
        const cloned = Array.isArray(source) ? source.map((entry) => entry.clone()) : [source.clone()];
        child.material = Array.isArray(source) ? cloned : cloned[0];
        materials.push(...cloned);
        collectNamedMaterials(cloned, "hull", hullMaterials);
        collectNamedMaterials(cloned, "barrel", barrelMaterials);
      });
    };

    cloneMaterials(hull);
    cloneMaterials(turret);

    const group = new THREE.Group();
    group.add(hull);
    group.add(turret);
    group.frustumCulled = false;
    group.userData.isTank = true;
    this.scene.add(group);

    return {
      group,
      hull,
      turret,
      materials,
      hullMaterials,
      barrelMaterials,
      lastColor: -1,
      lastShielded: false,
      lastReadiness: -1,
    };
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
  }
}

// Collects the materials with the given .mtl name so a runtime tint can be
// applied to just that part — "hull" for the team colour (body only, leaving
// treads/turret their authored colours) and "barrel" for the gun-readiness cue.
function collectNamedMaterials(materials: THREE.Material[], name: string, into: THREE.MeshPhongMaterial[]): void {
  for (const material of materials) {
    if (material instanceof THREE.MeshPhongMaterial && material.name === name) {
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

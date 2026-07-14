// 3D parked-car content for the shared world overlay. The parked cars that line
// the urban road — which used to be two flat rectangles each — are actual 3D
// models (public/assets/models/car.obj), placed into the compositor's one shared
// THREE.Scene (see overlay-3d.ts) alongside the trees, crates, and tanks so the
// depth buffer sorts them all against each other.
//
// Parked cars are real, collidable obstacles: their Phaser physics body stays in
// the scene (invisible) so collision is unchanged, while this module only owns
// the 3D car meshes. TT-29: cars used to render into their own stacked canvas and
// punch a screen-space hole over each tank so tanks read on top; with every 3D
// object now in one depth-sorted scene, a tank behind a car is correctly occluded
// by it and no hole-punching is needed.
//
// Unlike the crate, each parked car is painted a different body colour so the row
// stays visually varied; setCars clones and recolours the painted-hull material
// per instance (the model's CarBody mesh) while sharing all other resources.
import * as THREE from "three";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { CAR_WORLD_SCALE } from "./urban-decor";
import type { Vec2 } from "./types";

/** A parked car to place: ground position, screen-space rotation (degrees), and
 * an optional painted body colour (0xRRGGBB). */
export interface CarPlacement extends Vec2 {
  rotation?: number;
  color?: number;
}

// Name of the model's painted-hull material, recoloured per car (see tintBody).
const CAR_BODY_MATERIAL = "carBody";

export class CarOverlay3D {
  private readonly scene: THREE.Scene;
  private template?: THREE.Object3D;
  // Placed car meshes, in the same order they were passed to setCars, so pushed
  // cars can be repositioned by index each frame via syncPositions (see TT-26).
  private readonly cars: THREE.Object3D[] = [];
  private disposed = false;

  /** @param scene the shared world-overlay scene the cars are added to. */
  constructor(scene: THREE.Scene) {
    this.scene = scene;
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

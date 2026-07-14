// 3D crate content for the shared world overlay. The square "crate" obstacles
// that used to be flat sprites are actual 3D models
// (public/assets/models/crate.obj), placed into the compositor's one shared
// THREE.Scene (see overlay-3d.ts) alongside the trees, cars, and tanks so the
// depth buffer sorts them all against each other.
//
// Crates are real, collidable obstacles: their Phaser physics body stays in the
// scene (invisible) so collision is unchanged, while this module only owns the
// 3D crate meshes. TT-29: crates used to render into their own stacked canvas
// and punch a screen-space hole over each tank so tanks read on top; with every
// 3D object now in one depth-sorted scene, a tank behind a crate is correctly
// occluded by it and no hole-punching is needed.
import * as THREE from "three";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { CRATE_WORLD_SCALE } from "./urban-decor";
import type { Vec2 } from "./types";

/** A crate to place: ground position plus an optional Phaser rotation (degrees). */
export interface CratePlacement extends Vec2 {
  rotation?: number;
}

export class CrateOverlay3D {
  private readonly scene: THREE.Scene;
  private template?: THREE.Object3D;
  private disposed = false;

  /** @param scene the shared world-overlay scene the crates are added to. */
  constructor(scene: THREE.Scene) {
    this.scene = scene;
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

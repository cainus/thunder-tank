// 3D tree content for the shared world overlay. The urban "trees" that used to
// be flat sprites are actual 3D models (public/assets/models/tree.obj), placed
// into the compositor's one shared THREE.Scene (see overlay-3d.ts) alongside the
// crates, cars, and tanks so the depth buffer sorts them all against each other.
//
// TT-29: trees used to render into their own stacked canvas above the base game
// canvas but below the tank canvas, and punched a screen-space hole in the
// canopy over each tank so tanks read on top. With every 3D object now in one
// depth-sorted scene, a tank behind a tree is correctly occluded by its canopy
// and no hole-punching is needed — this module only owns the tree meshes.
import * as THREE from "three";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { TREE_WORLD_SCALE, treeScaleFactor } from "./urban-decor";
import type { Vec2 } from "./types";

export class TreeOverlay3D {
  private readonly scene: THREE.Scene;
  private template?: THREE.Object3D;
  private disposed = false;

  /** @param scene the shared world-overlay scene the trees are added to. */
  constructor(scene: THREE.Scene) {
    this.scene = scene;
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

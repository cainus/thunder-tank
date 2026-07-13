import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// Regression guard for TT-15.
//
// Defect: Vite fails with `Failed to resolve import "three" from
// src/game/tree-3d.ts` because the `three` package — although declared in
// package.json AND recorded in package-lock.json — was never materialised in
// node_modules (`npm ls three` reports "(empty)"). node_modules had drifted
// from the manifest/lockfile.
//
// This test reveals the defect at the fastest layer: it asks Node's own
// resolver (independent of Vite) whether the exact specifiers imported by
// tree-3d.ts exist on disk. It FAILS while three is missing and turns green as
// soon as `npm install` / `npm ci` restores the dependency. It intentionally
// does NOT fix the defect — it is the standing red spec for the fix.
const require = createRequire(import.meta.url);

// The three specifiers imported by src/game/tree-3d.ts (lines 14-16).
const TREE_3D_SPECIFIERS = [
  "three",
  "three/examples/jsm/loaders/MTLLoader.js",
  "three/examples/jsm/loaders/OBJLoader.js",
] as const;

describe("three dependency is installed (TT-15)", () => {
  it.each(TREE_3D_SPECIFIERS)(
    "resolves %s from node_modules so tree-3d.ts can import it",
    (specifier) => {
      expect(() => require.resolve(specifier)).not.toThrow();
    },
  );
});

import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  collectDependencyProblems,
  findMissingPackages,
  findUnresolvedThreeSpecifiers,
  readManifest,
  threeSpecifiersFromSource,
} from "../scripts/verify-deps.mjs";

const tempRoots = [];

function makeRoot(subdirs) {
  const root = mkdtempSync(path.join(tmpdir(), "verify-deps-"));
  tempRoots.push(root);
  for (const dir of subdirs) {
    mkdirSync(path.join(root, dir), { recursive: true });
  }
  return root;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop(), { recursive: true, force: true });
  }
});

describe("threeSpecifiersFromSource", () => {
  it("extracts three package and subpath imports, deduped", () => {
    const source = [
      'import * as THREE from "three";',
      'import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";',
      'import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";',
      'import { thing } from "./urban-decor";',
    ].join("\n");
    expect(threeSpecifiersFromSource(source)).toEqual([
      "three",
      "three/examples/jsm/loaders/MTLLoader.js",
      "three/examples/jsm/loaders/OBJLoader.js",
    ]);
  });

  it("returns nothing when there are no three imports", () => {
    expect(threeSpecifiersFromSource('import { x } from "phaser";')).toEqual([]);
  });
});

describe("findMissingPackages", () => {
  it("reports declared packages absent from node_modules", () => {
    const root = makeRoot(["node_modules/react", "node_modules/@types/node"]);
    expect(findMissingPackages(root, ["react", "three", "@types/node"])).toEqual(["three"]);
  });

  it("returns nothing when every declared package is present", () => {
    const root = makeRoot(["node_modules/react"]);
    expect(findMissingPackages(root, ["react"])).toEqual([]);
  });
});

describe("findUnresolvedThreeSpecifiers", () => {
  it("returns specifiers whose resolution throws", () => {
    const resolveFrom = (specifier) => {
      if (specifier === "three") {
        return "/somewhere/three";
      }
      throw new Error("MODULE_NOT_FOUND");
    };
    expect(
      findUnresolvedThreeSpecifiers(["three", "three/examples/jsm/loaders/OBJLoader.js"], resolveFrom),
    ).toEqual(["three/examples/jsm/loaders/OBJLoader.js"]);
  });

  it("returns nothing when everything resolves", () => {
    expect(findUnresolvedThreeSpecifiers(["three"], () => "/ok")).toEqual([]);
  });
});

describe("readManifest", () => {
  it("returns null when package.json is missing", () => {
    const root = makeRoot([]);
    expect(readManifest(root)).toBeNull();
  });
});

describe("collectDependencyProblems", () => {
  it("reports a missing manifest as a single problem", () => {
    const root = makeRoot([]);
    const problems = collectDependencyProblems(root);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("package.json");
  });

  it("passes for the real project root where node_modules is installed", () => {
    // process.cwd() is the project root under vitest; this doubles as a live
    // regression guard for TT-15 alongside tests/tree-3d-imports.test.ts.
    expect(collectDependencyProblems(process.cwd())).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import {
  collectDependencyNames,
  findMissingDependencies,
  shouldReinstallDependencies,
} from "../scripts/dev-auto-update.mjs";

describe("shouldReinstallDependencies", () => {
  it("reinstalls when package-lock.json changed", () => {
    expect(shouldReinstallDependencies(["package-lock.json"])).toBe(true);
  });

  it("reinstalls when package.json changed", () => {
    expect(shouldReinstallDependencies(["src/game/tree-3d.ts", "package.json"])).toBe(true);
  });

  it("does not reinstall when only source files changed", () => {
    expect(shouldReinstallDependencies(["src/game/tree-3d.ts", "README.md"])).toBe(false);
  });

  it("does not reinstall for an empty change set", () => {
    expect(shouldReinstallDependencies([])).toBe(false);
  });
});

describe("collectDependencyNames", () => {
  it("merges dependencies and devDependencies", () => {
    const manifest = {
      dependencies: { three: "^0.185.1", react: "^19.0.0" },
      devDependencies: { vitest: "^4.1.9" },
    };
    expect(collectDependencyNames(manifest)).toEqual(["three", "react", "vitest"]);
  });

  it("tolerates a manifest without dependency fields", () => {
    expect(collectDependencyNames({})).toEqual([]);
    expect(collectDependencyNames(null)).toEqual([]);
  });
});

describe("findMissingDependencies", () => {
  it("returns declared packages that are not installed", () => {
    const installed = new Set(["react"]);
    const missing = findMissingDependencies(["three", "react"], (name) => installed.has(name));
    expect(missing).toEqual(["three"]);
  });

  it("returns nothing when every declared package is installed", () => {
    const missing = findMissingDependencies(["three", "react"], () => true);
    expect(missing).toEqual([]);
  });

  it("reports an empty dependency list as fully installed", () => {
    expect(findMissingDependencies([], () => false)).toEqual([]);
  });
});

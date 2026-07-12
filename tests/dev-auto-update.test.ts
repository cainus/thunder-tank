import { describe, expect, it } from "vitest";
import { shouldReinstallDependencies } from "../scripts/dev-auto-update.mjs";

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

// Standing detection mirroring crate-3d-imports.test.ts, for the 3D car overlay.
//
// car-3d.ts is loaded via a dynamic import() from CampaignScene, so a missing
// `three` package does NOT surface at app boot — it only blows up as a Vite
// dev-server import-analysis overlay the first time the 3D car overlay is
// lazy-loaded (or as a build failure). This test pulls that failure forward into
// a fast, explicit unit check that names the exact unresolved specifier.
//
// The list of packages to verify is derived from car-3d.ts's OWN import
// statements, so the source module stays the single source of truth: if someone
// adds/removes a `three*` import, this check follows automatically. It fails
// whenever a specifier car-3d.ts imports cannot be resolved from node_modules.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Vitest runs with the project root as cwd; car-3d.ts is the 3D car module.
const carModulePath = resolve(process.cwd(), "src/game/car-3d.ts");

/** Every external package specifier car-3d.ts imports from `three` (or a subpath). */
function threeSpecifiersImportedByCarModule(): string[] {
  const source = readFileSync(carModulePath, "utf8");
  const specifiers = new Set<string>();
  const importFrom = /\bfrom\s+["'](three(?:\/[^"']*)?)["']/g;
  for (let match = importFrom.exec(source); match; match = importFrom.exec(source)) {
    specifiers.add(match[1]);
  }
  return [...specifiers];
}

describe("car-3d.ts three.js imports are resolvable", () => {
  const require = createRequire(carModulePath);
  const specifiers = threeSpecifiersImportedByCarModule();

  it("imports at least one `three` specifier (guards the extractor itself)", () => {
    expect(specifiers.length).toBeGreaterThan(0);
  });

  it.each(specifiers)("resolves %s from node_modules", (specifier) => {
    // Throws MODULE_NOT_FOUND when the package is absent — the same class of
    // defect the crate overlay test guards against, for the car overlay.
    expect(() => require.resolve(specifier)).not.toThrow();
  });
});

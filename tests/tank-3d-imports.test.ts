// Guards TT-17's 3D tank overlay against the same class of failure tracked by
// tree-3d-imports.test.ts: tank-3d.ts is loaded via a dynamic import() from
// CampaignScene, so a missing/drifted `three` install does NOT surface at app
// boot — it only blows up the first time the overlay is lazy-loaded (or as a
// build failure). This pulls that failure forward into a fast unit check that
// names the exact unresolved specifier.
//
// The specifier list is derived from tank-3d.ts's OWN import statements, so the
// source module stays the single source of truth: adding/removing a `three*`
// import is followed automatically.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const tankModulePath = resolve(process.cwd(), "src/game/tank-3d.ts");

/** Every external package specifier tank-3d.ts imports from `three` (or a subpath). */
function threeSpecifiersImportedByTankModule(): string[] {
  const source = readFileSync(tankModulePath, "utf8");
  const specifiers = new Set<string>();
  const importFrom = /\bfrom\s+["'](three(?:\/[^"']*)?)["']/g;
  for (let match = importFrom.exec(source); match; match = importFrom.exec(source)) {
    specifiers.add(match[1]);
  }
  return [...specifiers];
}

describe("tank-3d.ts three.js imports are resolvable", () => {
  const require = createRequire(tankModulePath);
  const specifiers = threeSpecifiersImportedByTankModule();

  it("imports at least one `three` specifier (guards the extractor itself)", () => {
    expect(specifiers.length).toBeGreaterThan(0);
  });

  it.each(specifiers)("resolves %s from node_modules", (specifier) => {
    expect(() => require.resolve(specifier)).not.toThrow();
  });
});

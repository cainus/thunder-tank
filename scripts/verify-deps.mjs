// Fast pre-dev gate for TT-15: fail loudly when node_modules does not satisfy the
// packages the code needs, instead of letting the drift surface later as a Vite
// "Failed to resolve import" overlay the first time a lazy-loaded module (e.g.
// src/game/tree-3d.ts, which dynamically imports `three`) is fetched.
//
// The `npm run dev` auto-updater self-heals by reinstalling, but the plain-vite
// entrypoints (`dev:raw`, and `dev:portless` which shells out to `dev:raw`) skip
// that step. Wiring this script as `predev:raw` closes that gap so ANY dev launch
// verifies the dependency tree first and stops with a clear remediation message
// rather than a cryptic mid-session error.
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { collectDependencyNames } from "./dev-auto-update.mjs";

// tree-3d.ts is the module whose `three` imports triggered the reported resolver
// failure; deriving the specifiers from its source keeps it the single source of
// truth (mirrors tests/tree-3d-imports.test.ts).
const TREE_MODULE_RELATIVE = "src/game/tree-3d.ts";

/** Reads and parses package.json from `root`, or null if it cannot be read. */
export function readManifest(root) {
  try {
    return JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  } catch {
    return null;
  }
}

/**
 * Returns the declared package names that are absent from node_modules. `root` is
 * the project root; a package `name` (possibly scoped/subpath) counts as installed
 * when its directory exists under node_modules.
 */
export function findMissingPackages(root, dependencyNames) {
  const nodeModules = path.join(root, "node_modules");
  return dependencyNames.filter((name) => !existsSync(path.join(nodeModules, ...name.split("/"))));
}

/** Every external specifier `moduleSource` imports from `three` (or a subpath). */
export function threeSpecifiersFromSource(moduleSource) {
  const specifiers = new Set();
  const importFrom = /\bfrom\s+["'](three(?:\/[^"']*)?)["']/g;
  for (let match = importFrom.exec(moduleSource); match; match = importFrom.exec(moduleSource)) {
    specifiers.add(match[1]);
  }
  return [...specifiers];
}

/**
 * Returns the `three` specifiers imported by tree-3d.ts that cannot be resolved
 * from node_modules. `resolveFrom` is a require.resolve bound to the tree module,
 * so subpath imports (e.g. three/examples/jsm/loaders/OBJLoader.js) are validated
 * as precisely as Vite would resolve them, not just by top-level package presence.
 */
export function findUnresolvedThreeSpecifiers(specifiers, resolveFrom) {
  return specifiers.filter((specifier) => {
    try {
      resolveFrom(specifier);
      return false;
    } catch {
      return true;
    }
  });
}

/**
 * Verifies node_modules satisfies the declared dependencies and tree-3d.ts's
 * `three` imports. Returns a list of human-readable problems (empty when healthy)
 * rather than throwing, so callers control how to report/exit.
 */
export function collectDependencyProblems(root) {
  const problems = [];

  const manifest = readManifest(root);
  if (!manifest) {
    return [`could not read ${path.join(root, "package.json")}`];
  }

  const missing = findMissingPackages(root, collectDependencyNames(manifest));
  if (missing.length > 0) {
    problems.push(`declared packages missing from node_modules: ${missing.join(", ")}`);
  }

  const treeModulePath = path.join(root, TREE_MODULE_RELATIVE);
  if (existsSync(treeModulePath)) {
    const specifiers = threeSpecifiersFromSource(readFileSync(treeModulePath, "utf8"));
    const resolveFrom = createRequire(treeModulePath).resolve;
    const unresolved = findUnresolvedThreeSpecifiers(specifiers, resolveFrom);
    if (unresolved.length > 0) {
      problems.push(
        `imports in ${TREE_MODULE_RELATIVE} do not resolve: ${unresolved.join(", ")}`,
      );
    }
  }

  return problems;
}

function main() {
  const root = process.cwd();
  const problems = collectDependencyProblems(root);
  if (problems.length === 0) {
    return;
  }

  console.error("[verify-deps] dependency check failed:");
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  console.error("[verify-deps] node_modules is out of sync with the manifest; run `npm ci`.");
  process.exit(1);
}

// Only run when invoked directly (as the predev gate), not when imported by tests.
const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  main();
}

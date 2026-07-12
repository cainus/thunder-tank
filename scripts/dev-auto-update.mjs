import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const CHECK_INTERVAL_MS = Number(process.env.THUNDER_TANK_UPDATE_INTERVAL_MS ?? 60_000);
const CHILD_COMMAND = "npm";
const CHILD_ARGS = ["run", "dev:portless"];

// A pull that touches either of these means the installed dependency tree may be
// stale, so we must reinstall before restarting Vite. Otherwise a freshly pulled
// commit that adds a package (e.g. "three") leaves node_modules missing it and the
// dev server fails with "Failed to resolve import" until someone runs npm install.
const DEPENDENCY_MANIFESTS = ["package-lock.json", "package.json"];

/** Returns true when any changed path is a dependency manifest that requires reinstalling. */
export function shouldReinstallDependencies(changedFiles) {
  return changedFiles.some((file) => DEPENDENCY_MANIFESTS.includes(file));
}

/** Collects every declared package name from a parsed package.json manifest. */
export function collectDependencyNames(manifest) {
  return [
    ...Object.keys(manifest?.dependencies ?? {}),
    ...Object.keys(manifest?.devDependencies ?? {}),
  ];
}

/**
 * Returns the declared dependencies that are not installed. `isInstalled` reports
 * whether a given package name is present in node_modules. This is what catches an
 * already-pulled-but-never-installed package such as "three", so the dev server can
 * self-heal on startup instead of forcing a manual `npm install`.
 */
export function findMissingDependencies(dependencyNames, isInstalled) {
  return dependencyNames.filter((name) => !isInstalled(name));
}

let child;
let shuttingDown = false;
let updateInProgress = false;

function runGit(args) {
  return spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function gitOutput(args) {
  const result = runGit(args);
  return result.status === 0 ? result.stdout.trim() : "";
}

function changedFilesBetween(fromRef, toRef) {
  const output = gitOutput(["diff", "--name-only", fromRef, toRef]);
  return output ? output.split("\n").filter(Boolean) : [];
}

function installDependencies(reason) {
  // Use `npm ci` rather than `npm install`: it restores node_modules to exactly
  // match package-lock.json without mutating the lockfile, which keeps the
  // working tree clean for the auto-updater's subsequent `git pull --ff-only`.
  console.log(`[auto-update] ${reason}; running npm ci`);
  const install = spawnSync("npm", ["ci"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  if (install.status !== 0) {
    console.warn(`[auto-update] npm ci exited with code ${install.status ?? install.signal}`);
  }
}

/** Reads and parses package.json from the current working directory, or null if unreadable. */
function readManifest() {
  try {
    return JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
  } catch (error) {
    console.warn(`[auto-update] could not read package.json: ${error.message}`);
    return null;
  }
}

/**
 * Installs dependencies when node_modules is missing any declared package. This
 * clears an already-broken checkout (e.g. a pulled commit added "three" but
 * node_modules was never refreshed) that surfaces as "Failed to resolve import".
 */
function ensureDependenciesInstalled() {
  const manifest = readManifest();
  if (!manifest) {
    return;
  }

  const nodeModules = path.join(process.cwd(), "node_modules");
  const missing = findMissingDependencies(collectDependencyNames(manifest), (name) =>
    existsSync(path.join(nodeModules, ...name.split("/"))),
  );

  if (missing.length > 0) {
    installDependencies(`missing dependencies detected (${missing.join(", ")})`);
  }
}

function startServer() {
  child = spawn(CHILD_COMMAND, CHILD_ARGS, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    child = undefined;

    if (!shuttingDown && !updateInProgress) {
      console.log(`[auto-update] dev server exited (${signal ?? code}); restarting`);
      startServer();
    }
  });
}

function stopServer() {
  if (!child || child.killed) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const runningChild = child;
    const timeout = setTimeout(() => {
      runningChild.kill("SIGKILL");
      resolve();
    }, 5_000);

    runningChild.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    runningChild.kill("SIGTERM");
  });
}

function hasCleanWorktree() {
  return gitOutput(["status", "--porcelain"]) === "";
}

function getUpstream() {
  return gitOutput(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
}

function isBehindUpstream(upstream) {
  const local = gitOutput(["rev-parse", "HEAD"]);
  const remote = gitOutput(["rev-parse", upstream]);

  return Boolean(local && remote && local !== remote);
}

async function checkForUpdates() {
  if (updateInProgress || shuttingDown) {
    return;
  }

  const upstream = getUpstream();
  if (!upstream) {
    return;
  }

  updateInProgress = true;
  try {
    const fetch = runGit(["fetch", "--quiet"]);
    if (fetch.status !== 0) {
      console.warn(`[auto-update] git fetch failed: ${fetch.stderr.trim()}`);
      return;
    }

    if (!isBehindUpstream(upstream)) {
      return;
    }

    if (!hasCleanWorktree()) {
      console.warn("[auto-update] upstream updates found, but the worktree is dirty; skipping auto-pull");
      return;
    }

    console.log(`[auto-update] pulling updates from ${upstream}`);
    await stopServer();

    const previousHead = gitOutput(["rev-parse", "HEAD"]);
    const pull = runGit(["pull", "--ff-only"]);
    if (pull.status !== 0) {
      console.warn(`[auto-update] git pull failed: ${pull.stderr.trim()}`);
    } else {
      process.stdout.write(pull.stdout);

      // Install any newly added packages before restarting so Vite can resolve
      // them; skipping this is what surfaces as "Failed to resolve import".
      const newHead = gitOutput(["rev-parse", "HEAD"]);
      const changedFiles = previousHead && newHead ? changedFilesBetween(previousHead, newHead) : [];
      if (shouldReinstallDependencies(changedFiles)) {
        installDependencies("dependency manifest changed");
      }
    }

    if (!shuttingDown) {
      startServer();
    }
  } finally {
    updateInProgress = false;
  }
}

async function shutdown(signal) {
  shuttingDown = true;
  clearInterval(interval);
  await stopServer();
  process.exit(signal === "SIGINT" ? 130 : 143);
}

let interval;

function bootstrap() {
  // Self-heal a stale checkout before the dev server starts, so an already-pulled
  // dependency that was never installed doesn't crash Vite on first launch.
  ensureDependenciesInstalled();
  startServer();
  interval = setInterval(() => {
    void checkForUpdates();
  }, CHECK_INTERVAL_MS);
  void checkForUpdates();

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

// Only run the server/updater loop when invoked directly (npm run dev), not when
// imported by tests.
const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  bootstrap();
}

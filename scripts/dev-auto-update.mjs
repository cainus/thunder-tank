import { spawn, spawnSync } from "node:child_process";
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

function installDependencies() {
  console.log("[auto-update] dependency manifest changed; running npm install");
  const install = spawnSync("npm", ["install"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  if (install.status !== 0) {
    console.warn(`[auto-update] npm install exited with code ${install.status ?? install.signal}`);
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
        installDependencies();
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

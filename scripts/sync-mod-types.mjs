// Regenerates the gitignored .claude-plugin/types/ folder. Claude Code writes
// the mod type declarations only when an interactive session loads this folder,
// so the script starts the installed Claude Code on the repository inside a
// pseudo-terminal and stops it once the declarations appear.

import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const typesDir = join(root, ".claude-plugin", "types");
const indexPath = join(typesDir, "claude-code", "index.d.ts");
const tsconfigPath = join(typesDir, "tsconfig.json");
const timeoutMs = 90_000;
const pollMs = 500;
const stopGraceMs = 5_000;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function shellQuote(text) {
  return `'${text.replaceAll("'", `'\\''`)}'`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (process.platform === "win32") {
  fail("sync-mod-types supports macOS and Linux only. Run it from a macOS or Linux checkout.");
}

const claudeVersion = execFileSync("claude", ["--version"], { encoding: "utf8" }).trim().split(/\s+/)[0];
if (!/^\d+\.\d+\.\d+$/.test(claudeVersion ?? "")) {
  fail(`Could not read the installed Claude Code version from "claude --version".`);
}
const marker = `// Written by Claude Code ${claudeVersion}.`;

rmSync(typesDir, { recursive: true, force: true });

// Claude Code runs in the pseudo-terminal's own session, so signalling the
// `script` group does not reach it. Its processes are found by command line,
// and only those that were not running before this script started are stopped.
function sessionPids() {
  const listing = execFileSync("ps", ["-axo", "pid=,args="], { encoding: "utf8" });
  const command = `claude --plugin-dir ${root}`;
  return listing.split("\n").flatMap((line) => {
    const match = /^\s*(\d+)\s+(.*)$/.exec(line);
    return match && match[2] === command ? [Number(match[1])] : [];
  });
}

const sessionsBefore = new Set(sessionPids());

// `script` gives Claude Code a pseudo-terminal. Its stdin is /dev/null: with a
// pipe as stdin, `script` exits at once and the session never starts.
const argv =
  process.platform === "darwin"
    ? ["script", "-q", "/dev/null", "claude", "--plugin-dir", root]
    : ["script", "-qec", `claude --plugin-dir ${shellQuote(root)}`, "/dev/null"];
const child = spawn(argv[0], argv.slice(1), {
  cwd: root,
  detached: true,
  stdio: ["ignore", "ignore", "ignore"],
});

let exited = false;
child.once("exit", () => {
  exited = true;
});

function signalGroup(signal) {
  try {
    process.kill(-child.pid, signal);
  } catch {
    // The group has already gone.
  }
}

function ownSessions() {
  return sessionPids().filter((pid) => !sessionsBefore.has(pid));
}

function signalPids(pids, signal) {
  for (const pid of pids) {
    try {
      process.kill(pid, signal);
    } catch {
      // The process has already exited.
    }
  }
}

async function waitUntil(done, ms) {
  const deadline = Date.now() + ms;
  while (!done() && Date.now() < deadline) await sleep(250);
  return done();
}

async function stopChild() {
  const finished = () => exited && ownSessions().length === 0;
  signalGroup("SIGTERM");
  signalPids(ownSessions(), "SIGTERM");
  if (await waitUntil(finished, stopGraceMs)) return;
  signalGroup("SIGKILL");
  signalPids(ownSessions(), "SIGKILL");
  await waitUntil(finished, stopGraceMs);
}

function typesWritten() {
  if (!existsSync(tsconfigPath) || !existsSync(indexPath)) return false;
  return readFileSync(indexPath, "utf8").split(/\r?\n/, 1)[0] === marker;
}

const deadline = Date.now() + timeoutMs;
while (!typesWritten()) {
  if (exited) {
    await stopChild();
    fail("Claude Code exited before it wrote the mod type declarations.");
  }
  if (Date.now() >= deadline) {
    await stopChild();
    fail(
      `No mod type declarations matched Claude Code ${claudeVersion} after 90 seconds. ` +
        "Open `claude --plugin-dir .` once in this folder to trust it, then run this script again.",
    );
  }
  await sleep(pollMs);
}

await stopChild();
console.log(`Wrote mod type declarations for Claude Code ${claudeVersion} to .claude-plugin/types/.`);
process.exit(0);

#!/usr/bin/env node
// Regenerates the gitignored .claude-plugin/types/ by starting the installed
// Claude Code on this folder in a pseudo-terminal. Claude Code lays the mod
// type declarations down only when an interactive session loads the folder.

import { spawn, execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const typesDir = join(root, ".claude-plugin", "types");
const POLL_MS = 500;
const TIMEOUT_MS = 90_000;
const KILL_AFTER_MS = 5_000;

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function shellQuote(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function installedVersion() {
  const output = execFileSync("claude", ["--version"], { encoding: "utf8" });
  const match = output.match(/^(\d+\.\d+\.\d+)/);
  if (!match) {
    throw new Error(`Could not read the Claude Code version from "claude --version": ${output.trim()}`);
  }
  return match[1];
}

function typesReady(version) {
  const declaration = join(typesDir, "claude-code", "index.d.ts");
  const tsconfig = join(typesDir, "tsconfig.json");
  if (!existsSync(declaration) || !existsSync(tsconfig)) {
    return false;
  }
  const firstLine = readFileSync(declaration, "utf8").split("\n", 1)[0].trim();
  return firstLine === `// Written by Claude Code ${version}.`;
}

function startClaude() {
  const claudeCommand = ["claude", "--plugin-dir", root];
  const args =
    process.platform === "darwin"
      ? ["-q", "/dev/null", ...claudeCommand]
      : ["-qec", claudeCommand.map(shellQuote).join(" "), "/dev/null"];
  return spawn("script", args, { cwd: root, stdio: "ignore" });
}

function stopChild(child) {
  return new Promise((done) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      done();
      return;
    }
    const killTimer = setTimeout(() => child.kill("SIGKILL"), KILL_AFTER_MS);
    child.once("exit", () => {
      clearTimeout(killTimer);
      done();
    });
    child.kill("SIGTERM");
  });
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function main() {
  if (process.platform !== "darwin" && process.platform !== "linux") {
    throw new Error("sync-mod-types supports macOS and Linux only.");
  }

  const version = installedVersion();
  rmSync(typesDir, { recursive: true, force: true });

  const child = startClaude();
  try {
    const deadline = Date.now() + TIMEOUT_MS;
    while (!typesReady(version)) {
      if (Date.now() >= deadline) {
        throw new Error(
          `Timed out after 90 s waiting for Claude Code ${version} to write .claude-plugin/types/. ` +
            "Open `claude --plugin-dir .` once in this folder to trust it, then run npm run types:sync again.",
        );
      }
      await sleep(POLL_MS);
    }
  } finally {
    await stopChild(child);
  }
  console.log(`Wrote .claude-plugin/types/ for Claude Code ${version}.`);
}

main().catch((error) => fail(error.message));

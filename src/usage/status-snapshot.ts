import type { HostPort } from "../host.ts";
import type { UsageReport } from "./report.ts";

// The routed status for a custom `statusLine` command: one JSON file per session under the Claude config
// directory. It holds the shown provider's usage windows and names only, never a token, key, account name or
// account id. Writes queue in call order, and every failure is swallowed, so a snapshot never changes a step.

export type StatusSnapshotWindow = {
  readonly label: string;
  readonly usedPercent: number;
  // Epoch milliseconds.
  readonly resetsAt?: number;
};

// A Claude main-loop step writes the snapshot cleared, with no provider and no model.
export type StatusSnapshot = {
  readonly version: 1;
  readonly sessionId: string;
  readonly provider?: string;
  readonly model?: string;
  readonly windows: readonly StatusSnapshotWindow[];
};

export type StatusSnapshotWriter = {
  // Publishes a routed main-loop state: its provider, its model, and the windows of its usage report, if any.
  show(sessionId: string, provider: string, model: string, usage: UsageReport | undefined): void;
  // Clears a session's windows, for a Claude main-loop step.
  clear(sessionId: string): void;
};

const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;

function separatorOf(platform: string): string {
  return platform === "windows" ? "\\" : "/";
}

function statusDirOf(configDir: string, platform: string): string {
  return [configDir, "nmg-router", "status"].join(separatorOf(platform));
}

// The file a session's snapshot is written to. A session id that could name another path gets no file.
export function snapshotPath(configDir: string, sessionId: string, platform: string): string | undefined {
  if (!SESSION_ID.test(sessionId)) return undefined;
  return `${statusDirOf(configDir, platform)}${separatorOf(platform)}${sessionId}.json`;
}

// `CLAUDE_CONFIG_DIR` when set, else `.claude` under the home folder: `USERPROFILE`, then `HOME`, on Windows.
async function configDirOf(host: Pick<HostPort, "env">, platform: string): Promise<string | undefined> {
  const configured = await host.env.get("CLAUDE_CONFIG_DIR");
  if (configured) return configured;
  const home =
    platform === "windows" ? (await host.env.get("USERPROFILE")) || (await host.env.get("HOME")) : await host.env.get("HOME");
  return home ? `${home}${separatorOf(platform)}.claude` : undefined;
}

function windowsOf(usage: UsageReport | undefined): StatusSnapshotWindow[] {
  return (usage?.windows ?? []).map(({ label, usedPercent, resetsAt }) => ({ label, usedPercent, resetsAt }));
}

function randomHex(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// On macOS and Linux a write makes the folder 0700, writes a unique temporary file, sets it 0600 and moves it over the
// snapshot. On Windows the file is written in place, and the host creates the folder.
export function createStatusSnapshotWriter(
  host: Pick<HostPort, "env" | "fs" | "process">,
  platform: () => Promise<string>,
): StatusSnapshotWriter {
  const nonce = randomHex();
  let written = 0;
  let queue: Promise<void> = Promise.resolve();

  // A step whose process exits non-zero ends the write there.
  async function run(argv: readonly string[]): Promise<boolean> {
    return (await host.process.run(argv)).exitCode === 0;
  }

  async function write(snapshot: StatusSnapshot): Promise<void> {
    const os = await platform();
    const configDir = await configDirOf(host, os);
    if (configDir === undefined) return;
    const path = snapshotPath(configDir, snapshot.sessionId, os);
    if (path === undefined) return;
    const text = `${JSON.stringify(snapshot, null, 2)}\n`;
    if (os === "windows") {
      await host.fs.write(path, text);
      return;
    }
    const dir = statusDirOf(configDir, os);
    const temp = `${path}.${nonce}.${++written}.tmp`;
    if (!(await run(["mkdir", "-p", "-m", "700", dir]))) return;
    if (!(await run(["chmod", "700", dir]))) return;
    await host.fs.write(temp, text);
    if (!(await run(["chmod", "600", temp]))) return;
    await run(["mv", "-f", temp, path]);
  }

  // Each snapshot is built at its call, and each write waits for the one before it.
  function enqueue(snapshot: StatusSnapshot): void {
    queue = queue.then(() => write(snapshot)).catch(() => undefined);
  }

  return {
    show(sessionId, provider, model, usage) {
      enqueue({ version: 1, sessionId, provider, model, windows: windowsOf(usage) });
    },
    clear(sessionId) {
      enqueue({ version: 1, sessionId, windows: [] });
    },
  };
}

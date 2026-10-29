import { describe, expect, it } from "vitest";
import type { UsageReport } from "../../src/usage/report.ts";
import { createStatusSnapshotWriter, snapshotPath } from "../../src/usage/status-snapshot.ts";
import { fakeEngine, type FakeOptions } from "../support/fake-engine.ts";

// The snapshot writer on a faked engine: the file it writes, the process calls it makes, and the failures it swallows.
const SESSION = "session-7";
const MODEL = "opencode-go/kimi-k3.1-pro";
const STATUS_DIR = "/home/tester/.claude/nmg-router/status";
const OK = { exitCode: 0, stdout: "", stderr: "", isStdoutTruncated: false, isStderrTruncated: false };
const USAGE: UsageReport = {
  windows: [
    { id: "rolling", label: "5h", usedPercent: 12, resetsAt: 1798000000000 },
    { id: "weekly", label: "weekly", usedPercent: 41 },
  ],
};

type Run = NonNullable<FakeOptions["run"]>;

// `mv` is absent from the fake's default commands, so the writer's move succeeds unless the test answers it.
function engineWith(platform: FakeOptions["platform"], run?: Run, env?: FakeOptions["env"]) {
  return fakeEngine({ platform, env, run: (argv) => run?.(argv) ?? (argv[0] === "mv" ? OK : undefined) });
}

const linux = (): Promise<string> => Promise.resolve("linux");
// Every step of a write is a microtask on the fake, so one macrotask turn lets the queued writes finish.
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe("snapshotPath", () => {
  it("names the session's file under the status folder, with the platform's separator", () => {
    expect(snapshotPath("/home/tester/.claude", SESSION, "linux")).toBe(`${STATUS_DIR}/session-7.json`);
    expect(snapshotPath("C:\\Users\\tester\\.claude", SESSION, "windows")).toBe("C:\\Users\\tester\\.claude\\nmg-router\\status\\session-7.json");
  });

  it("accepts a session id of 1 to 128 letters, digits, _ or -", () => {
    expect(snapshotPath("/c", "a".repeat(128), "linux")).toBeDefined();
    expect(snapshotPath("/c", "A_9-z", "linux")).toBeDefined();
  });

  it.each(["../x", "", "a".repeat(129), "a/b", "a\n"])("names no file for the session id %j", (sessionId) => {
    expect(snapshotPath("/c", sessionId, "linux")).toBeUndefined();
  });
});

describe("the status snapshot writer", () => {
  it("writes the version-1 snapshot through a temp file, set to 0600 and moved over the snapshot, on Linux", async () => {
    const engine = engineWith("linux");

    createStatusSnapshotWriter(engine, linux).show(SESSION, "opencode-go", MODEL, USAGE);
    await settle();

    const temp = engine.recorded.fsWrites[0]?.path ?? "";
    expect(temp).toMatch(new RegExp(`^${STATUS_DIR}/session-7\\.json\\.[0-9a-f]{16}\\.1\\.tmp$`));
    expect(JSON.parse(engine.recorded.fsWrites[0]?.text ?? "")).toEqual({
      version: 1,
      sessionId: SESSION,
      provider: "opencode-go",
      model: MODEL,
      windows: [
        { label: "5h", usedPercent: 12, resetsAt: 1798000000000 },
        { label: "weekly", usedPercent: 41 },
      ],
    });
    expect(engine.recorded.events).toEqual([
      `process:mkdir -p -m 700 ${STATUS_DIR}`,
      `process:chmod 700 ${STATUS_DIR}`,
      `write:${temp}`,
      `process:chmod 600 ${temp}`,
      `process:mv -f ${temp} ${STATUS_DIR}/session-7.json`,
    ]);
  });

  it("writes under CLAUDE_CONFIG_DIR when it is set", async () => {
    const engine = engineWith("linux", undefined, { CLAUDE_CONFIG_DIR: "/opt/claude" });

    createStatusSnapshotWriter(engine, linux).show(SESSION, "opencode-go", MODEL, USAGE);
    await settle();

    expect(engine.recorded.processes[0]?.argv).toEqual(["mkdir", "-p", "-m", "700", "/opt/claude/nmg-router/status"]);
    expect(engine.recorded.fsWrites.map((write) => write.path)).toEqual([
      expect.stringMatching(/^\/opt\/claude\/nmg-router\/status\/session-7\.json\.[0-9a-f]{16}\.1\.tmp$/),
    ]);
  });

  it("writes the file in place on Windows, under the user's .claude folder, with no process call", async () => {
    const engine = engineWith("windows");

    createStatusSnapshotWriter(engine, () => Promise.resolve("windows")).show(SESSION, "opencode-go", MODEL, USAGE);
    await settle();

    expect(engine.recorded.fsWrites.map((write) => write.path)).toEqual(["C:\\Users\\tester\\.claude\\nmg-router\\status\\session-7.json"]);
    expect(engine.recorded.processes).toEqual([]);
  });

  it("writes nothing when there is no home folder to hold the snapshot", async () => {
    const engine = engineWith("linux", undefined, { HOME: undefined });

    createStatusSnapshotWriter(engine, linux).show(SESSION, "opencode-go", MODEL, USAGE);
    await settle();

    expect(engine.recorded.fsWrites).toEqual([]);
    expect(engine.recorded.processes).toEqual([]);
  });

  it("writes a clear after a show, in call order, with no provider, model or windows", async () => {
    const engine = engineWith("linux");
    const writer = createStatusSnapshotWriter(engine, linux);

    writer.show(SESSION, "opencode-go", MODEL, USAGE);
    writer.clear(SESSION);
    await settle();

    const [shown, cleared] = engine.recorded.fsWrites.map((write) => JSON.parse(write.text) as Record<string, unknown>);
    expect(engine.recorded.fsWrites.map((write) => write.path)).toEqual([
      expect.stringMatching(/\.1\.tmp$/),
      expect.stringMatching(/\.2\.tmp$/),
    ]);
    expect(shown).toMatchObject({ provider: "opencode-go", model: MODEL });
    expect(cleared).toEqual({ version: 1, sessionId: SESSION, windows: [] });
    expect(Object.keys(cleared ?? {})).toEqual(["version", "sessionId", "windows"]);
  });

  it("writes only the snapshot's own fields, with no account, token or key", async () => {
    const engine = engineWith("linux");

    createStatusSnapshotWriter(engine, linux).show(SESSION, "opencode-go", MODEL, USAGE);
    await settle();

    const snapshot = JSON.parse(engine.recorded.fsWrites[0]?.text ?? "") as { windows: Record<string, unknown>[] } & Record<string, unknown>;
    expect(Object.keys(snapshot).sort()).toEqual(["model", "provider", "sessionId", "version", "windows"]);
    for (const window of snapshot.windows) {
      for (const key of Object.keys(window)) expect(["label", "usedPercent", "resetsAt"]).toContain(key);
    }
  });

  it.each(["../x", "", "a".repeat(129)])("writes no file for the session id %j", async (sessionId) => {
    const engine = engineWith("linux");

    createStatusSnapshotWriter(engine, linux).show(sessionId, "opencode-go", MODEL, USAGE);
    await settle();

    expect(engine.recorded.fsWrites).toEqual([]);
    expect(engine.recorded.processes).toEqual([]);
  });

  it("writes nothing and does not throw when mkdir exits non-zero", async () => {
    const engine = engineWith("linux", (argv) => (argv[0] === "mkdir" ? { ...OK, exitCode: 1, stderr: "denied" } : undefined));
    const writer = createStatusSnapshotWriter(engine, linux);

    expect(() => writer.show(SESSION, "opencode-go", MODEL, USAGE)).not.toThrow();
    await settle();

    expect(engine.recorded.fsWrites).toEqual([]);
  });

  it("writes nothing and does not throw when mkdir cannot start", async () => {
    const engine = engineWith("linux", (argv) => {
      if (argv[0] === "mkdir") throw new Error("spawn mkdir EACCES");
      return undefined;
    });

    createStatusSnapshotWriter(engine, linux).show(SESSION, "opencode-go", MODEL, USAGE);
    await settle();

    expect(engine.recorded.fsWrites).toEqual([]);
  });

  it("writes nothing and does not throw when the platform cannot be read", async () => {
    const engine = engineWith("linux");

    expect(() => createStatusSnapshotWriter(engine, () => Promise.reject(new Error("no uname"))).show(SESSION, "opencode-go", MODEL, USAGE)).not.toThrow();
    await settle();

    expect(engine.recorded.fsWrites).toEqual([]);
  });

  it("still writes the next snapshot after an earlier write failed", async () => {
    let failMkdir = true;
    const engine = engineWith("linux", (argv) => {
      if (argv[0] !== "mkdir" || !failMkdir) return undefined;
      failMkdir = false;
      return { ...OK, exitCode: 1, stderr: "denied" };
    });
    const writer = createStatusSnapshotWriter(engine, linux);

    writer.show(SESSION, "opencode-go", MODEL, USAGE);
    writer.clear(SESSION);
    await settle();

    expect(engine.recorded.fsWrites).toHaveLength(1);
    expect(JSON.parse(engine.recorded.fsWrites[0]?.text ?? "")).toEqual({ version: 1, sessionId: SESSION, windows: [] });
  });
});

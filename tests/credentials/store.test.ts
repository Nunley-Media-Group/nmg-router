import { describe, expect, it } from "vitest";
import { createCredentialStore } from "../../src/credentials/store.ts";
import { CredentialError } from "../../src/errors/errors.ts";
import { fakeEngine, writtenText, type FakePlatform } from "../support/fake-engine.ts";
import { assertNoSentinel, makeSentinel } from "../support/sentinel.ts";

const PLATFORMS: FakePlatform[] = ["macos", "windows", "linux", "other"];
const NATIVE_TOOLS = ["security", "powershell.exe", "secret-tool"];

const VAULT_DIRECTORY: Record<FakePlatform, string> = {
  macos: "/Users/tester/Library/Application Support/nmg-router",
  windows: "C:\\Users\\tester\\AppData\\Local\\nmg-router",
  linux: "/home/tester/.local/share/nmg-router",
  other: "/home/tester/.local/share/nmg-router",
};

const LINUX_DIR = VAULT_DIRECTORY.linux;
const LINUX_KEY = `${LINUX_DIR}/vault.key`;
const LINUX_VAULT = `${LINUX_DIR}/vault.json`;

function vaultPaths(platform: FakePlatform): { keyPath: string; vaultPath: string } {
  const dir = VAULT_DIRECTORY[platform];
  const sep = platform === "windows" ? "\\" : "/";
  return { keyPath: `${dir}${sep}vault.key`, vaultPath: `${dir}${sep}vault.json` };
}

describe("encrypted vault on every OS", () => {
  it.each(PLATFORMS)("saves, reads, lists and deletes on %s, writing only the vault files", async (platform) => {
    const engine = fakeEngine({ platform });
    const store = createCredentialStore(engine);
    const secret = makeSentinel();
    const { keyPath, vaultPath } = vaultPaths(platform);

    await store.save("opencode-go", "default", secret);
    expect(writtenText(engine, keyPath)).toBeDefined();
    expect(writtenText(engine, vaultPath)).toBeDefined();
    expect(writtenText(engine, vaultPath)).not.toContain(secret);
    expect(await store.read("opencode-go", "default")).toBe(secret);
    expect(await store.list("opencode-go")).toEqual([{ provider: "opencode-go", account: "default" }]);

    await store.delete("opencode-go", "default");
    const entries = JSON.parse(writtenText(engine, vaultPath) ?? "{}").entries;
    expect(Object.keys(entries)).not.toContain("opencode-go/default");
    expect(await store.read("opencode-go", "default")).toBeUndefined();
    expect(await store.list()).toEqual([]);

    const tools = engine.recorded.processes.map((call) => call.argv[0]);
    for (const tool of NATIVE_TOOLS) expect(tools).not.toContain(tool);
    assertNoSentinel(engine, secret);
  });
});

describe("vault protections on POSIX through the store", () => {
  it("creates the owner-only directory before any write, and sets each written file to 600", async () => {
    const engine = fakeEngine({ platform: "linux" });

    await createCredentialStore(engine).save("opencode-go", "default", makeSentinel());

    const events = engine.recorded.events;
    const mkdirAt = events.indexOf(`process:mkdir -p -m 700 ${LINUX_DIR}`);
    const firstWriteAt = events.findIndex((event) => event.startsWith("write:"));
    expect(mkdirAt).toBeGreaterThanOrEqual(0);
    expect(mkdirAt).toBeLessThan(firstWriteAt);
    for (const [index, event] of events.entries()) {
      if (!event.startsWith("write:")) continue;
      expect(events[index + 1]).toBe(`process:chmod 600 ${event.slice("write:".length)}`);
    }
  });

  it("raises vault_failed and writes nothing when the owner-only directory cannot be made", async () => {
    const engine = fakeEngine({
      platform: "linux",
      run: (argv) =>
        argv[0] === "mkdir"
          ? { exitCode: 1, stdout: "", stderr: "permission denied", isStdoutTruncated: false, isStderrTruncated: false }
          : undefined,
    });

    const error: unknown = await createCredentialStore(engine)
      .save("opencode-go", "default", "secret")
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "vault_failed", platform: "linux", provider: "opencode-go" });
    expect(engine.recorded.fsWrites).toEqual([]);
    expect(engine.recorded.storeWrites).toEqual([]);
  });

  it("raises vault_failed and writes nothing for a malformed key beside existing entries", async () => {
    const seeded = fakeEngine({ platform: "linux" });
    await createCredentialStore(seeded).save("opencode-go", "default", "secret");
    const engine = fakeEngine({
      platform: "linux",
      files: { [LINUX_KEY]: "AAAA", [LINUX_VAULT]: writtenText(seeded, LINUX_VAULT) ?? "" },
    });

    const error: unknown = await createCredentialStore(engine)
      .save("clinepass", "work", "new-secret")
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "vault_failed" });
    expect(engine.recorded.fsWrites).toEqual([]);
    expect(engine.recorded.storeWrites).toEqual([]);
  });
});

describe("refusals before any backend", () => {
  it("refuses provider anthropic for save, read and delete without probing or writing anything", async () => {
    const engine = fakeEngine({ platform: "macos" });
    const store = createCredentialStore(engine);

    await expect(store.save("anthropic", "default", "secret")).rejects.toMatchObject({ code: "anthropic_refused" });
    await expect(store.read("anthropic", "default")).rejects.toMatchObject({ code: "anthropic_refused" });
    await expect(store.delete("anthropic", "default")).rejects.toMatchObject({ code: "anthropic_refused" });

    expect(engine.recorded.processes).toEqual([]);
    expect(engine.recorded.fsWrites).toEqual([]);
    expect(engine.recorded.storeWrites).toEqual([]);
  });

  it("refuses an invalid id without echoing it", async () => {
    const engine = fakeEngine({ platform: "linux" });
    const error: unknown = await createCredentialStore(engine)
      .save("Open Code", "default", "secret")
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CredentialError);
    expect(error).toMatchObject({ code: "invalid_id" });
    expect((error as Error).message).not.toContain("Open Code");
    expect(engine.recorded.processes).toEqual([]);
  });
});

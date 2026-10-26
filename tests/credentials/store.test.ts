import { describe, expect, it } from "vitest";
import { createCredentialStore } from "../../src/credentials/store.ts";
import { CredentialError } from "../../src/errors/errors.ts";
import { fakeEngine, writtenText, type FakePlatform, type KeyringState } from "../support/fake-engine.ts";
import { assertNoSentinel, makeSentinel } from "../support/sentinel.ts";

const KEYRING_TOOL: Record<"macos" | "windows" | "linux", string> = {
  macos: "security",
  windows: "powershell.exe",
  linux: "secret-tool",
};

describe("keyring round trip", () => {
  it.each(["macos", "windows", "linux"] as const)(
    "saves, reads and deletes on %s through its keyring tool, keeping the secret out of argv and env",
    async (platform) => {
      const engine = fakeEngine({ platform });
      const store = createCredentialStore(engine);
      const secret = makeSentinel();

      await store.save("opencode-go", "default", secret);
      expect(await store.read("opencode-go", "default")).toBe(secret);
      expect(await store.list("opencode-go")).toEqual([{ provider: "opencode-go", account: "default" }]);

      await store.delete("opencode-go", "default");
      expect(await store.read("opencode-go", "default")).toBeUndefined();
      expect(await store.list()).toEqual([]);

      const tools = engine.recorded.processes.map((call) => call.argv[0]);
      expect(tools).toContain(KEYRING_TOOL[platform]);
      const addressed = engine.recorded.processes
        .filter((call) => call.argv[0] === KEYRING_TOOL[platform])
        .map((call) => `${call.argv.join(" ")} ${call.stdin ?? ""}`)
        .join("\n");
      expect(addressed).toContain("nmg-router");
      expect(addressed).toContain("opencode-go/default");
      assertNoSentinel(engine, secret);
    },
  );
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

describe("keyring refusals", () => {
  it.each([
    ["macos", "locked", "keyring_locked"],
    ["linux", "locked", "keyring_locked"],
    ["macos", "failing", "keyring_failed"],
    ["linux", "failing", "keyring_failed"],
    ["windows", "failing", "keyring_failed"],
  ] as const)(
    "%s keyring %s raises %s and changes no file, store key or setting",
    async (platform: FakePlatform, keyring: KeyringState, code) => {
      const engine = fakeEngine({ platform, keyring });
      const store = createCredentialStore(engine);
      const secret = makeSentinel();

      const error: unknown = await store.save("opencode-go", "default", secret).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(CredentialError);
      expect(error).toMatchObject({ code, platform, provider: "opencode-go" });
      expect((error as Error).message).toContain(platform);
      expect((error as Error).message).toContain("opencode-go");
      expect(engine.recorded.fsWrites).toEqual([]);
      expect(engine.recorded.storeWrites).toEqual([]);
      expect(engine.recorded.settingsWrites).toEqual([]);
      assertNoSentinel(engine, secret, [error]);
    },
  );

  it("does not fall back to the vault when the keyring is locked", async () => {
    const engine = fakeEngine({ platform: "linux", keyring: "locked" });
    const store = createCredentialStore(engine);

    await expect(store.read("opencode-go", "default")).rejects.toMatchObject({ code: "keyring_locked" });
    expect(engine.recorded.fsWrites).toEqual([]);
    expect(engine.recorded.processes.map((call) => call.argv[0])).not.toContain("mkdir");
  });
});

describe("no keyring", () => {
  it.each(["macos", "linux", "windows", "other"] as const)(
    "%s with no keyring round-trips through the vault and records the index",
    async (platform) => {
      const engine = fakeEngine({ platform, keyring: "absent" });
      const store = createCredentialStore(engine);
      const secret = makeSentinel();

      await store.save("opencode-go", "default", secret);
      expect(await store.read("opencode-go", "default")).toBe(secret);
      expect(await store.list("opencode-go")).toEqual([{ provider: "opencode-go", account: "default" }]);

      const written = engine.recorded.fsWrites.map((write) => write.path);
      expect(written.some((path) => path.endsWith("vault.json"))).toBe(true);
      expect(written.some((path) => path.endsWith("vault.key"))).toBe(true);
      assertNoSentinel(engine, secret);
    },
  );

  it("uses the Linux data home and the POSIX file modes when no Secret Service is present", async () => {
    const engine = fakeEngine({ platform: "linux", env: { DBUS_SESSION_BUS_ADDRESS: undefined } });
    const store = createCredentialStore(engine);

    await store.save("opencode-go", "default", "secret");

    expect(engine.recorded.events).toContain("process:mkdir -p -m 700 /home/tester/.local/share/nmg-router");
    expect(writtenText(engine, "/home/tester/.local/share/nmg-router/vault.json")).toBeDefined();
  });
});

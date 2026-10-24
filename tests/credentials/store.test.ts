import { describe, expect, it } from "vitest";
import { CredentialError } from "../../src/errors/errors.ts";
import { createCredentialStore } from "../../src/credentials/store.ts";
import { fakeEngine } from "../support/fake-engine.ts";

const SECRET = "opencode-go-key-value-1";
const KEYRING_TOOL: Record<"macos" | "windows" | "linux", string> = {
  macos: "security",
  windows: "powershell.exe",
  linux: "secret-tool",
};

async function errorOf(promise: Promise<unknown>): Promise<CredentialError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof CredentialError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected a CredentialError");
}

describe.each(["macos", "windows", "linux"] as const)("OS keyring on %s", (os) => {
  it("saves, reads and deletes through the platform keyring tool with no secret in argv or env", async () => {
    const engine = fakeEngine({ os });
    const store = createCredentialStore(engine);

    await store.save("opencode-go", "work", SECRET);
    expect(await store.read("opencode-go", "work")).toBe(SECRET);
    await store.delete("opencode-go", "work");
    expect(await store.read("opencode-go", "work")).toBeUndefined();

    const tool = KEYRING_TOOL[os];
    expect(engine.calls.some((call) => call.argv[0] === tool)).toBe(true);
    const argvLines = engine.calls.map((call) => call.argv.join(" "));
    const serviceAndAccount =
      os === "macos"
        ? "-s nmg-router -a opencode-go/work"
        : os === "linux"
          ? "service nmg-router account opencode-go/work"
          : "";
    if (os === "windows") {
      expect(engine.stdins.some((stdin) => stdin.includes("$target = 'nmg-router:opencode-go/work'"))).toBe(true);
    } else {
      expect(argvLines.some((line) => line.includes(serviceAndAccount))).toBe(true);
    }
    expect(argvLines.some((line) => line.includes(SECRET))).toBe(false);
    expect(engine.calls.every((call) => !JSON.stringify(call.env ?? {}).includes(SECRET))).toBe(true);
    expect(engine.files.size).toBe(0);
  });
});

describe("no keyring", () => {
  it("saves and reads through the encrypted vault, with the directory made owner-only before any write", async () => {
    const engine = fakeEngine({ os: "macos", keyring: "absent" });
    const store = createCredentialStore(engine);
    const directory = "/Users/tester/Library/Application Support/nmg-router";

    await store.save("opencode-go", "work", SECRET);

    expect(await store.read("opencode-go", "work")).toBe(SECRET);
    const firstWrite = engine.timeline.findIndex((entry) => entry.startsWith("write:"));
    expect(engine.timeline.indexOf(`run:mkdir -p -m 700 ${directory}`)).toBeLessThan(firstWrite);
    expect(engine.timeline.filter((entry) => entry.startsWith("run:chmod 600 "))).toHaveLength(2);
    const lastWrite = engine.timeline.lastIndexOf("write:" + `${directory}/vault.json`);
    expect(engine.timeline.indexOf(`run:chmod 600 ${directory}/vault.json`)).toBeGreaterThan(lastWrite);
    const vaultJson = engine.files.get(`${directory}/vault.json`) ?? "";
    expect(vaultJson).toContain("opencode-go/work");
    expect(vaultJson.includes(SECRET)).toBe(false);
    expect(engine.files.get(`${directory}/vault.key`)?.includes(SECRET)).toBe(false);
  });

  it("refuses a keyring that is locked, with no vault fallback and nothing written", async () => {
    const engine = fakeEngine({ os: "macos", keyring: "locked" });
    const store = createCredentialStore(engine);

    const error = await errorOf(store.save("opencode-go", "work", SECRET));

    expect(error.code).toBe("keyring_locked");
    expect(error.message).toContain("macos");
    expect(error.message).toContain("opencode-go");
    expect(engine.files.size).toBe(0);
    expect(engine.values.size).toBe(0);
    expect(engine.texts).toEqual([]);
  });

  it("refuses a keyring that fails, naming the exit code but not its stderr", async () => {
    const engine = fakeEngine({ os: "linux", keyring: "failing" });
    const store = createCredentialStore(engine);

    const error = await errorOf(store.save("opencode-go", "work", SECRET));

    expect(error.code).toBe("keyring_failed");
    expect(error.exitCode).toBe(2);
    expect(error.message).toContain("linux");
    expect(error.message).not.toContain("STDERR-MARKER");
    expect(engine.files.size).toBe(0);
    expect(engine.values.size).toBe(0);
  });

  it("does not fall back to the vault when a read hits a locked keyring", async () => {
    const engine = fakeEngine({ os: "linux", keyring: "locked" });
    const store = createCredentialStore(engine);

    const error = await errorOf(store.read("opencode-go", "work"));

    expect(error.code).toBe("keyring_locked");
    expect(engine.files.size).toBe(0);
  });
});

describe("credential store rules", () => {
  it("refuses the anthropic provider before any backend call or file write", async () => {
    const engine = fakeEngine({ os: "macos", keyring: "absent" });
    const store = createCredentialStore(engine);

    const error = await errorOf(store.save("anthropic", "work", SECRET));

    expect(error.code).toBe("anthropic_refused");
    expect(engine.calls).toHaveLength(0);
    expect(engine.files.size).toBe(0);
  });

  it("refuses invalid ids before any backend call", async () => {
    const engine = fakeEngine({ os: "macos" });
    const store = createCredentialStore(engine);

    const error = await errorOf(store.save("Open Code", "work", SECRET));

    expect(error.code).toBe("invalid_id");
    expect(engine.calls).toHaveLength(0);
  });

  it("indexes successful saves without secrets, filters by provider, and drops deleted entries", async () => {
    const engine = fakeEngine({ os: "linux" });
    const store = createCredentialStore(engine);

    await store.save("opencode-go", "work", SECRET);
    await store.save("clinepass", "home", "other-secret");
    expect(await store.list("opencode-go")).toEqual([{ provider: "opencode-go", account: "work" }]);
    expect(await store.list()).toHaveLength(2);
    expect(JSON.stringify(engine.values.get("credentials.index"))).not.toContain(SECRET);

    await store.delete("opencode-go", "work");
    expect(await store.list("opencode-go")).toEqual([]);
  });

  it("leaves the index unchanged when the backend save fails", async () => {
    const engine = fakeEngine({ os: "linux", keyring: "failing" });
    const store = createCredentialStore(engine);

    await errorOf(store.save("opencode-go", "work", SECRET));

    expect(engine.values.has("credentials.index")).toBe(false);
    expect(await store.list()).toEqual([]);
  });
});

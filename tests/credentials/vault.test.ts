import { describe, expect, it } from "vitest";
import { CredentialError } from "../../src/errors/errors.ts";
import { createVault } from "../../src/credentials/vault.ts";
import { fakeEngine } from "../support/fake-engine.ts";

const SECRET = "vault-secret-value-1";
const POSIX_DIR = "/Users/tester/Library/Application Support/nmg-router";

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

describe("vault directory per OS", () => {
  it.each([
    ["macos", {}, POSIX_DIR],
    ["linux", {}, "/home/tester/.local/share/nmg-router"],
    ["linux", { XDG_DATA_HOME: "/data/xdg" }, "/data/xdg/nmg-router"],
  ] as const)("uses the %s directory (env %j)", async (os, env, directory) => {
    const engine = fakeEngine({ os, keyring: "absent", env: { ...env } });
    await createVault(engine, os).save("opencode-go", "work", SECRET);
    expect(engine.timeline[0]).toBe(`run:mkdir -p -m 700 ${directory}`);
    expect(engine.files.has(`${directory}/vault.json`)).toBe(true);
    expect(engine.files.has(`${directory}/vault.key`)).toBe(true);
  });

  it("uses the Windows directory without POSIX mode changes", async () => {
    const engine = fakeEngine({ os: "windows", keyring: "absent" });
    await createVault(engine, "windows").save("opencode-go", "work", SECRET);
    const directory = "C:\\Users\\tester\\AppData\\Local\\nmg-router";
    expect(engine.files.has(`${directory}\\vault.json`)).toBe(true);
    expect(engine.timeline.some((entry) => entry.includes("chmod") || entry.includes("mkdir"))).toBe(false);
  });
});

describe("keyfile vault", () => {
  it("writes a random 256-bit key and AES-GCM ciphertext that round-trips", async () => {
    const engine = fakeEngine({ os: "macos", keyring: "absent" });
    const vault = createVault(engine, "macos");
    await vault.save("opencode-go", "work", SECRET);

    const key = engine.files.get(`${POSIX_DIR}/vault.key`) ?? "";
    expect(Buffer.from(key, "base64")).toHaveLength(32);
    const document = JSON.parse(engine.files.get(`${POSIX_DIR}/vault.json`) ?? "{}") as {
      version: number;
      entries: Record<string, { iv: string; ct: string }>;
    };
    expect(document.version).toBe(1);
    expect(Buffer.from(document.entries["opencode-go/work"]?.iv ?? "", "base64")).toHaveLength(12);
    expect(await vault.read("opencode-go", "work")).toBe(SECRET);
  });

  it("gives each save a fresh IV", async () => {
    const engine = fakeEngine({ os: "macos", keyring: "absent" });
    const vault = createVault(engine, "macos");
    await vault.save("opencode-go", "work", SECRET);
    const first = JSON.parse(engine.files.get(`${POSIX_DIR}/vault.json`) ?? "{}") as { entries: Record<string, { iv: string }> };
    await vault.save("opencode-go", "work", SECRET);
    const second = JSON.parse(engine.files.get(`${POSIX_DIR}/vault.json`) ?? "{}") as { entries: Record<string, { iv: string }> };
    expect(second.entries["opencode-go/work"]?.iv).not.toBe(first.entries["opencode-go/work"]?.iv);
  });

  it("deletes one entry and keeps the others", async () => {
    const engine = fakeEngine({ os: "macos", keyring: "absent" });
    const vault = createVault(engine, "macos");
    await vault.save("opencode-go", "work", SECRET);
    await vault.save("clinepass", "home", "other-value");
    await vault.delete("opencode-go", "work");
    expect(await vault.read("opencode-go", "work")).toBeUndefined();
    expect(await vault.read("clinepass", "home")).toBe("other-value");
  });

  it("fails with vault_failed for a present but malformed key, without regenerating it", async () => {
    const engine = fakeEngine({ os: "macos", keyring: "absent" });
    engine.files.set(`${POSIX_DIR}/vault.key`, "not-a-key");
    const error = await errorOf(createVault(engine, "macos").save("opencode-go", "work", SECRET));
    expect(error.code).toBe("vault_failed");
    expect(engine.files.get(`${POSIX_DIR}/vault.key`)).toBe("not-a-key");
    expect(engine.files.has(`${POSIX_DIR}/vault.json`)).toBe(false);
  });

  it("never regenerates a missing key over existing entries", async () => {
    const engine = fakeEngine({ os: "macos", keyring: "absent" });
    const vault = createVault(engine, "macos");
    await vault.save("opencode-go", "work", SECRET);
    engine.files.delete(`${POSIX_DIR}/vault.key`);
    const error = await errorOf(vault.save("clinepass", "home", "other-value"));
    expect(error.code).toBe("vault_failed");
    expect(engine.files.has(`${POSIX_DIR}/vault.key`)).toBe(false);
  });

  it("fails with vault_failed when ciphertext does not authenticate", async () => {
    const engine = fakeEngine({ os: "macos", keyring: "absent" });
    const vault = createVault(engine, "macos");
    await vault.save("opencode-go", "work", SECRET);
    const document = JSON.parse(engine.files.get(`${POSIX_DIR}/vault.json`) ?? "{}") as {
      entries: Record<string, { ct: string }>;
    };
    const entry = document.entries["opencode-go/work"];
    if (entry === undefined) {
      throw new Error("entry missing");
    }
    entry.ct = Buffer.from("tampered-ciphertext-bytes").toString("base64");
    engine.files.set(`${POSIX_DIR}/vault.json`, JSON.stringify(document));
    const error = await errorOf(vault.read("opencode-go", "work"));
    expect(error.code).toBe("vault_failed");
    expect(error.message).not.toContain(SECRET);
  });

  it("writes nothing when the owner-only directory cannot be made", async () => {
    const engine = fakeEngine({ os: "macos", keyring: "absent" });
    const run = engine.process.run;
    engine.process.run = async (argv, init) =>
      argv[0] === "mkdir" ? { exitCode: 1, stdout: "", stderr: "", isStdoutTruncated: false, isStderrTruncated: false } : run(argv, init);
    const error = await errorOf(createVault(engine, "macos").save("opencode-go", "work", SECRET));
    expect(error.code).toBe("vault_failed");
    expect(engine.files.size).toBe(0);
  });
});

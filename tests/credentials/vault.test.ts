import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVault } from "../../src/credentials/vault.ts";
import { CredentialError } from "../../src/errors/errors.ts";
import { fakeEngine, writtenText, type FakeEngine } from "../support/fake-engine.ts";
import { assertNoSentinel, makeSentinel } from "../support/sentinel.ts";

const LINUX_DIR = "/home/tester/.local/share/nmg-router";
const MAC_DIR = "/Users/tester/Library/Application Support/nmg-router";
const KEY = `${LINUX_DIR}/vault.key`;
const VAULT = `${LINUX_DIR}/vault.json`;

const MKDIR = `process:mkdir -p -m 700 ${LINUX_DIR}`;
const CHMOD_DIR = `process:chmod 700 ${LINUX_DIR}`;

// Node's WebCrypto, kept for the compatibility tests before the host stub replaces it.
type AesParams = { name: "AES-GCM"; iv: Uint8Array; additionalData: Uint8Array; tagLength: 128 };
type NodeSubtle = {
  importKey(format: "raw", key: Uint8Array, algorithm: "AES-GCM", extractable: false, usages: string[]): Promise<unknown>;
  encrypt(params: AesParams, key: unknown, data: Uint8Array): Promise<ArrayBuffer>;
  decrypt(params: AesParams, key: unknown, data: Uint8Array): Promise<ArrayBuffer>;
};
const nodeCrypto = globalThis.crypto;
const nodeSubtle = nodeCrypto.subtle as unknown as NodeSubtle;

// The hooks environment's crypto: digest, randomUUID and getRandomValues, and nothing else.
beforeEach(() => {
  vi.stubGlobal("crypto", {
    subtle: { digest: nodeCrypto.subtle.digest.bind(nodeCrypto.subtle) },
    randomUUID: () => nodeCrypto.randomUUID(),
    getRandomValues: <T extends ArrayBufferView>(array: T): T => nodeCrypto.getRandomValues(array),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function aesParams(iv: Uint8Array, aad: string): AesParams {
  return { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad), tagLength: 128 };
}

function nodeKey(keyText: string): Promise<unknown> {
  return nodeSubtle.importKey("raw", Uint8Array.from(atob(keyText), (c) => c.charCodeAt(0)), "AES-GCM", false, ["encrypt", "decrypt"]);
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

async function vaultError(task: () => Promise<unknown>): Promise<unknown> {
  return task().then(
    () => undefined,
    (caught: unknown) => caught,
  );
}

describe("keyfile vault on POSIX", () => {
  it("creates the owner-only directory before any write, and chmods each file to 600 after writing it", async () => {
    const engine = fakeEngine({ platform: "linux" });
    const vault = createVault(engine, "linux");

    await vault.save("opencode-go", "default", makeSentinel());

    const events = engine.recorded.events;
    const mkdirAt = events.indexOf(MKDIR);
    const firstWriteAt = events.findIndex((event) => event.startsWith("write:"));
    expect(mkdirAt).toBeGreaterThanOrEqual(0);
    expect(events.indexOf(CHMOD_DIR)).toBeGreaterThan(mkdirAt);
    expect(mkdirAt).toBeLessThan(firstWriteAt);

    for (const [index, event] of events.entries()) {
      if (!event.startsWith("write:")) continue;
      const path = event.slice("write:".length);
      expect(events[index + 1]).toBe(`process:chmod 600 ${path}`);
    }
  });

  it("writes a random 256-bit key, and vault.json holds ciphertext rather than the plaintext", async () => {
    const engine = fakeEngine({ platform: "linux" });
    const vault = createVault(engine, "linux");
    const secret = makeSentinel();

    await vault.save("opencode-go", "default", secret);

    const keyText = writtenText(engine, KEY) ?? "";
    expect(atob(keyText)).toHaveLength(32);
    const json = JSON.parse(writtenText(engine, VAULT) ?? "{}") as { version: number; entries: Record<string, unknown> };
    expect(json.version).toBe(1);
    expect(Object.keys(json.entries)).toEqual(["opencode-go/default"]);
    expect(writtenText(engine, VAULT)).not.toContain(secret);
    expect(keyText).not.toContain(secret);
    assertNoSentinel(engine, secret);
  });

  it("round-trips several entries and gives a fresh IV on each write", async () => {
    const engine = fakeEngine({ platform: "linux" });
    const vault = createVault(engine, "linux");

    await vault.save("opencode-go", "default", "first-secret");
    const firstIv = JSON.parse(writtenText(engine, VAULT) ?? "{}").entries["opencode-go/default"].iv;
    await vault.save("opencode-go", "default", "second-secret");
    const secondIv = JSON.parse(writtenText(engine, VAULT) ?? "{}").entries["opencode-go/default"].iv;
    await vault.save("clinepass", "work", "third-secret");

    expect(secondIv).not.toBe(firstIv);
    expect(await vault.read("opencode-go", "default")).toBe("second-secret");
    expect(await vault.read("clinepass", "work")).toBe("third-secret");
  });

  it("removes only the deleted entry", async () => {
    const engine = fakeEngine({ platform: "linux" });
    const vault = createVault(engine, "linux");

    await vault.save("opencode-go", "default", "keep-me");
    await vault.save("clinepass", "work", "drop-me");
    await vault.delete("clinepass", "work");

    expect(await vault.read("clinepass", "work")).toBeUndefined();
    expect(await vault.read("opencode-go", "default")).toBe("keep-me");
  });

  it("refuses a malformed key as vault_failed and writes nothing", async () => {
    const engine = fakeEngine({ platform: "linux", files: { [KEY]: "AAAA" } });
    const vault = createVault(engine, "linux");

    const error = await vaultError(() => vault.save("opencode-go", "default", "secret"));

    expect(error).toMatchObject({ code: "vault_failed" });
    expect(engine.recorded.fsWrites).toEqual([]);
    expect(engine.recorded.processes).toEqual([]);
  });

  it("never regenerates a missing key over existing entries", async () => {
    const seeded = fakeEngine({ platform: "linux" });
    await createVault(seeded, "linux").save("opencode-go", "default", "secret");
    const orphaned = fakeEngine({ platform: "linux", files: { [VAULT]: writtenText(seeded, VAULT) ?? "" } });

    const error = await vaultError(() => createVault(orphaned, "linux").save("clinepass", "work", "new"));

    expect(error).toMatchObject({ code: "vault_failed" });
    expect(orphaned.recorded.fsWrites).toEqual([]);
  });

  it("reports a tampered ciphertext as vault_failed without echoing the plaintext", async () => {
    const seeded = fakeEngine({ platform: "linux" });
    const secret = makeSentinel();
    await createVault(seeded, "linux").save("opencode-go", "default", secret);
    const doc = JSON.parse(writtenText(seeded, VAULT) ?? "{}") as { entries: Record<string, { ct: string }> };
    const entry = doc.entries["opencode-go/default"];
    if (entry === undefined) throw new Error("seeded entry missing");
    entry.ct = entry.ct.slice(0, -4) + (entry.ct.endsWith("AAAA") ? "BBBB" : "AAAA");
    const tampered = fakeEngine({
      platform: "linux",
      files: { [KEY]: writtenText(seeded, KEY) ?? "", [VAULT]: JSON.stringify(doc) },
    });

    const error = await vaultError(() => createVault(tampered, "linux").read("opencode-go", "default"));

    expect(error).toBeInstanceOf(CredentialError);
    expect(error).toMatchObject({ code: "vault_failed" });
    assertNoSentinel(tampered, secret, [error]);
  });

  it("refuses as vault_failed when the owner-only directory cannot be made, before any write", async () => {
    const engine: FakeEngine = fakeEngine({
      platform: "linux",
      run: (argv) =>
        argv[0] === "mkdir"
          ? { exitCode: 1, stdout: "", stderr: "permission denied", isStdoutTruncated: false, isStderrTruncated: false }
          : undefined,
    });

    const error = await vaultError(() => createVault(engine, "linux").save("opencode-go", "default", "secret"));

    expect(error).toMatchObject({ code: "vault_failed", platform: "linux", provider: "opencode-go" });
    expect(engine.recorded.fsWrites).toEqual([]);
  });

  it("uses the macOS Application Support directory", async () => {
    const engine = fakeEngine({ platform: "macos" });

    await createVault(engine, "macos").save("opencode-go", "default", "secret");

    expect(engine.recorded.events).toContain(`process:mkdir -p -m 700 ${MAC_DIR}`);
    expect(writtenText(engine, `${MAC_DIR}/vault.json`)).toBeDefined();
  });
});

describe("vault format compatibility with WebCrypto AES-GCM", () => {
  it("runs with a host crypto whose subtle has digest only", () => {
    expect(Object.keys(globalThis.crypto.subtle)).toEqual(["digest"]);
  });

  it("decrypts an entry that WebCrypto sealed", async () => {
    const engine = fakeEngine({ platform: "linux" });
    await createVault(engine, "linux").save("opencode-go", "default", "placeholder");
    const keyText = writtenText(engine, KEY) ?? "";
    const iv = nodeCrypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(
      await nodeSubtle.encrypt(aesParams(iv, "nmg-router:opencode-go/default"), await nodeKey(keyText), new TextEncoder().encode("from-webcrypto")),
    );
    const doc = { version: 1, entries: { "opencode-go/default": { iv: bytesToBase64(iv), ct: bytesToBase64(ct) } } };
    const reader = fakeEngine({ platform: "linux", files: { [KEY]: keyText, [VAULT]: JSON.stringify(doc) } });

    expect(await createVault(reader, "linux").read("opencode-go", "default")).toBe("from-webcrypto");
  });

  it("seals an entry that WebCrypto decrypts with the same AAD", async () => {
    const engine = fakeEngine({ platform: "linux" });
    await createVault(engine, "linux").save("opencode-go", "work", "to-webcrypto");
    const keyText = writtenText(engine, KEY) ?? "";
    const entry = JSON.parse(writtenText(engine, VAULT) ?? "{}").entries["opencode-go/work"] as { iv: string; ct: string };
    const iv = Uint8Array.from(atob(entry.iv), (c) => c.charCodeAt(0));
    const ct = Uint8Array.from(atob(entry.ct), (c) => c.charCodeAt(0));

    expect(iv).toHaveLength(12);
    const plain = await nodeSubtle.decrypt(aesParams(iv, "nmg-router:opencode-go/work"), await nodeKey(keyText), ct);
    expect(new TextDecoder().decode(plain)).toBe("to-webcrypto");
    await expect(nodeSubtle.decrypt(aesParams(iv, "nmg-router:opencode-go/default"), await nodeKey(keyText), ct)).rejects.toThrow();
  });
});

describe("keyfile vault on Windows", () => {
  it("stores under LOCALAPPDATA and runs no POSIX mode commands", async () => {
    const engine = fakeEngine({ platform: "windows" });

    await createVault(engine, "windows").save("opencode-go", "default", "secret");

    const dir = "C:\\Users\\tester\\AppData\\Local\\nmg-router";
    expect(writtenText(engine, `${dir}\\vault.json`)).toBeDefined();
    expect(engine.recorded.processes.map((call) => call.argv[0])).not.toContain("chmod");
    expect(engine.recorded.processes.map((call) => call.argv[0])).not.toContain("mkdir");
  });
});

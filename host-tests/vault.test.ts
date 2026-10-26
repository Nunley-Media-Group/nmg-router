// Runs under `claude plugin test .` in the hooks environment, not under Vitest.
// That command also tries the Vitest files under tests/, which do not load there.
import { describe, expect, test } from "claude-code/testing";
import { createVault, type VaultDeps } from "../src/credentials/vault.ts";

// An in-memory host for the vault, so the cipher runs in the hooks environment's
// own globals, where crypto.subtle offers digest only.
function memoryDeps(): VaultDeps {
  const files = new Map<string, string>();
  return {
    env: { get: async (name: string) => (name === "HOME" ? "/home/tester" : undefined) },
    fs: {
      exists: async (path: string) => files.has(path),
      read: async (path: string) => files.get(path) ?? "",
      write: async (path: string, text: string) => {
        files.set(path, text);
      },
    },
    process: { run: async () => ({ exitCode: 0, stdout: "", stderr: "", isStdoutTruncated: false, isStderrTruncated: false }) },
  } as unknown as VaultDeps;
}

describe("vault in the hooks environment", () => {
  test("seals and opens an entry without crypto.subtle encrypt", async () => {
    const vault = createVault(memoryDeps(), "linux");

    await vault.save("opencode-go", "default", "host-round-trip");

    expect(await vault.read("opencode-go", "default")).toBe("host-round-trip");
  });
});

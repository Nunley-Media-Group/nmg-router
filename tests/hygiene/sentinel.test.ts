import { afterEach, describe, expect, it, vi } from "vitest";
import { CredentialError } from "../../src/errors/errors.ts";
import { createCredentialStore } from "../../src/credentials/store.ts";
import { fakeEngine, type FakeEngineOptions } from "../support/fake-engine.ts";
import { assertNoSentinel } from "../support/sentinel.ts";

// Built at runtime so no secret-shaped literal sits in the repository.
const SENTINEL = ["nmg", "sentinel", "7d41"].join("-");

const scenarios: [string, FakeEngineOptions][] = [
  ["macOS keyring", { os: "macos" }],
  ["Windows keyring", { os: "windows" }],
  ["Linux keyring", { os: "linux" }],
  ["no keyring (vault)", { os: "macos", keyring: "absent" }],
  ["locked keyring", { os: "macos", keyring: "locked" }],
  ["failing keyring", { os: "linux", keyring: "failing" }],
];

describe("sentinel secret stays off every surface", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(scenarios)("%s: save, read, delete and failures leak nothing", async (_label, options) => {
    const logs: unknown[] = [];
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logs.push(args);
      });
    }
    const engine = fakeEngine(options);
    const store = createCredentialStore(engine);
    const errors: unknown[] = [];
    const attempt = async (action: () => Promise<unknown>) => {
      try {
        await action();
      } catch (error) {
        if (!(error instanceof CredentialError)) {
          throw error;
        }
        errors.push(error);
      }
    };

    await attempt(() => store.save("opencode-go", "work", SENTINEL));
    await attempt(() => store.read("opencode-go", "work"));
    await attempt(() => store.delete("opencode-go", "work"));

    assertNoSentinel(engine, SENTINEL, [...errors, ...logs]);
    expect(engine.stdins.length).toBeGreaterThan(0);
  });
});

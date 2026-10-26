import { describe, expect, it } from "vitest";
import { createCredentialStore } from "../../src/credentials/store.ts";
import { createVault } from "../../src/credentials/vault.ts";
import { fakeEngine, type FakeOptions } from "../support/fake-engine.ts";
import { assertNoSentinel, makeSentinel } from "../support/sentinel.ts";

const scenarios: [string, FakeOptions][] = [
  ["macos keyring", { platform: "macos" }],
  ["windows keyring", { platform: "windows" }],
  ["linux keyring", { platform: "linux" }],
  ["macos locked keyring", { platform: "macos", keyring: "locked" }],
  ["linux failing keyring", { platform: "linux", keyring: "failing" }],
  ["vault after no keyring", { platform: "linux", keyring: "absent" }],
  ["vault on another platform", { platform: "other" }],
];

describe("sentinel hygiene", () => {
  it.each(scenarios)("keeps a sentinel secret out of every recorded surface on the %s path", async (_label, options) => {
    const engine = fakeEngine(options);
    const store = createCredentialStore(engine);
    const secret = makeSentinel();
    const errors: unknown[] = [];
    const attempt = async (step: () => Promise<unknown>) => {
      try {
        await step();
      } catch (error) {
        errors.push(error);
      }
    };

    await attempt(() => store.save("opencode-go", "default", secret));
    await attempt(() => store.read("opencode-go", "default"));
    await attempt(() => store.delete("opencode-go", "default"));
    await attempt(() => store.save("anthropic", "default", secret));
    await attempt(() => store.save("opencode-go", "not valid", secret));

    assertNoSentinel(engine, secret, errors);
  });

  it("keeps the sentinel out of the vault files on every vault path", async () => {
    const engine = fakeEngine({ platform: "macos", keyring: "absent" });
    const secret = makeSentinel();

    await createVault(engine, "macos").save("opencode-go", "default", secret);

    assertNoSentinel(engine, secret);
    expect(engine.recorded.fsWrites.length).toBeGreaterThan(0);
  });

  it("detects a sentinel that reaches a process argument", async () => {
    const engine = fakeEngine({ platform: "linux" });
    const secret = makeSentinel();
    await engine.process.run(["mkdir", "-p", secret]);

    expect(() => assertNoSentinel(engine, secret)).toThrow("credential reached process argv");
  });

  it("detects a sentinel that reaches captured console or error text", () => {
    const engine = fakeEngine({ platform: "linux" });
    const secret = makeSentinel();

    expect(() => assertNoSentinel(engine, secret, [`logged ${secret}`])).toThrow("credential reached error or console text");
  });
});

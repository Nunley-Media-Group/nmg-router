import { describe, expect, it } from "vitest";
import { createCredentialStore } from "../../src/credentials/store.ts";
import { createVault } from "../../src/credentials/vault.ts";
import { fakeEngine, type FakeOptions } from "../support/fake-engine.ts";
import { assertNoSentinel, makeSentinel } from "../support/sentinel.ts";

const scenarios: [string, FakeOptions][] = [
  ["macos vault", { platform: "macos" }],
  ["windows vault", { platform: "windows" }],
  ["linux vault", { platform: "linux" }],
  ["other platform vault", { platform: "other" }],
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

  it.each(["macos", "windows", "linux", "other"] as const)(
    "keeps the sentinel out of the vault files on the %s vault path",
    async (platform) => {
      const engine = fakeEngine({ platform });
      const secret = makeSentinel();

      await createVault(engine, platform).save("opencode-go", "default", secret);

      assertNoSentinel(engine, secret);
      expect(engine.recorded.fsWrites.length).toBeGreaterThan(0);
    },
  );

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

import type { CommandRunInput } from "claude-code";
import { describe, expect, it } from "vitest";
import { readActiveAccount, readLabel, writeActiveAccount, writeLabel } from "../../src/auth/accounts.ts";
import { createCredentialStore } from "../../src/credentials/store.ts";
import { handleLogout } from "../../src/login/logout-command.ts";
import type { FakeEngine } from "../support/fake-engine.ts";
import { freshOAuth, harness, storeApiKey, storeOAuth, type Harness } from "../support/login-harness.ts";
import { assertNoSentinel, makeSentinel } from "../support/sentinel.ts";
import { writeCache } from "../../src/catalog/cache.ts";
import type { CatalogModel } from "../../src/providers/types.ts";

const input = { command: "logout", args: "", origin: { kind: "composer" }, presentation: {} } as unknown as CommandRunInput;

function counts(engine: FakeEngine) {
  return {
    store: engine.recorded.storeWrites.length,
    fs: engine.recorded.fsWrites.length,
    processes: engine.recorded.processes.length,
    settings: engine.recorded.settingsWrites.length,
  };
}

function run(h: Harness, next = async () => ({ text: "claude logout" })) {
  return handleLogout(h.engine, input, next, h.services);
}

// Two Codex accounts, as two logins leave them: the latest login, acct-a, is active.
async function twoCodexAccounts(h: Harness): Promise<void> {
  await storeOAuth(h.engine, "openai-codex", "acct-a", freshOAuth("acct-a"), "a@example.com (plus)");
  await storeOAuth(h.engine, "openai-codex", "acct-b", freshOAuth("acct-b"), "b@example.com (plus)");
  await writeLabel(h.engine, "openai-codex", "acct-a", "a@example.com (plus)");
  await writeActiveAccount(h.engine, "openai-codex", "acct-a");
  await h.services.catalog.load();
}

describe("/logout with two accounts (AC8)", () => {
  it("lists Anthropic and only the providers with credentials", async () => {
    const h = harness({ platform: "linux" }, [{ kind: "cancelled" }]);
    await storeApiKey(h.engine, "opencode-go", "fixture-key");
    await h.services.catalog.load();

    expect(await run(h)).toEqual({ text: "Logout cancelled." });
    const [view] = h.pane.views;
    if (view?.kind !== "select") throw new Error("expected the picker");
    expect(view.title).toBe("Select provider to logout");
    expect(view.rows.map((row) => row.value)).toEqual(["anthropic", "opencode-go"]);
  });

  it("marks the active account, deletes only the chosen one and promotes the remaining account", async () => {
    const h = harness({ platform: "linux" }, [
      { kind: "picked", value: "openai-codex" },
      { kind: "picked", value: "acct-a" },
    ]);
    await twoCodexAccounts(h);
    expect(await readActiveAccount(h.engine, "openai-codex")).toBe("acct-a");

    expect(await run(h)).toEqual({ text: "Logged out of OpenAI Codex (a@example.com (plus))" });

    const accountPicker = h.pane.views[1];
    if (accountPicker?.kind !== "select") throw new Error("expected the account picker");
    expect(accountPicker.title).toBe("Select OpenAI Codex account to logout");
    expect(accountPicker.selected).toBe("acct-a");
    expect(accountPicker.rows).toEqual([
      { value: "acct-a", label: "a@example.com (plus) (active)" },
      { value: "acct-b", label: "b@example.com (plus)" },
    ]);
    expect(await createCredentialStore(h.engine).list("openai-codex")).toEqual([
      { provider: "openai-codex", account: "acct-b" },
    ]);
    expect(await readActiveAccount(h.engine, "openai-codex")).toBe("acct-b");
    expect(await readLabel(h.engine, "openai-codex", "acct-a")).toBeUndefined();
  });

  it("leaves the active account alone when a non-active one is removed", async () => {
    const h = harness({ platform: "linux" }, [
      { kind: "picked", value: "openai-codex" },
      { kind: "picked", value: "acct-b" },
    ]);
    await twoCodexAccounts(h);

    await run(h);
    expect(await readActiveAccount(h.engine, "openai-codex")).toBe("acct-a");
  });

  it("hands Anthropic to next(e) with no store, vault, settings or file call after the pick", async () => {
    let atPick: ReturnType<typeof counts> | undefined;
    let h!: Harness;
    h = harness({ platform: "linux" }, [
      () => {
        atPick = counts(h.engine);
        return { kind: "picked", value: "anthropic" };
      },
    ]);
    await twoCodexAccounts(h);
    const writesBefore = h.engine.recorded.storeWrites.length;

    let atNext: ReturnType<typeof counts> | undefined;
    const result = await run(h, async () => {
      atNext = counts(h.engine);
      return { text: "claude logout" };
    });
    expect(result).toEqual({ text: "claude logout" });
    expect(atNext).toEqual(atPick);
    expect(h.engine.recorded.storeWrites.length).toBe(writesBefore);
  });
});

describe("/logout of a single API key", () => {
  it("deletes the credential, clears the active marker and forgets the cached models", async () => {
    const h = harness({ platform: "linux" }, [
      { kind: "picked", value: "opencode-go" },
    ]);
    await storeApiKey(h.engine, "opencode-go", "fixture-key");
    const model: CatalogModel = {
      id: "opencode-go/glm-5.1",
      provider: "opencode-go",
      model: "glm-5.1",
      name: "GLM-5.1",
      wire: "openai-completions",
      baseUrl: "https://opencode.ai/inference/go/v1",
    };
    await writeCache(h.engine, { version: 1, providers: { "opencode-go": { fetchedAt: 1, status: "ok", models: [model] } } });
    await h.services.catalog.load();

    expect(await run(h)).toEqual({ text: "Logged out of OpenCode Go" });
    expect(await createCredentialStore(h.engine).list("opencode-go")).toEqual([]);
    expect(h.services.catalog.status("opencode-go")).toBe("never");
    expect(h.pane.views).toHaveLength(1);
  });

  it("lists a disabled provider that still holds a credential", async () => {
    const h = harness(
      {
        platform: "linux",
        files: {
          "/home/tester/.config/nmg-router/config.json": JSON.stringify({ disabledProviders: ["xai"] }),
        },
      },
      [{ kind: "cancelled" }],
    );
    await storeApiKey(h.engine, "xai", "fixture-key");
    await h.services.catalog.load();

    await run(h);
    const [view] = h.pane.views;
    if (view?.kind !== "select") throw new Error("expected the picker");
    expect(view.rows.map((row) => row.value)).toEqual(["anthropic", "xai"]);
  });

  it("keeps the key out of every surface it could reach", async () => {
    const key = makeSentinel();
    const h = harness({ platform: "linux" }, [{ kind: "picked", value: "opencode-go" }]);
    await storeApiKey(h.engine, "opencode-go", key);
    await h.services.catalog.load();

    const result = await run(h);
    assertNoSentinel(h.engine, key, [result.text ?? ""]);
  });
});

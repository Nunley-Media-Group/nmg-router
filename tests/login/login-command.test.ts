import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CommandRunInput, CommandRunResult } from "claude-code";
import { describe, expect, it } from "vitest";
import { decodeSecret, encodeSecret } from "../../src/auth/accounts.ts";
import { createCredentialStore } from "../../src/credentials/store.ts";
import { handleLogin } from "../../src/login/login-command.ts";
import type { FakeEngine } from "../support/fake-engine.ts";
import { harness, storeApiKey, type Harness } from "../support/login-harness.ts";
import { assertNoSentinel, makeSentinel } from "../support/sentinel.ts";

const input = { command: "login", args: "", origin: { kind: "composer" }, presentation: {} } as unknown as CommandRunInput;
const LIST = readFileSync(join(import.meta.dirname, "..", "fixtures", "opencode-go-models.json"), "utf8");
const OPENCODE_MODELS = "https://opencode.ai/inference/go/v1/models";

function counts(engine: FakeEngine) {
  return {
    store: engine.recorded.storeWrites.length,
    fs: engine.recorded.fsWrites.length,
    processes: engine.recorded.processes.length,
    settings: engine.recorded.settingsWrites.length,
  };
}

function run(h: Harness, next?: (received: CommandRunInput) => Promise<CommandRunResult>): Promise<CommandRunResult> {
  return handleLogin(h.engine, input, next ?? (async () => ({ text: "claude login" })), h.services);
}

describe("/login picker (AC5)", () => {
  it("titles the picker and lists Anthropic and each enabled provider with its status", async () => {
    const h = harness({ platform: "linux" }, [{ kind: "cancelled" }]);
    await storeApiKey(h.engine, "opencode-go", "fixture-key");
    await h.services.catalog.load();

    expect(await run(h)).toEqual({ text: "Login cancelled." });
    const [view] = h.pane.views;
    if (view?.kind !== "select") throw new Error("expected the picker");
    expect(view.title).toBe("Select provider to login");
    expect(view.rows).toEqual([
      { value: "anthropic", label: "Anthropic (Claude Code login)" },
      { value: "opencode-go", label: "OpenCode Go", status: "✓ logged in" },
      { value: "cline-pass", label: "ClinePass", status: "not logged in" },
      { value: "openai-codex", label: "OpenAI Codex", status: "not logged in" },
      { value: "xai", label: "xAI", status: "not logged in" },
    ]);
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
    let atNext: ReturnType<typeof counts> | undefined;
    const next = async (received: CommandRunInput) => {
      atNext = counts(h.engine);
      expect(received).toBe(input);
      return { text: "claude login" };
    };

    expect(await run(h, next)).toEqual({ text: "claude login" });
    expect(atNext).toEqual(atPick);
    expect(h.engine.recorded.storeWrites).toEqual([]);
    expect(h.engine.recorded.fsWrites).toEqual([]);
  });
});

describe("/login with an API key (AC6)", () => {
  it("validates, saves the key as the default account and refreshes the models", async () => {
    const key = makeSentinel();
    const h = harness(
      {
        platform: "linux",
        http: (request) =>
          request.url === OPENCODE_MODELS && request.headers.authorization === `Bearer ${key}`
            ? { status: 200, text: LIST }
            : { status: 401 },
      },
      [
        { kind: "picked", value: "opencode-go" },
        { kind: "submitted", value: `  ${key}  ` },
      ],
    );
    await h.services.catalog.load();

    const result = await run(h);
    expect(result).toEqual({ text: "Logged in to OpenCode Go" });
    expect(h.pane.views[1]).toMatchObject({ kind: "secret", label: "OpenCode Go API key" });
    const credentials = createCredentialStore(h.engine);
    expect(await credentials.list("opencode-go")).toEqual([{ provider: "opencode-go", account: "default" }]);
    expect(decodeSecret((await credentials.read("opencode-go", "default")) ?? "")).toEqual({ type: "api-key", key });
    expect(h.services.catalog.models().map((model) => model.id)).toContain("opencode-go/glm-5.1");
    assertNoSentinel(h.engine, key, [result.text ?? ""]);
  });

  it("replaces every other account for the provider with the new key", async () => {
    const h = harness({ platform: "linux", http: () => ({ status: 200, text: LIST }) }, [
      { kind: "picked", value: "opencode-go" },
      { kind: "submitted", value: "fixture-key" },
    ]);
    await createCredentialStore(h.engine).save("opencode-go", "old", encodeSecret({ type: "api-key", key: "old-key" }));
    await h.services.catalog.load();

    await run(h);
    expect(await createCredentialStore(h.engine).list("opencode-go")).toEqual([
      { provider: "opencode-go", account: "default" },
    ]);
  });

  it.each<[string, string | undefined, number | undefined, string]>([
    ["a 401", OPENCODE_MODELS, 401, "Invalid OpenCode Go API key; nothing was saved."],
    ["a 403", OPENCODE_MODELS, 403, "Invalid OpenCode Go API key; nothing was saved."],
    ["a 500", OPENCODE_MODELS, 500, "Could not validate the OpenCode Go key (HTTP 500); nothing was saved."],
    ["no route", undefined, undefined, "Could not reach OpenCode Go to validate the sign-in; nothing was saved."],
  ])("saves nothing and says so on %s", async (_label, url, status, text) => {
    const h = harness(
      {
        platform: "linux",
        http: (request) => (url !== undefined && request.url === url && status !== undefined ? { status } : undefined),
      },
      [
        { kind: "picked", value: "opencode-go" },
        { kind: "submitted", value: "fixture-key" },
      ],
    );
    expect(await run(h)).toEqual({ text });
    expect(await createCredentialStore(h.engine).list("opencode-go")).toEqual([]);
    expect(h.engine.recorded.storeWrites.map((write) => write.key)).not.toContain("accounts.active");
  });

  it("treats an empty key as invalid and calls nothing", async () => {
    const h = harness({ platform: "linux" }, [
      { kind: "picked", value: "opencode-go" },
      { kind: "submitted", value: "   " },
    ]);
    expect(await run(h)).toEqual({ text: "Invalid OpenCode Go API key; nothing was saved." });
    expect(h.engine.recorded.http).toEqual([]);
  });

  it("closes without saving when the person cancels the field", async () => {
    const h = harness({ platform: "linux" }, [
      { kind: "picked", value: "opencode-go" },
      { kind: "cancelled" },
    ]);
    expect(await run(h)).toEqual({ text: "Login cancelled." });
    expect(await createCredentialStore(h.engine).list()).toEqual([]);
  });
});

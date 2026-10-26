import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CommandRunInput, CommandRunResult } from "claude-code";
import { describe, expect, it } from "vitest";
import { readCache } from "../../src/catalog/cache.ts";
import { handleLogin } from "../../src/login/login-command.ts";
import { handleLogout } from "../../src/login/logout-command.ts";
import type { PaneView } from "../../src/login/pane.ts";
import { freshOAuth, harness, storeOAuth, type ScriptedAnswer } from "../support/login-harness.ts";
import { makeJwt, codexClaims } from "../support/jwt.ts";
import { assertNoSentinel, makeSentinel } from "../support/sentinel.ts";
import { loadUserConfig } from "../../src/config/user-config.ts";
import { BUILTIN_IDS } from "../../src/providers/builtin/index.ts";
import { fakeEngine } from "../support/fake-engine.ts";

const login = { command: "login", args: "", origin: { kind: "composer" }, presentation: {} } as unknown as CommandRunInput;
const logout = { command: "logout", args: "", origin: { kind: "composer" }, presentation: {} } as unknown as CommandRunInput;
const LIST = readFileSync(join(import.meta.dirname, "..", "fixtures", "codex-models.json"), "utf8");
const OPENCODE_LIST = readFileSync(join(import.meta.dirname, "..", "fixtures", "opencode-go-models.json"), "utf8");
const TOKEN_URL = "https://auth.openai.com/oauth/token";
const passthrough = async (): Promise<CommandRunResult> => ({ text: "claude" });

function stateOf(view: PaneView): string {
  if (view.kind !== "text") throw new Error("expected the paste view");
  return new URL(view.lines[1] ?? "").searchParams.get("state") ?? "";
}

function pasteWith(code: string, state: (view: PaneView) => string = stateOf): ScriptedAnswer {
  return (view) => ({ kind: "submitted", value: `http://localhost:1455/auth/callback?code=${code}&state=${state(view)}` });
}

describe("credential hygiene on the API-key path (FR8)", () => {
  it("keeps a sentinel key out of every surface through a refused check, a saved login, discovery and logout", async () => {
    const key = makeSentinel();
    const texts: string[] = [];
    const h = harness(
      {
        platform: "linux",
        http: (request) => {
          if (request.headers.authorization !== `Bearer ${key}`) return { status: 401 };
          return { status: 200, text: OPENCODE_LIST };
        },
      },
      [
        { kind: "picked", value: "opencode-go" },
        { kind: "submitted", value: "wrong-" + key.slice(0, 10) },
        { kind: "picked", value: "opencode-go" },
        { kind: "submitted", value: key },
        { kind: "picked", value: "opencode-go" },
      ],
    );
    await h.services.catalog.load();

    texts.push((await handleLogin(h.engine, login, passthrough, h.services)).text ?? "");
    texts.push((await handleLogin(h.engine, login, passthrough, h.services)).text ?? "");
    texts.push((await handleLogout(h.engine, logout, passthrough, h.services)).text ?? "");
    expect(texts).toEqual([
      "Invalid OpenCode Go API key; nothing was saved.",
      "Logged in to OpenCode Go",
      "Logged out of OpenCode Go",
    ]);
    assertNoSentinel(h.engine, key, texts);
  });
});

describe("credential hygiene on the OAuth path (FR8)", () => {
  it("keeps sentinel codes and tokens out of every surface through login, refresh, discovery and logout", async () => {
    const code = makeSentinel();
    const refresh = makeSentinel();
    const access = makeJwt(codexClaims("acct-sentinel-1", "dev@example.com"), makeSentinel());
    const h = harness(
      {
        platform: "linux",
        http: (request) => {
          if (request.url === TOKEN_URL) {
            return { status: 200, body: { access_token: access, refresh_token: refresh, expires_in: 3600 } };
          }
          if (request.url.includes("/codex/models")) return { status: 200, text: LIST };
          return undefined;
        },
      },
      [{ kind: "picked", value: "openai-codex" }, pasteWith(code), { kind: "picked", value: "openai-codex" }],
    );
    await h.services.catalog.load();

    const texts = [
      (await handleLogin(h.engine, login, passthrough, h.services)).text ?? "",
      (await handleLogout(h.engine, logout, passthrough, h.services)).text ?? "",
    ];
    expect(texts[0]).toBe("Logged in to OpenAI Codex as dev@example.com");
    assertNoSentinel(h.engine, code, texts);
    assertNoSentinel(h.engine, refresh, texts);
    assertNoSentinel(h.engine, access, texts);
  });

  it("keeps a sentinel refresh token out of every surface when the refresh is refused", async () => {
    const refresh = makeSentinel();
    const h = harness({ platform: "linux", http: () => ({ status: 400, body: { error: refresh } }) });
    await storeOAuth(h.engine, "openai-codex", "acct-sentinel-1", {
      ...freshOAuth("acct-sentinel-1"),
      refresh,
      expires: Date.now() - 1000,
    });
    await h.services.catalog.load();
    await h.services.catalog.refresh("openai-codex");

    expect(h.services.catalog.status("openai-codex")).toBe("unauthenticated");
    assertNoSentinel(h.engine, refresh, []);
  });
});

describe("credential hygiene on every error path (FR8)", () => {
  it.each<[string, ScriptedAnswer]>([
    ["a mismatched state", pasteWith(makeSentinel(), () => "not-the-issued-state")],
    ["a rejected exchange whose body echoes the code", pasteWith(makeSentinel())],
  ])("keeps sentinel values out of the message for %s", async (_label, answer) => {
    const sentinel = makeSentinel();
    const body = { error: sentinel, code: sentinel };
    const h = harness(
      { platform: "linux", http: () => ({ status: 500, body }) },
      [{ kind: "picked", value: "openai-codex" }, answer],
    );
    const result = await handleLogin(h.engine, login, passthrough, h.services);

    expect(result.text).not.toContain(sentinel);
    assertNoSentinel(h.engine, sentinel, [result.text ?? ""]);
  });

  it("keeps a sentinel out of the message when the provider answers with a body and a 401", async () => {
    const sentinel = makeSentinel();
    const h = harness(
      { platform: "linux", http: () => ({ status: 401, body: { error: sentinel } }) },
      [{ kind: "picked", value: "xai" }, { kind: "submitted", value: sentinel }],
    );
    const result = await handleLogin(h.engine, login, passthrough, h.services);

    expect(result.text).toBe("Invalid xAI API key; nothing was saved.");
    assertNoSentinel(h.engine, sentinel, [result.text ?? ""]);
  });
});

describe("credential hygiene in config problems (FR8)", () => {
  it("keeps a sentinel config value out of the problem message, the UI and the store", async () => {
    const sentinel = makeSentinel();
    const engine = fakeEngine({
      platform: "linux",
      files: {
        "/home/tester/.config/nmg-router/config.json": JSON.stringify({
          providers: { "leaky-relay": { baseUrl: "https://relay.example.com/v1", api: "openai-completions", headers: { Authorization: `Bearer ${sentinel}` } } },
        }),
      },
    });
    const load = await loadUserConfig(engine, BUILTIN_IDS);
    const messages = load.problems.map((problem) => problem.message);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("providers.leaky-relay.headers.Authorization");
    expect(messages[0]).toContain("/login");
    assertNoSentinel(engine, sentinel, messages);
    expect(await readCache(engine)).toEqual({ version: 1, providers: {} });
  });

  it("keeps a sentinel out of the catalog's logged problems", async () => {
    const sentinel = makeSentinel();
    const h = harness({
      platform: "macos",
      files: {
        "/Users/tester/Library/Application Support/nmg-router/config.json": JSON.stringify({
          providers: { "leaky-relay": { baseUrl: "https://relay.example.com/v1", api: "openai-completions", apiKey: sentinel } },
        }),
      },
    });
    await h.services.catalog.load();

    assertNoSentinel(h.engine, sentinel, h.engine.recorded.ui);
    expect(h.engine.recorded.ui.some((text) => text.includes("leaky-relay.apiKey"))).toBe(true);
  });
});

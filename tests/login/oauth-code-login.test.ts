import { describe, expect, it } from "vitest";
import { decodeSecret, accountIdFor, readActiveAccount, readLabel } from "../../src/auth/accounts.ts";
import { parsePaste } from "../../src/auth/oauth-code-login.ts";
import { createCredentialStore } from "../../src/credentials/store.ts";
import { handleLogin } from "../../src/login/login-command.ts";
import type { PaneView } from "../../src/login/pane.ts";
import type { CommandRunInput } from "claude-code";
import { codexClaims, makeJwt } from "../support/jwt.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FakeHttpReply } from "../support/fake-engine.ts";
import { freshOAuth, harness, storeOAuth } from "../support/login-harness.ts";

const CODEX_MODELS = readFileSync(join(import.meta.dirname, "..", "fixtures", "codex-models.json"), "utf8");
const TOKEN_URL = "https://auth.openai.com/oauth/token";
const input = { command: "login", args: "", origin: { kind: "composer" }, presentation: {} } as unknown as CommandRunInput;

function stateFrom(view: PaneView): string {
  if (view.kind !== "text") throw new Error("expected the paste view");
  const url = new URL(view.lines[1] ?? "");
  return url.searchParams.get("state") ?? "";
}

function redirectFor(state: string, code = "auth-code-fixture"): string {
  return `http://localhost:1455/auth/callback?code=${code}&state=${state}`;
}

function tokenReply(claims: Record<string, unknown>): FakeHttpReply {
  return {
    status: 200,
    body: { access_token: makeJwt(claims), refresh_token: "refresh-fixture", expires_in: 3600 },
  };
}

describe("OAuth paste parsing (FR6)", () => {
  it.each([
    ["a full redirect URL", "http://localhost:1455/auth/callback?code=abc&state=s1", "abc"],
    ["a query string", "code=abc&state=s1", "abc"],
    ["a leading question mark", "?code=abc&state=s1", "abc"],
    ["code#state", "abc#s1", "abc"],
    ["a bare code", "abc", "abc"],
    ["a state that is absent", "http://localhost:1455/auth/callback?code=abc", "abc"],
  ])("reads %s", (_label, pasted, code) => {
    expect(parsePaste(pasted, "s1", "OpenAI Codex")).toEqual({ code });
  });

  it("refuses a state that differs from the issued one", () => {
    expect(() => parsePaste("code=abc&state=other", "s1", "OpenAI Codex")).toThrow(
      "The pasted OpenAI Codex redirect does not match this sign-in; nothing was saved.",
    );
  });

  it("returns nothing for an empty paste", () => {
    expect(parsePaste("   ", "s1", "OpenAI Codex")).toBeUndefined();
  });
});

describe("OpenAI Codex sign-in by paste (AC7)", () => {
  it("exchanges the pasted code, saves the tokens under the account id and shows the email", async () => {
    const h = harness(
      {
        platform: "linux",
        http: (request) => {
          if (request.url === TOKEN_URL) return tokenReply(codexClaims("acct-fixture-1", "Dev@Example.com"));
          if (request.url.startsWith("https://chatgpt.com/backend-api/codex/models")) {
            return { status: 200, text: CODEX_MODELS };
          }
          return undefined;
        },
      },
      [
        { kind: "picked", value: "openai-codex" },
        (view) => ({ kind: "submitted", value: redirectFor(stateFrom(view)) }),
      ],
    );

    expect(await handleLogin(h.engine, input, async () => ({ text: "never" }), h.services)).toEqual({
      text: "Logged in to OpenAI Codex as dev@example.com",
    });

    const shown = h.pane.views[1];
    if (shown?.kind !== "text") throw new Error("expected the paste view");
    expect(shown.lines[1]).toMatch(/^https:\/\/auth\.openai\.com\/oauth\/authorize\?/);
    expect(shown.lines[1]).toContain("code_challenge_method=S256");
    expect(shown.lines[1]).toContain("id_token_add_organizations=true");

    const exchange = h.engine.recorded.http.find((request) => request.url === TOKEN_URL);
    const body = new URLSearchParams(exchange?.body ?? "");
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("auth-code-fixture");
    expect(body.get("code_verifier")).toHaveLength(128);
    expect(h.engine.recorded.processes.map((process) => process.argv[0])).toContain("xdg-open");

    const credentials = createCredentialStore(h.engine);
    expect(await credentials.list("openai-codex")).toEqual([{ provider: "openai-codex", account: "acct-fixture-1" }]);
    const secret = decodeSecret((await credentials.read("openai-codex", "acct-fixture-1")) ?? "");
    expect(secret).toMatchObject({ type: "oauth", accountId: "acct-fixture-1", refresh: "refresh-fixture" });
    expect(await readActiveAccount(h.engine, "openai-codex")).toBe("acct-fixture-1");
    expect(await readLabel(h.engine, "openai-codex", "acct-fixture-1")).toBe("dev@example.com (plus)");
  });

  it("refuses a pasted state that does not match and saves nothing", async () => {
    const h = harness({ platform: "linux", http: () => tokenReply(codexClaims("acct-fixture-1", "dev@example.com")) }, [
      { kind: "picked", value: "openai-codex" },
      { kind: "submitted", value: redirectFor("not-the-issued-state") },
    ]);

    expect(await handleLogin(h.engine, input, async () => ({ text: "never" }), h.services)).toEqual({
      text: "The pasted OpenAI Codex redirect does not match this sign-in; nothing was saved.",
    });
    expect(h.engine.recorded.http).toEqual([]);
    expect(await createCredentialStore(h.engine).list()).toEqual([]);
  });

  it("refuses a token response without an account id", async () => {
    const h = harness({ platform: "linux", http: () => tokenReply({}) }, [
      { kind: "picked", value: "openai-codex" },
      (view) => ({ kind: "submitted", value: redirectFor(stateFrom(view)) }),
    ]);

    expect(await handleLogin(h.engine, input, async () => ({ text: "never" }), h.services)).toEqual({
      text: "OpenAI Codex returned no account id; nothing was saved.",
    });
    expect(await createCredentialStore(h.engine).list()).toEqual([]);
  });

  it("refuses a token response that holds no refresh token", async () => {
    const h = harness({
      platform: "linux",
      http: () => ({ status: 200, body: { access_token: makeJwt(codexClaims("acct-fixture-1", "a@b.co")), expires_in: 3600 } }),
    }, [
      { kind: "picked", value: "openai-codex" },
      (view) => ({ kind: "submitted", value: redirectFor(stateFrom(view)) }),
    ]);

    expect(await handleLogin(h.engine, input, async () => ({ text: "never" }), h.services)).toEqual({
      text: "OpenAI Codex did not issue tokens; nothing was saved.",
    });
  });
});

describe("OpenAI Codex token refresh (AC7)", () => {
  it("refreshes an expired token and saves it before the next request that needs it", async () => {
    const expired = { ...freshOAuth("acct-fixture-1"), expires: Date.now() - 1000 };
    const h = harness({
      platform: "linux",
      http: (request) => {
        if (request.url === TOKEN_URL) {
          expect(new URLSearchParams(request.body ?? "").get("grant_type")).toBe("refresh_token");
          return { status: 200, body: { access_token: "access-refreshed", expires_in: 3600 } };
        }
        if (request.url.startsWith("https://chatgpt.com/backend-api/codex/models")) {
          return { status: 200, text: CODEX_MODELS };
        }
        return undefined;
      },
    });
    await storeOAuth(h.engine, "openai-codex", "acct-fixture-1", expired);
    await h.services.catalog.load();
    await h.services.catalog.refresh("openai-codex");

    const saved = decodeSecret((await createCredentialStore(h.engine).read("openai-codex", "acct-fixture-1")) ?? "");
    expect(saved).toMatchObject({ access: "access-refreshed", refresh: "refresh-fixture" });
    const listing = h.engine.recorded.http.find((request) => request.url.includes("/codex/models"));
    expect(listing?.headers.authorization).toBe("Bearer access-refreshed");
    expect(h.services.catalog.status("openai-codex")).toBe("ok");
  });

  it("marks the provider unauthenticated and keeps its cached models when the refresh is refused", async () => {
    const expired = { ...freshOAuth("acct-fixture-1"), expires: Date.now() - 1000 };
    const h = harness({ platform: "linux", http: () => ({ status: 400 }) });
    await storeOAuth(h.engine, "openai-codex", "acct-fixture-1", expired);
    await h.services.catalog.load();
    await h.services.catalog.refresh("openai-codex");

    expect(h.services.catalog.status("openai-codex")).toBe("unauthenticated");
    expect(h.engine.recorded.http.map((request) => request.url)).toEqual([TOKEN_URL]);
  });

  it("uses the stored account id to name the account", () => {
    expect(accountIdFor("Acct Fixture/1")).toBe("acct-fixture-1");
    expect(accountIdFor("-leading")).toBe("aleading");
  });
});

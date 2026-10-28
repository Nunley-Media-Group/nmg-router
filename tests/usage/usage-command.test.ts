import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CommandRunInput } from "claude-code";
import { describe, expect, it, vi } from "vitest";
import { encodeSecret } from "../../src/auth/accounts.ts";
import { createCredentialStore } from "../../src/credentials/store.ts";
import { createServices } from "../../src/services.ts";
import { createUsageMonitor } from "../../src/usage/monitor.ts";
import { handleUsage, type UsageCommandDeps } from "../../src/usage/usage-command.ts";
import { assertNoSentinel, makeSentinel } from "../support/sentinel.ts";
import { fakeEngine, type FakeEngine, type FakeHttpReply, type FakeHttpResponder } from "../support/fake-engine.ts";
import { routerHostOf, signIn } from "../support/routing.ts";

const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const OPENCODE_USAGE_URL = "https://opencode.ai/zen/go/v1/usage";
// The codex fixture's primary window resets 2h 10m after this, and its secondary window 5d 21h after.
const NOW = 1797992200000;

const INPUT = {
  command: "usage",
  args: "",
  origin: { kind: "composer" },
  presentation: { isFullscreen: false, columns: 200 },
} as CommandRunInput;

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(import.meta.dirname, "..", "fixtures", name), "utf8")) as unknown;
}

const CODEX_OK: FakeHttpReply = { status: 200, body: fixture("codex-usage.json") };
const OPENCODE_OK: FakeHttpReply = { status: 200, body: fixture("opencode-go-usage.json") };

// Answers each usage endpoint with its reply. An endpoint with no reply is unreachable.
function usageAnswers(replies: { codex?: FakeHttpReply; opencode?: FakeHttpReply }): FakeHttpResponder {
  return (request) => {
    if (request.url === CODEX_USAGE_URL) return replies.codex;
    if (request.url === OPENCODE_USAGE_URL) return replies.opencode;
    return undefined;
  };
}

// A signed-in OpenAI Codex account, with a token that does not need a refresh.
async function codexLogin(engine: FakeEngine): Promise<void> {
  const secret = { type: "oauth" as const, access: "sentinel-access", refresh: "sentinel-refresh", expires: NOW + 3_600_000, accountId: "acct-test" };
  await createCredentialStore(engine).save("openai-codex", "default", encodeSecret(secret));
}

// The hook's dependencies, as the register builds them: the login services and a monitor on the same clock.
function depsOf(engine: FakeEngine, monitor = createUsageMonitor(() => NOW)): UsageCommandDeps {
  const services = createServices(routerHostOf(engine));
  return {
    catalog: services.catalog,
    credentials: services.credentials,
    http: engine.http,
    platform: services.platform,
    monitor,
    now: () => NOW,
  };
}

describe("/usage entries", () => {
  it("runs the built-in view first, then lists each logged-in provider by name, leaving out one without a login", async () => {
    const engine = fakeEngine({ platform: "linux", http: usageAnswers({ codex: CODEX_OK, opencode: OPENCODE_OK }) });
    await signIn(engine, "opencode-go", "sentinel-opencode");
    await codexLogin(engine);
    await signIn(engine, "xai", "sentinel-xai");
    const next = vi.fn(async () => ({ text: "built-in" }));

    const result = await handleUsage(depsOf(engine), INPUT, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(INPUT);
    expect(result.text).toBe(
      [
        "built-in",
        "",
        "Provider plan usage",
        "OpenAI Codex",
        "  5h 23% · resets in 2h 10m",
        "  7d 41% · resets in 5d 21h",
        "OpenCode Go",
        "  5h 12% · resets in 1h 43m",
        "  weekly 41% · resets in 8d 21h",
        "  monthly 7% · resets in 29d 21h",
        "xAI",
        "  No usage reading available",
      ].join("\n"),
    );
    expect(result.text).not.toContain("ClinePass");
  });

  it("shows one failing provider's failure and the other provider's windows", async () => {
    const engine = fakeEngine({ platform: "linux", http: usageAnswers({ codex: { status: 500 }, opencode: OPENCODE_OK }) });
    await codexLogin(engine);
    await signIn(engine, "opencode-go", "sentinel-opencode");

    const { text } = await handleUsage(depsOf(engine), INPUT, async () => ({ text: "built-in" }));

    expect(text).toContain("OpenAI Codex\n  Usage could not be read: unavailable\n");
    expect(text).toContain("OpenCode Go\n  5h 12% · resets in 1h 43m");
  });

  it("returns Claude Code's own result unchanged, and sends no usage request, with no provider logged in", async () => {
    const engine = fakeEngine({ platform: "linux", http: usageAnswers({ codex: CODEX_OK, opencode: OPENCODE_OK }) });
    const built = { text: "built-in", context: ["a note"] };
    const next = vi.fn(async () => built);

    const result = await handleUsage(depsOf(engine), INPUT, next);

    expect(result).toBe(built);
    expect(engine.recorded.http).toEqual([]);
  });

  it("reads a provider within the throttle from the shared monitor, sending one usage request for two /usage runs", async () => {
    const engine = fakeEngine({ platform: "linux", http: usageAnswers({ opencode: OPENCODE_OK }) });
    await signIn(engine, "opencode-go", "sentinel-opencode");
    const deps = depsOf(engine);
    const next = async () => ({ text: "built-in" });

    await handleUsage(deps, INPUT, next);
    const second = await handleUsage(deps, INPUT, next);

    expect(second.text).toContain("OpenCode Go\n  5h 12% · resets in 1h 43m");
    expect(engine.recorded.http.filter((request) => request.url === OPENCODE_USAGE_URL)).toHaveLength(1);
  });

  it("keeps the credential out of the output, the log and the store, even when the read is refused", async () => {
    const sentinel = makeSentinel();
    const engine = fakeEngine({ platform: "linux", http: usageAnswers({ opencode: { status: 401 } }) });
    await signIn(engine, "opencode-go", sentinel);

    const { text } = await handleUsage(depsOf(engine), INPUT, async () => ({ text: "built-in" }));

    expect(text).toContain("OpenCode Go\n  Usage could not be read: unauthenticated");
    assertNoSentinel(engine, sentinel, [text]);
    expect(engine.recorded.ui.join("\n")).not.toContain(sentinel);
  });
});

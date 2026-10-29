import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { encodeSecret } from "../../src/auth/accounts.ts";
import { createCredentialStore } from "../../src/credentials/store.ts";
import { routeStep } from "../../src/routing/turn-step.ts";
import { createUsageMonitor, type UsageMonitor } from "../../src/usage/monitor.ts";
import type { StatusSnapshotWriter } from "../../src/usage/status-snapshot.ts";
import type { FakeEngine, FakeHttpReply, FakeHttpResponder } from "../support/fake-engine.ts";
import { assertNoSentinel, makeSentinel } from "../support/sentinel.ts";
import { CHAT_URL, MODEL, SESSION, chatTurn, collect, harness, recordingSnapshot, remember, signIn, spyNext, step, textOf, userText } from "../support/routing.ts";

const USAGE_URL = "https://opencode.ai/zen/go/v1/usage";
const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const CODEX_URL = "https://chatgpt.com/backend-api/codex/responses";
const XAI_URL = "https://api.x.ai/v1/responses";
const CLINE_URL = "https://api.cline.bot/api/v1/chat/completions";
const CODEX_MODEL = "openai-codex/gpt-5.6";
const XAI_MODEL = "xai/grok-4.6";
const CLINE_MODEL = "cline-pass/glm-5.3";
const CLAUDE_MODEL = "claude-sonnet-5-5";
const OPENCODE_LINE = `${MODEL} · thinking off · 5h 12% · weekly 41% · monthly 7%`;

// A status line that names the model and its thinking level, and no usage window.
const MODEL_AND_THINKING = (model: string): RegExp => new RegExp(`^${model.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")} · thinking [a-z]+$`);

function fixtureText(path: string[]): string {
  return readFileSync(join(import.meta.dirname, "..", "fixtures", ...path), "utf8");
}

const OPENCODE_OK: FakeHttpReply = { status: 200, body: JSON.parse(fixtureText(["opencode-go-usage.json"])) as unknown };
const OPENRESPONSES_SSE = fixtureText(["sse", "openai-responses.sse"]);
const CODEX_SSE = fixtureText(["sse", "codex-responses.sse"]);
// The Responses stream the xAI wire answers with.
const CHAT_XAI: FakeHttpReply = { status: 200, text: OPENRESPONSES_SSE };
const CODEX_HEADERS = {
  "x-codex-primary-used-percent": "23",
  "x-codex-primary-window-minutes": "300",
  "x-codex-primary-reset-at": "1798000000",
  "x-codex-secondary-used-percent": "41",
  "x-codex-secondary-window-minutes": "10080",
  "x-codex-secondary-reset-at": "1798500000",
};

// The catalog the routed steps read: one model per provider the tests route to.
const CACHE = {
  version: 1,
  providers: {
    "opencode-go": {
      fetchedAt: 1,
      status: "ok",
      models: [
        {
          id: MODEL,
          provider: "opencode-go",
          model: "kimi-k3.1-pro",
          name: "Kimi",
          wire: "openai-completions",
          baseUrl: "https://opencode.ai/inference/go/v1",
          reasoningEfforts: ["low", "medium"],
          vision: false,
        },
      ],
    },
    "openai-codex": {
      fetchedAt: 1,
      status: "ok",
      models: [
        {
          id: CODEX_MODEL,
          provider: "openai-codex",
          model: "gpt-5.6",
          name: "GPT",
          wire: "openai-codex-responses",
          baseUrl: "https://chatgpt.com/backend-api",
          reasoningEfforts: ["low", "medium"],
          vision: false,
        },
      ],
    },
    xai: {
      fetchedAt: 1,
      status: "ok",
      models: [
        { id: XAI_MODEL, provider: "xai", model: "grok-4.6", name: "Grok", wire: "openai-responses", baseUrl: "https://api.x.ai/v1", vision: false },
      ],
    },
    "cline-pass": {
      fetchedAt: 1,
      status: "ok",
      models: [
        {
          id: CLINE_MODEL,
          provider: "cline-pass",
          model: "glm-5.3",
          name: "GLM",
          wire: "openai-completions",
          baseUrl: "https://api.cline.bot/api/v1",
          vision: false,
        },
      ],
    },
  },
};

// An OpenAI-style chat reply that says "ok".
const ok = (): FakeHttpReply => ({ status: 200, text: chatTurn({ text: "ok" }) });

// Answers the usage endpoint with `usage()`, and each routed endpoint with the next of `chat`, in order.
function answers(options: { usage?: () => FakeHttpReply | undefined; chat?: FakeHttpReply[] }): FakeHttpResponder {
  const queue = [...(options.chat ?? [])];
  return (request) => {
    if (request.url === USAGE_URL) return options.usage?.();
    if ([CHAT_URL, CODEX_URL, XAI_URL, CLINE_URL].includes(request.url)) return queue.shift();
    return undefined;
  };
}

// Holds every OpenCode Go usage reply until the returned function runs, so a test can settle a read late.
// The request is still sent and recorded when it is made.
function holdUsage(engine: FakeEngine): () => void {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const fetch = engine.http.fetch;
  engine.http.fetch = (url, init) =>
    url === USAGE_URL ? fetch(url, init).then(async (reply) => (await gate, reply)) : fetch(url, init);
  return () => release();
}

// Lets the background reads and their redraws settle.
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function usageRequests(engine: FakeEngine): unknown[] {
  return engine.recorded.http.filter((request) => request.url === USAGE_URL);
}

function statusOf(engine: FakeEngine): string | undefined {
  return engine.recorded.status.at(-1);
}

// A monitor on a clock the test moves by hand.
function clockedMonitor(): { monitor: UsageMonitor; time: { at: number } } {
  const time = { at: 0 };
  return { monitor: createUsageMonitor(() => time.at), time };
}

async function codexLogin(engine: FakeEngine): Promise<void> {
  const secret = { type: "oauth" as const, access: "sentinel-access", refresh: "sentinel-refresh", expires: Date.now() + 3_600_000, accountId: "acct-test" };
  await createCredentialStore(engine).save("openai-codex", "default", encodeSecret(secret));
}

describe("the routed status line with provider usage", () => {
  it("shows the model, thinking level and each window once a provider's reading arrives", async () => {
    const h = harness({ http: answers({ usage: () => OPENCODE_OK, chat: [ok()] }) });
    await h.engine.store.set("catalog.cache", CACHE);
    await signIn(h.engine);
    remember(h.capture);
    const { chunks } = await collect(routeStep(h.router, step(0), spyNext()));

    await vi.waitFor(() => expect(statusOf(h.engine)).toBe(OPENCODE_LINE));
    expect(textOf(chunks)).toBe("ok");
  });

  it("shows only the new provider's line when a step on another provider completes before the earlier reading finishes", async () => {
    const { monitor, time } = clockedMonitor();
    const h = harness({ http: answers({ usage: () => OPENCODE_OK, chat: [ok(), ok(), CHAT_XAI] }) }, undefined, monitor);
    await h.engine.store.set("catalog.cache", CACHE);
    await signIn(h.engine);
    await signIn(h.engine, "xai", "sentinel-xai");
    remember(h.capture);
    await collect(routeStep(h.router, step(0), spyNext()));
    await vi.waitFor(() => expect(statusOf(h.engine)).toBe(OPENCODE_LINE));

    const release = holdUsage(h.engine);
    time.at = 60_000;
    await collect(routeStep(h.router, step(1), spyNext()));
    expect(statusOf(h.engine)).toBe(OPENCODE_LINE);
    await collect(routeStep(h.router, step(2, XAI_MODEL), spyNext()));
    expect(statusOf(h.engine)).toMatch(MODEL_AND_THINKING(XAI_MODEL));

    release();
    await settle();
    expect(statusOf(h.engine)).toMatch(MODEL_AND_THINKING(XAI_MODEL));
    expect(statusOf(h.engine)).not.toContain("5h 12%");
  });

  it("shows xAI and ClinePass as model and thinking only, and sends no usage request", async () => {
    const h = harness({ http: answers({ chat: [CHAT_XAI, ok()] }) });
    await h.engine.store.set("catalog.cache", CACHE);
    await signIn(h.engine, "xai", "sentinel-xai");
    await signIn(h.engine, "cline-pass", "sentinel-cline");

    await collect(routeStep(h.router, step(0, XAI_MODEL), spyNext()));
    expect(statusOf(h.engine)).toMatch(MODEL_AND_THINKING(XAI_MODEL));
    await collect(routeStep(h.router, step(1, CLINE_MODEL), spyNext()));
    expect(statusOf(h.engine)).toMatch(MODEL_AND_THINKING(CLINE_MODEL));
    await settle();
    expect(h.engine.recorded.http.filter((request) => request.url.includes("usage"))).toEqual([]);
  });

  it("sends one usage request per minute at most, and shows the kept windows in between", async () => {
    const { monitor, time } = clockedMonitor();
    const h = harness({ http: answers({ usage: () => OPENCODE_OK, chat: [ok(), ok(), ok()] }) }, undefined, monitor);
    await h.engine.store.set("catalog.cache", CACHE);
    await signIn(h.engine);
    remember(h.capture);
    await collect(routeStep(h.router, step(0), spyNext()));
    await vi.waitFor(() => expect(statusOf(h.engine)).toBe(OPENCODE_LINE));

    time.at = 59_999;
    await collect(routeStep(h.router, step(1), spyNext()));
    expect(statusOf(h.engine)).toBe(OPENCODE_LINE);
    expect(usageRequests(h.engine)).toHaveLength(1);

    time.at = 60_000;
    await collect(routeStep(h.router, step(2), spyNext()));
    expect(usageRequests(h.engine)).toHaveLength(2);
  });

  it("shows the windows an OpenAI Codex response's headers report, and sends no request to the usage endpoint", async () => {
    const h = harness({ http: answers({ chat: [{ status: 200, headers: CODEX_HEADERS, text: CODEX_SSE }] }) });
    await h.engine.store.set("catalog.cache", CACHE);
    await codexLogin(h.engine);

    await collect(routeStep(h.router, step(0, CODEX_MODEL), spyNext()));

    expect(statusOf(h.engine)).toBe(`${CODEX_MODEL} · thinking off · 5h 23% · 7d 41%`);
    await settle();
    expect(h.engine.recorded.http.filter((request) => request.url === CODEX_USAGE_URL)).toEqual([]);
  });

  it.each([
    ["an HTTP error", (): FakeHttpReply => ({ status: 500, text: "boom" })],
    ["an unreachable host", (): undefined => undefined],
    ["a body that does not match", (): FakeHttpReply => ({ status: 200, body: { usage: {} } })],
  ])("leaves the step's answer unchanged on %s, and shows the model and thinking level only", async (_label, usage) => {
    const h = harness({ http: answers({ usage, chat: [ok()] }) });
    await h.engine.store.set("catalog.cache", CACHE);
    await signIn(h.engine);
    remember(h.capture);

    const { chunks, result } = await collect(routeStep(h.router, step(0), spyNext()));
    await settle();

    expect(textOf(chunks)).toBe("ok");
    expect(result).toMatchObject({ answer: "ok", stopReason: "end_turn" });
    expect(statusOf(h.engine)).toBe(`${MODEL} · thinking off`);
  });

  it("keeps the last good windows when a later reading fails", async () => {
    const { monitor, time } = clockedMonitor();
    let usage: FakeHttpReply | undefined = OPENCODE_OK;
    const h = harness({ http: answers({ usage: () => usage, chat: [ok(), ok()] }) }, undefined, monitor);
    await h.engine.store.set("catalog.cache", CACHE);
    await signIn(h.engine);
    remember(h.capture);
    await collect(routeStep(h.router, step(0), spyNext()));
    await vi.waitFor(() => expect(statusOf(h.engine)).toBe(OPENCODE_LINE));

    usage = { status: 500 };
    time.at = 60_000;
    const { chunks } = await collect(routeStep(h.router, step(1), spyNext()));
    await settle();

    expect(textOf(chunks)).toBe("ok");
    expect(statusOf(h.engine)).toBe(OPENCODE_LINE);
    expect(usageRequests(h.engine)).toHaveLength(2);
  });

  it("shows the error line with no windows when a routed step after a good reading fails", async () => {
    const h = harness({ http: answers({ usage: () => OPENCODE_OK, chat: [ok(), { status: 401, text: '{"error":"bad key"}' }] }) });
    await h.engine.store.set("catalog.cache", CACHE);
    await signIn(h.engine);
    remember(h.capture);
    await collect(routeStep(h.router, step(0), spyNext()));
    await vi.waitFor(() => expect(statusOf(h.engine)).toBe(OPENCODE_LINE));

    await collect(routeStep(h.router, step(1), spyNext()));

    expect(statusOf(h.engine)).toBe(`${MODEL} · OpenCode Go error: unauthenticated`);
  });

  it("clears the line on a Claude main-loop step, sends no usage request, and a read settling after it does not redraw", async () => {
    const { monitor, time } = clockedMonitor();
    const h = harness({ http: answers({ usage: () => OPENCODE_OK, chat: [ok(), ok()] }) }, undefined, monitor);
    await h.engine.store.set("catalog.cache", CACHE);
    await signIn(h.engine);
    remember(h.capture);
    await collect(routeStep(h.router, step(0), spyNext()));
    await vi.waitFor(() => expect(statusOf(h.engine)).toBe(OPENCODE_LINE));

    const release = holdUsage(h.engine);
    time.at = 60_000;
    await collect(routeStep(h.router, step(1), spyNext()));
    const reads = usageRequests(h.engine).length;

    await collect(routeStep(h.router, step(2, CLAUDE_MODEL), spyNext()));
    expect(statusOf(h.engine)).toBe("");
    const lines = h.engine.recorded.status.length;

    release();
    await settle();
    expect(h.engine.recorded.status).toHaveLength(lines);
    expect(statusOf(h.engine)).toBe("");
    expect(usageRequests(h.engine)).toHaveLength(reads);
  });

  it("keeps a sentinel credential out of the status line, the logs and the store", async () => {
    const sentinel = makeSentinel();
    const h = harness({ http: answers({ usage: () => OPENCODE_OK, chat: [ok()] }) });
    await h.engine.store.set("catalog.cache", CACHE);
    await signIn(h.engine, "opencode-go", sentinel);
    remember(h.capture);
    await collect(routeStep(h.router, step(0), spyNext()));
    await vi.waitFor(() => expect(statusOf(h.engine)).toBe(OPENCODE_LINE));

    assertNoSentinel(h.engine, sentinel, h.engine.recorded.status);
  });
});

// The snapshot the router publishes for a custom status-line command: the shown provider's windows on each routed
// main-loop step and once its reading settles, a cleared snapshot on a Claude main-loop step, and nothing from a subagent.
describe("the routed status snapshot", () => {
  it("publishes the model with no windows, then the windows once the provider's reading settles", async () => {
    const { writer, calls } = recordingSnapshot();
    const h = harness({ http: answers({ usage: () => OPENCODE_OK, chat: [ok()] }) }, undefined, undefined, writer);
    await h.engine.store.set("catalog.cache", CACHE);
    await signIn(h.engine);
    remember(h.capture);
    const release = holdUsage(h.engine);

    await collect(routeStep(h.router, step(0), spyNext()));
    expect(calls).toEqual([{ kind: "show", sessionId: SESSION, provider: "opencode-go", model: MODEL, usage: undefined }]);

    release();
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toMatchObject({
      kind: "show",
      sessionId: SESSION,
      provider: "opencode-go",
      model: MODEL,
      usage: { windows: [{ label: "5h", usedPercent: 12 }, { label: "weekly", usedPercent: 41 }, { label: "monthly", usedPercent: 7 }] },
    });
  });

  it("publishes the windows an OpenAI Codex response's headers report, and sends no request to the usage endpoint", async () => {
    const { writer, calls } = recordingSnapshot();
    const h = harness({ http: answers({ chat: [{ status: 200, headers: CODEX_HEADERS, text: CODEX_SSE }] }) }, undefined, undefined, writer);
    await h.engine.store.set("catalog.cache", CACHE);
    await codexLogin(h.engine);

    await collect(routeStep(h.router, step(0, CODEX_MODEL), spyNext()));
    await settle();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      kind: "show",
      sessionId: SESSION,
      provider: "openai-codex",
      model: CODEX_MODEL,
      usage: { windows: [{ label: "5h", usedPercent: 23 }, { label: "7d", usedPercent: 41 }] },
    });
    expect(h.engine.recorded.http.filter((request) => request.url === CODEX_USAGE_URL)).toEqual([]);
  });

  it("publishes the new provider with no windows when a step on another provider completes before the earlier reading finishes", async () => {
    const { monitor, time } = clockedMonitor();
    const { writer, calls } = recordingSnapshot();
    const h = harness({ http: answers({ usage: () => OPENCODE_OK, chat: [ok(), ok(), CHAT_XAI] }) }, undefined, monitor, writer);
    await h.engine.store.set("catalog.cache", CACHE);
    await signIn(h.engine);
    await signIn(h.engine, "xai", "sentinel-xai");
    remember(h.capture);
    await collect(routeStep(h.router, step(0), spyNext()));
    await vi.waitFor(() => expect(calls).toHaveLength(2));

    const release = holdUsage(h.engine);
    time.at = 60_000;
    await collect(routeStep(h.router, step(1), spyNext()));
    await collect(routeStep(h.router, step(2, XAI_MODEL), spyNext()));
    release();
    await settle();

    expect(calls).toHaveLength(4);
    expect(calls.at(-1)).toEqual({ kind: "show", sessionId: SESSION, provider: "xai", model: XAI_MODEL, usage: undefined });
  });

  it("publishes a failed step with no windows, and a Claude main-loop step clears the snapshot", async () => {
    const { writer, calls } = recordingSnapshot();
    const h = harness(
      { http: answers({ usage: () => OPENCODE_OK, chat: [ok(), { status: 401, text: '{"error":"bad key"}' }] }) },
      undefined,
      undefined,
      writer,
    );
    await h.engine.store.set("catalog.cache", CACHE);
    await signIn(h.engine);
    remember(h.capture);
    await collect(routeStep(h.router, step(0), spyNext()));
    await vi.waitFor(() => expect(calls).toHaveLength(2));

    await collect(routeStep(h.router, step(1), spyNext()));
    expect(calls.at(-1)).toEqual({ kind: "show", sessionId: SESSION, provider: "opencode-go", model: MODEL, usage: undefined });

    await collect(routeStep(h.router, step(2, CLAUDE_MODEL), spyNext()));
    expect(calls.at(-1)).toEqual({ kind: "clear", sessionId: SESSION });
  });

  it("shows the error line and publishes nothing when the session id cannot be read", async () => {
    const { writer, calls } = recordingSnapshot();
    const h = harness({ http: answers({ chat: [ok()] }) }, undefined, undefined, writer);
    await h.engine.store.set("catalog.cache", CACHE);
    await signIn(h.engine);
    remember(h.capture);
    h.engine.session.id = () => Promise.reject(new Error("no session"));

    const { chunks } = await collect(routeStep(h.router, step(0), spyNext()));

    expect(textOf(chunks)).not.toBe("");
    expect(statusOf(h.engine)).toBe(`${MODEL} · OpenCode Go error: internal`);
    expect(calls).toEqual([]);
  });

  it("leaves the step's answer, chunks and status line unchanged when the writer throws", async () => {
    const broken: StatusSnapshotWriter = {
      show: () => {
        throw new Error("disk full");
      },
      clear: () => {
        throw new Error("disk full");
      },
    };
    const h = harness({ http: answers({ usage: () => OPENCODE_OK, chat: [ok()] }) }, undefined, undefined, broken);
    await h.engine.store.set("catalog.cache", CACHE);
    await signIn(h.engine);
    remember(h.capture);

    const { chunks, result } = await collect(routeStep(h.router, step(0), spyNext()));
    expect(textOf(chunks)).toBe("ok");
    expect(result).toMatchObject({ answer: "ok", stopReason: "end_turn" });
    await vi.waitFor(() => expect(statusOf(h.engine)).toBe(OPENCODE_LINE));

    await collect(routeStep(h.router, step(1, CLAUDE_MODEL), spyNext()));
    expect(statusOf(h.engine)).toBe("");
    expect(h.engine.recorded.ui.join("\n")).not.toContain("disk full");
  });

  it("leaves the snapshot alone on a routed or a Claude subagent step", async () => {
    const { writer, calls } = recordingSnapshot();
    const h = harness(
      {
        http: answers({ usage: () => OPENCODE_OK, chat: [ok(), ok()] }),
        session: { id: SESSION, messages: [userText("Fix the notes")], agents: { "agent-1": [userText("Sub task")] } },
      },
      undefined,
      undefined,
      writer,
    );
    await h.engine.store.set("catalog.cache", CACHE);
    await signIn(h.engine);
    remember(h.capture);
    await collect(routeStep(h.router, step(0), spyNext()));
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    const before = [...calls];

    await collect(routeStep(h.router, step(0, MODEL, { agentId: "agent-1" }), spyNext()));
    await collect(routeStep(h.router, step(0, CLAUDE_MODEL, { agentId: "agent-2" }), spyNext()));
    await settle();

    expect(calls).toEqual(before);
  });
});

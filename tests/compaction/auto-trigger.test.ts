import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SUMMARY_TIMEOUT_MS, createAutoTrigger, type TriggerDeps } from "../../src/compaction/auto-trigger.ts";
import { shouldCompact, thresholdTokens } from "../../src/compaction/threshold.ts";
import { MAIN_LOOP } from "../../src/routing/session-tracker.ts";
import { routeStep } from "../../src/routing/turn-step.ts";
import type { ApiMessageInput } from "../../src/translate/messages.ts";
import { CHAT_URL, HEAD, MODEL, chatTurn, collect, harness, postsTo, signIn, spyNext, step, textOf, userText, type Harness } from "../support/routing.ts";
import type { FakeHttpResponder } from "../support/fake-engine.ts";
import { usageOf } from "../support/fake-turn.ts";

const WINDOW = 128000;

// Waits for the callbacks the fake clock scheduled and the summary they start.
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

// A timer other than a 0-ms one, which the test fires itself.
type Timer = { readonly ms: number; readonly fn: () => void };

function assistantText(text: string): ApiMessageInput {
  return { role: "assistant", content: [{ type: "text", text }] };
}

// Trigger deps over a harness, as hooks/register.ts builds them, with a 128000-token window.
// A 0-ms timer runs on the next macrotask; any other waits in `timers` for the test to fire it.
function triggerDeps(
  h: Harness,
  overrides: Partial<TriggerDeps> = {},
): TriggerDeps & { readonly logs: string[]; readonly debugLogs: string[]; readonly timers: Timer[] } {
  const logs: string[] = [];
  const debugLogs: string[] = [];
  const timers: Timer[] = [];
  return {
    tracker: h.tracker,
    view: h.view,
    describe: async (model) => ({ ...(await h.router.describe(model)), contextWindow: WINDOW }),
    complete: (model, request, signal) => h.router.complete(model, request, signal),
    messages: () => h.engine.session.messages({ as: "api" }),
    after: (ms, fn) => {
      if (ms === 0) h.engine.clock.after(ms, fn);
      else timers.push({ ms, fn });
    },
    log: (text) => logs.push(text),
    debug: (text) => debugLogs.push(text),
    logs,
    debugLogs,
    timers,
    ...overrides,
  };
}

// Every summarization request the provider received, as its body text.
function summaryBodies(h: Harness): string[] {
  return postsTo(h.engine, CHAT_URL)
    .map((request) => request.body ?? "")
    .filter((body) => body.includes("<conversation>"));
}

// A routed main loop at the given context, on a transcript of the given messages.
async function routedAt(tokens: number, messages: ApiMessageInput[], http: FakeHttpResponder): Promise<Harness> {
  const h = harness({ http }, messages);
  await signIn(h.engine);
  h.tracker.recordStep(MAIN_LOOP, MODEL);
  h.tracker.recordUsage(MAIN_LOOP, usageOf(tokens));
  return h;
}

// Answers each chat request with the next reply in order.
function queue(...texts: string[]): FakeHttpResponder {
  const left = [...texts];
  return (request) => {
    if (request.url !== CHAT_URL) return undefined;
    const text = left.shift();
    return text === undefined ? undefined : { status: 200, text };
  };
}

// AC2: the threshold is the window less the larger of 15% and 16384 tokens.
describe("the compaction threshold", () => {
  it("is 108800 tokens for a 128000-token window", () => {
    expect(thresholdTokens(128000)).toBe(108800);
  });

  it("is reached at 108800 tokens and not at 108799", () => {
    expect(shouldCompact(108800, 128000)).toBe(true);
    expect(shouldCompact(108799, 128000)).toBe(false);
  });
});

// AC2, SCN002: a main-loop turn at the threshold summarizes in place on the provider.
describe("the in-place summary", () => {
  it("summarizes on the provider when a turn ends at 108800, and never starts a Claude Code compaction", async () => {
    const transcript = [userText("Plan the notes change"), assistantText("Here is the plan.")];
    const h = await routedAt(108800, transcript, queue(chatTurn({ text: "Plan summary." })));
    const deps = triggerDeps(h);

    await createAutoTrigger(deps).onTurnComplete();
    await tick();

    const bodies = summaryBodies(h);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toContain("[User]: Plan the notes change");
    expect(h.view.get(MAIN_LOOP)).toEqual({ summary: "Plan summary.", model: MODEL, cut: 2 });
    expect(h.tracker.contextTokens(MAIN_LOOP)).toBe(0);
    expect(h.engine.recorded.compacts).toEqual([]);
    expect(h.engine.recorded.coreSummaries).toBe(0);
    expect(h.engine.recorded.http.every((call) => !call.url.includes("anthropic"))).toBe(true);
  });

  it("does nothing when the turn ends one token below the threshold", async () => {
    const h = await routedAt(108799, [userText("Hi")], queue(chatTurn({ text: "unused" })));

    await createAutoTrigger(triggerDeps(h)).onTurnComplete();
    await tick();

    expect(h.engine.recorded.http).toEqual([]);
    expect(h.view.get(MAIN_LOOP)).toBeUndefined();
  });

  it("does nothing for a model with no known window, whose window the engine already handles", async () => {
    const h = await routedAt(500000, [userText("Hi")], queue());
    const deps = triggerDeps(h, { describe: async () => ({ provider: "Anthropic", contextWindow: undefined, maxOutput: undefined }) });
    h.tracker.recordStep(MAIN_LOOP, "claude-sonnet-5-5");

    await createAutoTrigger(deps).onTurnComplete();
    await tick();

    expect(h.engine.recorded.http).toEqual([]);
  });

  it("sends the next routed request with the summary first and only the messages after the cut", async () => {
    const transcript = [userText("Old question"), assistantText("Old answer.")];
    const h = await routedAt(120000, transcript, queue(chatTurn({ text: "Earlier work." }), chatTurn({ text: "Next." })));
    await createAutoTrigger(triggerDeps(h)).onTurnComplete();
    await tick();
    transcript.push(userText("New question"));

    const turns = h.view.apply(MAIN_LOOP, transcript);

    expect(turns).toHaveLength(1);
    const text = JSON.stringify(turns);
    expect(text).toContain("<summary>\\nEarlier work.\\n</summary>");
    expect(text).toContain("New question");
    expect(text).not.toContain("Old question");
    expect(turns[0]?.content[0]).toEqual({ type: "text", text: expect.stringContaining("compacted by opencode-go/kimi-k3.1-pro") });
  });

  it("carries the earlier summary as prior at a second crossing, and summarizes only the newer messages", async () => {
    const transcript = [userText("First task"), assistantText("First done.")];
    const h = await routedAt(120000, transcript, queue(chatTurn({ text: "Summary one." }), chatTurn({ text: "Summary two." })));
    const trigger = createAutoTrigger(triggerDeps(h));
    await trigger.onTurnComplete();
    await tick();
    transcript.push(userText("Second task"), assistantText("Second done."));
    h.tracker.recordUsage(MAIN_LOOP, usageOf(120000));

    await trigger.onTurnComplete();
    await tick();

    const second = summaryBodies(h)[1] ?? "";
    expect(second).toContain("[Earlier summary]: Summary one.");
    expect(second).toContain("[User]: Second task");
    expect(second).not.toContain("First task");
    expect(h.view.get(MAIN_LOOP)).toEqual({ summary: "Summary two.", model: MODEL, cut: 4 });
  });

  it("starts one summary at a time", async () => {
    const h = await routedAt(120000, [userText("Hi")], queue(chatTurn({ text: "One." }), chatTurn({ text: "Two." })));
    const trigger = createAutoTrigger(triggerDeps(h));

    await trigger.onTurnComplete();
    await trigger.onTurnComplete();
    await tick();

    expect(summaryBodies(h)).toHaveLength(1);
  });

  it("never throws, and logs once to debug, when the window cannot be read", async () => {
    const h = await routedAt(120000, [userText("Hi")], queue());
    const deps = triggerDeps(h, {
      describe: async () => {
        throw new Error("catalog unavailable");
      },
    });

    await expect(createAutoTrigger(deps).onTurnComplete()).resolves.toBeUndefined();
    expect(deps.debugLogs).toEqual(["nmg-router could not check the context threshold."]);
    expect(h.engine.recorded.http).toEqual([]);
  });
});

// AC8, SCN008: a failed in-place summary leaves the view, names the provider, and retries at the next turn end.
describe("a failed in-place summary", () => {
  it.each<[string, FakeHttpResponder, string]>([
    ["a 500", (request) => (request.url === CHAT_URL ? { status: 500, text: "{}" } : undefined), "server_error"],
    ["a network failure", () => undefined, "network"],
    ["an empty summary", queue(chatTurn({ text: "" })), "malformed"],
  ])("logs one line naming OpenCode Go for %s and leaves the view unchanged", async (_label, http, kind) => {
    const h = await routedAt(120000, [userText("Hi")], http);
    h.view.set(MAIN_LOOP, { summary: "Kept.", model: MODEL, cut: 0 });
    const deps = triggerDeps(h);

    await createAutoTrigger(deps).onTurnComplete();
    await tick();

    expect(deps.logs).toEqual([`OpenCode Go could not summarize this conversation (${kind}); it will be retried at the next turn end.`]);
    expect(h.view.get(MAIN_LOOP)).toEqual({ summary: "Kept.", model: MODEL, cut: 0 });
    expect(h.tracker.contextTokens(MAIN_LOOP)).toBe(120000);
    expect(h.engine.recorded.compacts).toEqual([]);
    expect(h.engine.recorded.coreSummaries).toBe(0);
    expect(h.engine.recorded.http.every((call) => !call.url.includes("anthropic"))).toBe(true);
  });

  it("retries at the next turn end and then keeps the summary", async () => {
    let fail = true;
    const h = await routedAt(120000, [userText("Hi")], (request) => {
      if (request.url !== CHAT_URL) return undefined;
      return fail ? { status: 500, text: "{}" } : { status: 200, text: chatTurn({ text: "Second try." }) };
    });
    const deps = triggerDeps(h);
    const trigger = createAutoTrigger(deps);

    await trigger.onTurnComplete();
    await tick();
    expect(deps.logs).toHaveLength(1);
    expect(h.view.get(MAIN_LOOP)).toBeUndefined();

    fail = false;
    await trigger.onTurnComplete();
    await tick();
    expect(h.view.get(MAIN_LOOP)?.summary).toBe("Second try.");
    expect(deps.logs).toHaveLength(1);
  });
});

// The one line a summary that misses its deadline logs.
const TIMED_OUT = "OpenCode Go could not summarize this conversation (timed_out); it will be retried at the next turn end.";

// The curl probe succeeds, so a routed request goes through a child the script describes.
function curlProbe(argv: readonly string[]) {
  return argv[0] === "curl" ? { exitCode: 0, stdout: "curl 8", stderr: "", isStdoutTruncated: false, isStderrTruncated: false } : undefined;
}

// FR1, FR2, AC1-AC3: an in-place summary is aborted at 120 seconds, dropped and retried at the next turn end.
describe("the summary deadline", () => {
  it("is 120 seconds", () => {
    expect(SUMMARY_TIMEOUT_MS).toBe(120000);
  });

  it("aborts a summary that the curl child never finishes, and the waiting routed step then answers", async () => {
    let children = 0;
    const h = harness(
      {
        run: curlProbe,
        spawn: () => {
          children += 1;
          return children === 1 ? { pieces: [HEAD], hang: true } : { pieces: [HEAD, chatTurn({ text: "Answer." })] };
        },
      },
      [userText("Hi")],
    );
    await signIn(h.engine);
    h.tracker.recordStep(MAIN_LOOP, MODEL);
    h.tracker.recordUsage(MAIN_LOOP, usageOf(120000));
    h.view.set(MAIN_LOOP, { summary: "Kept.", model: MODEL, cut: 0 });
    const deps = triggerDeps(h);

    await createAutoTrigger(deps).onTurnComplete();
    await tick();
    expect(deps.timers.map((timer) => timer.ms)).toEqual([SUMMARY_TIMEOUT_MS]);
    expect(h.view.pending(MAIN_LOOP)).toBeDefined();

    deps.timers[0]?.fn();
    await tick();

    expect(h.engine.recorded.events).toContain("child:killed");
    expect(deps.logs).toEqual([TIMED_OUT]);
    expect(h.view.get(MAIN_LOOP)).toEqual({ summary: "Kept.", model: MODEL, cut: 0 });
    expect(h.tracker.contextTokens(MAIN_LOOP)).toBe(120000);
    expect(h.view.pending(MAIN_LOOP)).toBeUndefined();

    const routed = await collect(routeStep(h.router, step(1), spyNext()));
    expect(textOf(routed.chunks)).toBe("Answer.");
  });

  // Whatever complete does at the deadline, the summary settles, logs once and keeps the view.
  it.each<[string, TriggerDeps["complete"]]>([
    [
      "answers partial text",
      (_model, _request, signal) => new Promise<string>((resolve) => signal.addEventListener("abort", () => resolve("Partial."), { once: true })),
    ],
    [
      "rejects",
      (_model, _request, signal) =>
        new Promise<string>((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true })),
    ],
    ["never settles", () => new Promise<string>(() => undefined)],
  ])("logs one timed_out line and keeps the view when complete %s at the deadline", async (_label, complete) => {
    const h = await routedAt(120000, [userText("Hi")], queue());
    h.view.set(MAIN_LOOP, { summary: "Kept.", model: MODEL, cut: 0 });
    const deps = triggerDeps(h, { complete });

    await createAutoTrigger(deps).onTurnComplete();
    await tick();
    deps.timers[0]?.fn();
    await tick();

    expect(deps.logs).toEqual([TIMED_OUT]);
    expect(h.view.get(MAIN_LOOP)).toEqual({ summary: "Kept.", model: MODEL, cut: 0 });
    expect(h.tracker.contextTokens(MAIN_LOOP)).toBe(120000);
    expect(h.view.pending(MAIN_LOOP)).toBeUndefined();
  });

  it("sends a second summary at the next turn end after a timed-out one, and keeps its reply", async () => {
    let children = 0;
    const h = harness(
      {
        run: curlProbe,
        spawn: () => {
          children += 1;
          return children === 1 ? { pieces: [HEAD], hang: true } : { pieces: [HEAD, chatTurn({ text: "Second try." })] };
        },
      },
      [userText("Hi")],
    );
    await signIn(h.engine);
    h.tracker.recordStep(MAIN_LOOP, MODEL);
    h.tracker.recordUsage(MAIN_LOOP, usageOf(120000));
    const deps = triggerDeps(h);
    const trigger = createAutoTrigger(deps);

    await trigger.onTurnComplete();
    await tick();
    deps.timers[0]?.fn();
    await tick();
    expect(h.view.get(MAIN_LOOP)).toBeUndefined();

    await trigger.onTurnComplete();
    await tick();

    expect(h.view.get(MAIN_LOOP)).toEqual({ summary: "Second try.", model: MODEL, cut: 1 });
    expect(deps.logs).toEqual([TIMED_OUT]);
    expect(h.engine.recorded.processes.filter((process) => process.stdin?.includes("<conversation>"))).toHaveLength(2);
  });

  it("keeps a summary that returns before the deadline, and logs no timeout line", async () => {
    const h = await routedAt(120000, [userText("Hi")], queue(chatTurn({ text: "Quick." })));
    const deps = triggerDeps(h);

    await createAutoTrigger(deps).onTurnComplete();
    await tick();
    expect(h.view.get(MAIN_LOOP)).toEqual({ summary: "Quick.", model: MODEL, cut: 1 });

    // The deadline fires after the summary has settled, and changes nothing.
    deps.timers[0]?.fn();
    await tick();

    expect(deps.timers.map((timer) => timer.ms)).toEqual([SUMMARY_TIMEOUT_MS]);
    expect(h.view.get(MAIN_LOOP)).toEqual({ summary: "Quick.", model: MODEL, cut: 1 });
    expect(h.tracker.contextTokens(MAIN_LOOP)).toBe(0);
    expect(deps.logs).toEqual([]);
  });
});

// AC2, FR2: the mod never starts a Claude Code compaction, so no source file calls `$.session.compact()`.
describe("the mod's sources", () => {
  it("never call session.compact()", () => {
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? files(join(dir, entry.name)) : entry.name.endsWith(".ts") ? [join(dir, entry.name)] : [],
      );
    const callers = [...files("src"), "hooks/register.ts"].filter((path) =>
      readFileSync(path, "utf8")
        .split("\n")
        .some((line) => !line.trim().startsWith("//") && /session\.compact\(/.test(line)),
    );
    expect(callers).toEqual([]);
  });
});

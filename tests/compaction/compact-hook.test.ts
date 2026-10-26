import { describe, expect, it } from "vitest";
import { compactFailure, compactSession, type CompactDeps } from "../../src/compaction/compact-hook.ts";
import { MAIN_LOOP } from "../../src/routing/session-tracker.ts";
import { CHAT_URL, MODEL, chatTurn, harness, postsTo, replies, signIn, userText } from "../support/routing.ts";
import { assistant, compactInput, compactNext, user, usageOf } from "../support/fake-turn.ts";

const CLAUDE = "claude-sonnet-5-5";
const TRANSCRIPT = [user("Plan the notes change"), assistant("Here is the plan.")];

// Each deps value over a harness, with the selected model the test chooses.
function depsOf(h: ReturnType<typeof harness>, selected: string = MODEL): CompactDeps {
  return {
    router: h.router,
    tracker: h.tracker,
    selectedModel: async () => selected,
    view: h.view,
    messages: () => h.engine.session.messages({ as: "api" }),
  };
}

// AC1: a routed model's summary replaces the transcript, carries the focus, and never reaches Anthropic.
describe("routed compaction", () => {
  it("summarizes the transcript on the selected routed model, and answers one summary message", async () => {
    const h = harness({ http: replies(chatTurn({ text: "The plan is kept." })) });
    await signIn(h.engine);
    h.tracker.recordUsage(MAIN_LOOP, usageOf(50000));
    const next = compactNext();

    const result = await compactSession(depsOf(h), compactInput(TRANSCRIPT, { instructions: "keep the plan" }), next);

    expect(result).toEqual({
      messages: [
        {
          role: "user",
          toolUses: [],
          text: expect.stringMatching(/^This session continues from an earlier conversation that was compacted by opencode-go\/kimi-k3\.1-pro\. Summary of the earlier conversation:\n\n<summary>\nThe plan is kept\.\n<\/summary>$/),
        },
      ],
    });
    const [request] = postsTo(h.engine, CHAT_URL);
    expect(request?.body).toContain("Additional focus: keep the plan");
    expect(request?.body).toContain("[User]: Plan the notes change");
    expect(h.engine.recorded.http.every((call) => !call.url.includes("anthropic"))).toBe(true);
    expect(next.calls).toEqual([]);
    expect(h.tracker.contextTokens(MAIN_LOOP)).toBe(0);
  });

  it("passes a Claude model's compaction to core unchanged", async () => {
    const h = harness();
    const next = compactNext();

    const result = await compactSession(depsOf(h, CLAUDE), compactInput(TRANSCRIPT), next);

    expect(result).toEqual({ messages: [] });
    expect(next.calls).toHaveLength(1);
    expect(h.engine.recorded.http).toEqual([]);
  });

  it("skips a precompute on a routed model, since the summary is made when compaction runs", async () => {
    const h = harness();
    const next = compactNext();

    const result = await compactSession(depsOf(h), compactInput(TRANSCRIPT, { trigger: "precompute" }), next);

    expect(result).toEqual({ skip: "nmg-router compacts routed sessions when compaction runs." });
    expect(next.calls).toEqual([]);
    expect(h.engine.recorded.http).toEqual([]);
  });
});

// AC2: a failed summary is a skip naming the provider, with no Claude request and no next call.
describe("a failed routed compaction", () => {
  const cases: [string, Parameters<typeof harness>[0], string][] = [
    ["a 500", { http: (request) => (request.url === CHAT_URL ? { status: 500, text: "{}" } : undefined) }, "server_error"],
    ["a network failure", { http: () => undefined }, "network"],
    ["an empty summary", { http: replies(chatTurn({ text: "" })) }, "malformed"],
  ];

  it.each(cases)("answers a skip naming OpenCode Go for %s, and never calls next", async (_label, options, kind) => {
    const h = harness(options);
    await signIn(h.engine);
    const next = compactNext();

    const result = await compactSession(depsOf(h), compactInput(TRANSCRIPT), next);

    expect(result).toEqual({ skip: `OpenCode Go could not summarize this conversation (${kind}); it was not compacted.` });
    expect(next.calls).toEqual([]);
    expect(h.engine.recorded.http.every((call) => !call.url.includes("anthropic"))).toBe(true);
  });

  it("answers the same skip, with no kind, when the hook itself threw", async () => {
    const h = harness();
    await signIn(h.engine);

    const result = await compactFailure(depsOf(h), compactInput(TRANSCRIPT));

    expect(result).toEqual({ skip: "OpenCode Go could not summarize this conversation; it was not compacted." });
  });

  it("leaves a Claude model's failed compaction to core", async () => {
    const h = harness();

    expect(await compactFailure(depsOf(h, CLAUDE), compactInput(TRANSCRIPT))).toBeUndefined();
  });
});

// AC3: a routed subagent's compaction uses the model its steps ran on, not the session's.
describe("a subagent's compaction", () => {
  it("summarizes on the agent's own routed model, and resets that agent's context", async () => {
    const h = harness({ http: replies(chatTurn({ text: "Agent summary." })) });
    await signIn(h.engine);
    h.tracker.recordStep("agent-1", MODEL);
    h.tracker.recordUsage("agent-1", usageOf(70000));
    const next = compactNext();

    const result = await compactSession(depsOf(h, CLAUDE), compactInput(TRANSCRIPT, { agentId: "agent-1" }), next);

    expect(result).toEqual({ messages: [expect.objectContaining({ text: expect.stringContaining("Agent summary.") })] });
    expect(postsTo(h.engine, CHAT_URL)).toHaveLength(1);
    expect(next.calls).toEqual([]);
    expect(h.tracker.contextTokens("agent-1")).toBe(0);
  });

  it("passes to core when the agent's model is not known", async () => {
    const h = harness();
    const next = compactNext();

    const result = await compactSession(depsOf(h), compactInput(TRANSCRIPT, { agentId: "agent-9" }), next);

    expect(result).toEqual({ messages: [] });
    expect(next.calls).toHaveLength(1);
    expect(h.engine.recorded.http).toEqual([]);
  });
});

// A main-loop compaction is summarized by the session's selected model, not the last step's.
describe("the main loop's model", () => {
  it("is the selected model, even when the last step ran on another", async () => {
    const h = harness({ http: replies(chatTurn({ text: "Selected." })) });
    await signIn(h.engine);
    h.tracker.recordStep(MAIN_LOOP, CLAUDE);
    const next = compactNext();

    const result = await compactSession(depsOf(h, MODEL), compactInput(TRANSCRIPT), next);

    expect(result).toEqual({ messages: [expect.objectContaining({ text: expect.stringContaining("Selected.") })] });
    expect(next.calls).toEqual([]);
  });
});

// AC8: a compaction after an in-place summary summarizes that summary and the newer messages, then drops it.
describe("compaction after an in-place summary", () => {
  const API_TRANSCRIPT = [userText("Old question"), { role: "assistant" as const, content: [{ type: "text", text: "Old answer." }] }, userText("New question")];

  it("summarizes the view's summary as prior plus the messages after its cut, and drops the view", async () => {
    const h = harness({ http: replies(chatTurn({ text: "Whole summary." })) }, API_TRANSCRIPT);
    await signIn(h.engine);
    h.view.set(MAIN_LOOP, { summary: "Earlier work.", model: MODEL, cut: 2 });
    const next = compactNext();

    const result = await compactSession(depsOf(h), compactInput(TRANSCRIPT, { instructions: "keep the plan" }), next);

    expect(result).toEqual({ messages: [expect.objectContaining({ text: expect.stringContaining("Whole summary.") })] });
    const body = postsTo(h.engine, CHAT_URL)[0]?.body ?? "";
    expect(body).toContain("[Earlier summary]: Earlier work.");
    expect(body).toContain("[User]: New question");
    expect(body).toContain("Additional focus: keep the plan");
    expect(body).not.toContain("Old question");
    expect(body).not.toContain("Plan the notes change");
    expect(h.view.get(MAIN_LOOP)).toBeUndefined();
    expect(next.calls).toEqual([]);
    expect(h.engine.recorded.coreSummaries).toBe(0);
  });

  it("keeps the view and answers a skip naming the provider when the summary fails", async () => {
    const h = harness({ http: (request) => (request.url === CHAT_URL ? { status: 500, text: "{}" } : undefined) }, API_TRANSCRIPT);
    await signIn(h.engine);
    h.view.set(MAIN_LOOP, { summary: "Earlier work.", model: MODEL, cut: 2 });
    const next = compactNext();

    const result = await compactSession(depsOf(h), compactInput(TRANSCRIPT), next);

    expect(result).toEqual({ skip: "OpenCode Go could not summarize this conversation (server_error); it was not compacted." });
    expect(h.view.get(MAIN_LOOP)).toEqual({ summary: "Earlier work.", model: MODEL, cut: 2 });
    expect(next.calls).toEqual([]);
  });

  it("summarizes the engine's messages and drops a view the transcript no longer reaches", async () => {
    const h = harness({ http: replies(chatTurn({ text: "Fresh." })) }, [userText("Only one")]);
    await signIn(h.engine);
    h.view.set(MAIN_LOOP, { summary: "Stale.", model: MODEL, cut: 4 });

    await compactSession(depsOf(h), compactInput(TRANSCRIPT), compactNext());

    const body = postsTo(h.engine, CHAT_URL)[0]?.body ?? "";
    expect(body).toContain("[User]: Plan the notes change");
    expect(body).not.toContain("Stale.");
    expect(h.view.get(MAIN_LOOP)).toBeUndefined();
  });
});

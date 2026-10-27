import { describe, expect, it } from "vitest";
import { createRoutedView } from "../../src/compaction/routed-view.ts";
import { MAIN_LOOP } from "../../src/routing/session-tracker.ts";
import { routeStep } from "../../src/routing/turn-step.ts";
import type { ApiMessageInput } from "../../src/translate/messages.ts";
import { CHAT_URL, MODEL, SESSION, chatTurn, collect, harness, postsTo, remember, replies, signIn, spyNext, step, textOf, userText } from "../support/routing.ts";

const CLAUDE = "claude-sonnet-5-5";

function assistantText(text: string): ApiMessageInput {
  return { role: "assistant", content: [{ type: "text", text }] };
}

type ChatBody = { messages: { role: string; content: unknown }[] };

function bodyOf(h: ReturnType<typeof harness>, index = 0): ChatBody {
  return JSON.parse(postsTo(h.engine, CHAT_URL)[index]?.body ?? "{}") as ChatBody;
}

// AC2: the view replaces the summarized messages for the provider alone.
describe("the routed view", () => {
  it("merges the summary into a leading user message, summary first", () => {
    const view = createRoutedView();
    view.set(MAIN_LOOP, { summary: "S.", model: MODEL, cut: 2 });

    const applied = view.apply(MAIN_LOOP, [userText("a"), assistantText("b"), userText("c"), assistantText("d")]);

    expect(applied.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(applied[0]?.content).toEqual([{ type: "text", text: expect.stringContaining("<summary>\nS.\n</summary>") }, { type: "text", text: "c" }]);
  });

  it("puts the summary on its own before a leading assistant message", () => {
    const view = createRoutedView();
    view.set(MAIN_LOOP, { summary: "S.", model: MODEL, cut: 1 });

    const applied = view.apply(MAIN_LOOP, [userText("a"), assistantText("b")]);

    expect(applied.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(applied[1]).toEqual(assistantText("b"));
  });

  it("drops itself when the transcript is shorter than its cut, and sends the messages as they are", () => {
    const view = createRoutedView();
    view.set(MAIN_LOOP, { summary: "S.", model: MODEL, cut: 5 });
    const rewritten = [userText("after a rewind")];

    expect(view.apply(MAIN_LOOP, rewritten)).toBe(rewritten);
    expect(view.get(MAIN_LOOP)).toBeUndefined();
  });
});

describe("routed steps with a view", () => {
  it("sends the summary and only the newer messages on a routed main-loop step", async () => {
    const transcript = [userText("Old question"), assistantText("Old answer."), userText("New question")];
    const h = harness({ http: replies(chatTurn({ text: "ok" })) }, transcript);
    await signIn(h.engine);
    remember(h.capture);
    h.view.set(MAIN_LOOP, { summary: "Earlier work.", model: MODEL, cut: 2 });

    await collect(routeStep(h.router, step(0), spyNext()));

    const sent = JSON.stringify(bodyOf(h).messages);
    expect(sent).toContain("Earlier work.");
    expect(sent).toContain("New question");
    expect(sent).not.toContain("Old question");
  });

  // AC6, FR4: a routed main-loop step never waits for a running summary, which counts against the hook budget.
  it("answers at once while a summary is still running, with the view as it is", async () => {
    const transcript = [userText("Old question"), assistantText("Old answer.")];
    const h = harness({ http: replies(chatTurn({ text: "ok" })) }, transcript);
    await signIn(h.engine);
    remember(h.capture);
    h.view.hold(MAIN_LOOP, new Promise<void>(() => undefined));
    transcript.push(userText("New question"));

    const answered = await collect(routeStep(h.router, step(0), spyNext()));

    expect(textOf(answered.chunks)).toBe("ok");
    const sent = JSON.stringify(bodyOf(h).messages);
    expect(sent).toContain("New question");
    expect(sent).not.toContain("<summary>");
    expect(h.view.get(MAIN_LOOP)).toBeUndefined();
  });

  it("sends a summary that finishes during a step from the next routed main-loop step", async () => {
    const transcript = [userText("Old question"), assistantText("Old answer.")];
    const h = harness({ http: replies(chatTurn({ text: "First." }), chatTurn({ text: "Second." })) }, transcript);
    await signIn(h.engine);
    remember(h.capture);
    let finish: () => void = () => undefined;
    h.view.hold(
      MAIN_LOOP,
      new Promise<void>((resolve) => {
        finish = () => {
          h.view.set(MAIN_LOOP, { summary: "Fresh summary.", model: MODEL, cut: 2 });
          resolve();
        };
      }),
    );
    transcript.push(userText("New question"));

    await collect(routeStep(h.router, step(0), spyNext()));
    expect(JSON.stringify(bodyOf(h, 0).messages)).not.toContain("Fresh summary.");
    finish();
    await collect(routeStep(h.router, step(1), spyNext()));

    expect(JSON.stringify(bodyOf(h, 1).messages)).toContain("Fresh summary.");
  });

  it("never shows the view to a Claude step or a subagent step", async () => {
    const h = harness({
      http: replies(chatTurn({ text: "Sub." })),
      session: { id: SESSION, messages: [userText("Main old"), userText("Main new")], agents: { "agent-1": [userText("Sub task")] } },
    });
    await signIn(h.engine);
    remember(h.capture);
    h.view.set(MAIN_LOOP, { summary: "Main summary.", model: MODEL, cut: 1 });
    const claude = spyNext();

    await collect(routeStep(h.router, step(0, CLAUDE), claude));
    await collect(routeStep(h.router, step(0, MODEL, { agentId: "agent-1" }), spyNext()));

    expect(claude.calls).toHaveLength(1);
    const sent = JSON.stringify(bodyOf(h).messages);
    expect(sent).toContain("Sub task");
    expect(sent).not.toContain("Main summary.");
    expect(h.view.get(MAIN_LOOP)).toEqual({ summary: "Main summary.", model: MODEL, cut: 1 });
  });
});

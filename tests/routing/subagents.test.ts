import { describe, expect, it } from "vitest";
import { routeStep } from "../../src/routing/turn-step.ts";
import type { TurnStepResult } from "claude-code";
import type { ApiMessageInput } from "../../src/translate/messages.ts";
import { CHAT_URL, MODEL, SESSION, chatTurn, collect, harness, postsTo, remember, replies, signIn, spyNext, step, textOf, userText } from "../support/routing.ts";
import { HANDBACK_REMINDER, deliverHandback } from "../support/fake-turn.ts";

const CLAUDE = "claude-sonnet-5-5";

// AC3: each loop's steps are answered by the model they name. A routed subagent reads its own transcript
// and prompt, a Claude subagent passes through, and no subagent step moves the main status line.
describe("subagent steps by their own model", () => {
  // As on 2.1.311, `prompt.compose` fires for main-loop renders only and carries no agent id, so the capture a
  // routed subagent reads is the latest main-loop render for its model.
  it("answers a routed subagent from its own transcript and captured prompt, and never calls next", async () => {
    const h = harness({
      http: replies(chatTurn({ text: "Sub done." })),
      session: { id: SESSION, messages: [userText("Main task")], agents: { "agent-1": [userText("Sub task")] } },
    });
    await signIn(h.engine);
    remember(h.capture, MODEL, "CAPTURED PROMPT");
    const next = spyNext();

    const { chunks } = await collect(routeStep(h.router, step(0, MODEL, { agentId: "agent-1" }), next));

    expect(textOf(chunks)).toBe("Sub done.");
    expect(next.calls).toEqual([]);
    const body = JSON.parse(postsTo(h.engine, CHAT_URL)[0]?.body ?? "{}") as { messages: unknown[] };
    expect(body.messages[0]).toEqual({ role: "system", content: "CAPTURED PROMPT" });
    expect(JSON.stringify(body.messages)).toContain("Sub task");
    expect(JSON.stringify(body.messages)).not.toContain("Main task");
    expect(h.tracker.model("agent-1")).toBe(MODEL);
  });

  it("passes a Claude subagent through to next, untouched, under a routed main loop", async () => {
    const h = harness({ http: replies(chatTurn({ text: "Main." })) });
    await signIn(h.engine);
    remember(h.capture);
    await collect(routeStep(h.router, step(0), spyNext()));
    const next = spyNext();

    const { chunks } = await collect(routeStep(h.router, step(0, CLAUDE, { agentId: "agent-2" }), next));

    expect(next.calls).toEqual([expect.objectContaining({ agentId: "agent-2", model: CLAUDE })]);
    expect(textOf(chunks)).toBe("from claude");
    expect(postsTo(h.engine, CHAT_URL)).toHaveLength(1);
    expect(h.tracker.model("agent-2")).toBe(CLAUDE);
  });

  it("leaves the main status line as the main loop set it", async () => {
    const h = harness({ http: replies(chatTurn({ text: "Main." }), chatTurn({ text: "Sub." })) });
    await signIn(h.engine);
    remember(h.capture);
    await collect(routeStep(h.router, step(0), spyNext()));
    const afterMain = h.engine.recorded.status.length;
    expect(afterMain).toBe(1);

    await collect(routeStep(h.router, step(0, MODEL, { agentId: "agent-1" }), spyNext()));

    expect(h.engine.recorded.status).toHaveLength(afterMain);
  });
});

// The session's tool listing as 2.1.311 answers `$.tool.list()` during a subagent step: the main loop's
// tools, with no SubagentHandback.
const HOST_TOOLS = [
  { name: "Read", description: "Read a file", mcp: false },
  { name: "WebFetch", description: "Fetch a page", mcp: false },
];

// An auto-mode subagent transcript, with the host's handback reminder, that loaded WebFetch through ToolSearch.
const SUB_TRANSCRIPT: ApiMessageInput[] = [
  userText("Sub task"),
  userText(HANDBACK_REMINDER),
  { role: "assistant", content: [{ type: "tool_use", id: "search_1", name: "ToolSearch", input: { query: "select:WebFetch" } }] },
  { role: "user", content: [{ type: "tool_result", tool_use_id: "search_1", content: [{ type: "tool_reference", tool_name: "WebFetch" }] }] },
];

type OfferedBody = { tools?: { function: { name: string; description?: string } }[] };

function offeredNames(body: string | undefined): string[] {
  return ((JSON.parse(body ?? "{}") as OfferedBody).tools ?? []).map((tool) => tool.function.name);
}

// AC3, FR8: a routed subagent can hand its report back, and keeps the tools it loaded.
describe("routed subagent tools", () => {
  it("offers SubagentHandback and a ToolSearch-loaded tool to a routed subagent, and its report reaches the caller", async () => {
    const report = { id: "call_handback_1", name: "SubagentHandback", input: { message: "The notes are fixed." } };
    const main: ApiMessageInput[] = [userText("Main task")];
    const h = harness({
      http: replies(chatTurn({ tool: report })),
      tools: HOST_TOOLS,
      session: { id: SESSION, messages: main, agents: { "agent-1": SUB_TRANSCRIPT } },
    });
    await signIn(h.engine);
    remember(h.capture, MODEL, "CAPTURED PROMPT", ["Read"]);

    const { result } = await collect(routeStep(h.router, step(0, MODEL, { agentId: "agent-1" }), spyNext()));

    const body = postsTo(h.engine, CHAT_URL)[0]?.body;
    expect(offeredNames(body)).toEqual(["Read", "WebFetch", "SubagentHandback"]);
    const handback = (JSON.parse(body ?? "{}") as OfferedBody).tools?.find((tool) => tool.function.name === "SubagentHandback");
    expect(handback?.function.description).toContain("Deliver your final report to the agent that spawned you");
    const toolUses = (result as TurnStepResult).toolUses;
    expect(deliverHandback(toolUses, main as never, { autoMode: true })).toBe(true);
    expect(JSON.stringify(main)).toContain("The notes are fixed.");
  });

  it("does not offer SubagentHandback where the host gave the subagent none, so its plain report is delivered", async () => {
    const h = harness({
      http: replies(chatTurn({ text: "Sub done." })),
      tools: HOST_TOOLS,
      session: { id: SESSION, messages: [userText("Main task")], agents: { "agent-1": [userText("Sub task")] } },
    });
    await signIn(h.engine);
    remember(h.capture, MODEL, "CAPTURED PROMPT", ["Read"]);

    const { chunks, result } = await collect(routeStep(h.router, step(0, MODEL, { agentId: "agent-1" }), spyNext()));

    expect(offeredNames(postsTo(h.engine, CHAT_URL)[0]?.body)).toEqual(["Read"]);
    expect((result as TurnStepResult).toolUses).toEqual([]);
    expect(textOf(chunks)).toBe("Sub done.");
  });

  it("offers SubagentHandback to a routed subagent under a Claude main loop, with no capture for its model", async () => {
    const h = harness({
      http: replies(chatTurn({ text: "Sub." })),
      tools: HOST_TOOLS,
      session: { id: SESSION, messages: [userText("Main task")], agents: { "agent-1": [userText("Sub task"), userText(HANDBACK_REMINDER)] } },
    });
    await signIn(h.engine);

    await collect(routeStep(h.router, step(0, MODEL, { agentId: "agent-1" }), spyNext()));

    expect(offeredNames(postsTo(h.engine, CHAT_URL)[0]?.body)).toEqual(["Read", "WebFetch", "SubagentHandback"]);
  });

  it("does not offer SubagentHandback to the routed main loop", async () => {
    const h = harness({ http: replies(chatTurn({ text: "Main." })), tools: HOST_TOOLS });
    await signIn(h.engine);
    remember(h.capture, MODEL, "MAIN PROMPT", ["Read", "SubagentHandback"]);

    await collect(routeStep(h.router, step(0), spyNext()));

    expect(offeredNames(postsTo(h.engine, CHAT_URL)[0]?.body)).toEqual(["Read"]);
  });
});

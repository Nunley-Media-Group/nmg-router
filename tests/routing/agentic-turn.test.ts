import { describe, expect, it } from "vitest";
import { routeStep } from "../../src/routing/turn-step.ts";
import { CHAT_URL, MODEL, chatTurn, collect, harness, postsTo, remember, replies, signIn, spyNext, step, textOf } from "../support/routing.ts";

// AC2: a routed model completes Read, Edit and a final answer, each request carrying
// the captured system prompt, the conversation so far and only the offered tools.
describe("a routed model completes an agentic turn", () => {
  it("sends the prompt, the tool results so far and the offered tools on each step, and never calls next", async () => {
    const h = harness({
      http: replies(
        chatTurn({ tool: { id: "call_1", name: "Read", input: { file_path: "notes.txt" } } }),
        chatTurn({ tool: { id: "call_2", name: "Edit", input: { file_path: "notes.txt", old_string: "old", new_string: "new" } } }),
        chatTurn({ text: "Done." }),
      ),
    });
    await signIn(h.engine);
    remember(h.capture);
    const next = spyNext();

    const first = await collect(routeStep(h.router, step(0), next));
    expect(first.chunks).toContainEqual({ kind: "tool", index: 0, id: "call_1", name: "Read" });
    h.messages.push(
      { role: "assistant", content: [{ type: "tool_use", id: "call_1", name: "Read", input: { file_path: "notes.txt" } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "call_1", content: [{ type: "text", text: "old" }] }] },
    );

    await collect(routeStep(h.router, step(1), next));
    h.messages.push(
      { role: "assistant", content: [{ type: "tool_use", id: "call_2", name: "Edit", input: { file_path: "notes.txt" } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "call_2", content: [{ type: "text", text: "edited" }] }] },
    );

    const last = await collect(routeStep(h.router, step(2), next));
    expect(textOf(last.chunks)).toBe("Done.");
    expect(last.chunks.at(-1)).toEqual({ kind: "stop", stopReason: "end_turn", usage: expect.objectContaining({ model: MODEL }) });

    const requests = postsTo(h.engine, CHAT_URL);
    expect(requests).toHaveLength(3);
    const bodies = requests.map((request) => JSON.parse(request.body ?? "{}") as { messages: unknown[]; tools: { function: { name: string } }[] });
    for (const body of bodies) {
      expect(body.messages[0]).toEqual({ role: "system", content: "SYSTEM PROMPT" });
      expect(body.tools.map((tool) => tool.function.name)).toEqual(["Read", "Edit"]);
    }
    expect(bodies[1]?.messages).toContainEqual({
      role: "assistant",
      content: null,
      tool_calls: [{ id: "call_1", type: "function", function: { name: "Read", arguments: '{"file_path":"notes.txt"}' } }],
    });
    expect(bodies[1]?.messages).toContainEqual({ role: "tool", tool_call_id: "call_1", content: "old" });
    expect(next.calls).toEqual([]);
  });
});

// AC6: an offered MCP tool with no schema the mods API exposes is left out, and named in the debug log.
describe("an MCP tool without a schema", () => {
  it("is left out of the request and named in a debug line", async () => {
    const h = harness({ http: replies(chatTurn({ text: "ok" })), tools: [{ name: "mcp__docs__search", description: "Search", mcp: true }] });
    await signIn(h.engine);
    remember(h.capture, MODEL, "SYSTEM PROMPT", ["Read", "mcp__docs__search"]);
    await collect(routeStep(h.router, step(0), spyNext()));

    const [request] = postsTo(h.engine, CHAT_URL);
    const body = JSON.parse(request?.body ?? "{}") as { tools?: unknown[] };
    expect(body.tools).toHaveLength(1);
    expect(h.engine.recorded.debug).toContain("routed request left out tools without a schema: mcp__docs__search");
  });
});

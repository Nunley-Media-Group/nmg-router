import { describe, expect, it } from "vitest";
import { buildSummaryRequest, TOOL_RESULT_LIMIT, serializeMessages } from "../../src/compaction/summary-request.ts";
import { SUMMARY_STRUCTURE, SUMMARY_SYSTEM_PROMPT } from "../../src/compaction/summary-prompt.ts";
import type { SessionMessage } from "claude-code";
import { assistant, user } from "../support/fake-turn.ts";

const MODEL = { id: "opencode-go/glm-5.1", maxOutput: 32768 };

// AC1: the summary request serializes the transcript, cuts tool results, drops thinking and images,
// adds the focus, and sets no tools, no reasoning and the design's output budget.
describe("the summary request", () => {
  it("serializes each message in order with its role, its tool calls and its tool results", () => {
    const messages: SessionMessage[] = [
      user("Fix the notes"),
      assistant("Reading the file.", { toolUses: [{ tool_use_id: "call_1", tool: "Read", input: { file_path: "notes.txt" } }] }),
      user("", { toolResults: [{ tool_use_id: "call_1", text: "old text", isError: false, result: "old text" }] }),
    ];

    expect(serializeMessages(messages)).toBe(
      ['[User]: Fix the notes', '[Assistant]: Reading the file.', '[Tool Call]: Read({"file_path":"notes.txt"})', "[Tool Result]: old text"].join("\n"),
    );
  });

  it("cuts a tool result at 2000 characters and says how many it dropped", () => {
    const long = "x".repeat(TOOL_RESULT_LIMIT + 37);
    const text = serializeMessages([user("", { toolResults: [{ tool_use_id: "call_1", text: long, isError: false, result: long }] })]);

    expect(text).toBe(`[Tool Result]: ${"x".repeat(TOOL_RESULT_LIMIT)}\n[... 37 more characters truncated]`);
  });

  it("wraps the transcript in conversation tags, then the section structure", () => {
    const request = buildSummaryRequest([user("Hello")], undefined, MODEL);
    const [turn] = request.turns;

    expect(turn?.role).toBe("user");
    expect(turn?.blocks).toEqual([
      { kind: "text", text: `<conversation>\n[User]: Hello\n</conversation>\n\n${SUMMARY_STRUCTURE}` },
    ]);
    expect(SUMMARY_STRUCTURE).toContain("## Goal");
    expect(SUMMARY_STRUCTURE).toContain("### In Progress");
    expect(SUMMARY_STRUCTURE).toContain("## Critical Context");
  });

  it("appends the focus the person typed after /compact, and leaves it out when there is none", () => {
    const withFocus = buildSummaryRequest([user("Hello")], "keep the plan", MODEL);
    const withoutFocus = buildSummaryRequest([user("Hello")], "   ", MODEL);

    expect(withFocus.turns[0]?.blocks[0]).toEqual(expect.objectContaining({ text: expect.stringMatching(/\n\nAdditional focus: keep the plan$/) }));
    expect(withoutFocus.turns[0]?.blocks[0]).toEqual(expect.objectContaining({ text: expect.not.stringContaining("Additional focus") }));
  });

  it("sends the summarizer's system prompt with no tools, no reasoning, and the provider's model name", () => {
    const request = buildSummaryRequest([assistant("Done.")], undefined, MODEL);

    expect(request.system).toBe(SUMMARY_SYSTEM_PROMPT);
    expect(request.tools).toEqual([]);
    expect(request.reasoning).toBeUndefined();
    expect(request.model).toBe("glm-5.1");
  });

  it("caps the output at 13107 tokens, and uses that cap when the model names no limit", () => {
    expect(buildSummaryRequest([], undefined, MODEL).maxOutput).toBe(13107);
    expect(buildSummaryRequest([], undefined, { id: "opencode-go/small", maxOutput: 4096 }).maxOutput).toBe(4096);
    expect(buildSummaryRequest([], undefined, { id: "opencode-go/unknown" }).maxOutput).toBe(13107);
  });
});

// AC1, AC2: the API form serializes by the same rules, and an earlier summary is written first.
describe("the summary request from the Messages API form", () => {
  it("serializes API messages the same way as session rows, leaving out thinking and images", () => {
    const long = "x".repeat(TOOL_RESULT_LIMIT + 5);
    const api = [
      { role: "user" as const, content: [{ type: "text", text: "Fix the notes" }, { type: "image", source: { type: "base64", media_type: "image/png", data: "AA" } }] },
      {
        role: "assistant" as const,
        content: [
          { type: "thinking", thinking: "hidden" },
          { type: "text", text: "Reading the file." },
          { type: "tool_use", id: "call_1", name: "Read", input: { file_path: "notes.txt" } },
        ],
      },
      { role: "user" as const, content: [{ type: "tool_result", tool_use_id: "call_1", content: [{ type: "text", text: long }] }] },
    ];

    expect(serializeMessages(api)).toBe(
      [
        "[User]: Fix the notes",
        "[Assistant]: Reading the file.",
        '[Tool Call]: Read({"file_path":"notes.txt"})',
        `[Tool Result]: ${"x".repeat(TOOL_RESULT_LIMIT)}\n[... 5 more characters truncated]`,
      ].join("\n"),
    );
  });

  it("writes an earlier summary first, as prior", () => {
    const request = buildSummaryRequest([user("Next task")], undefined, MODEL, "The earlier summary.");
    const block = request.turns[0]?.blocks[0];

    expect(block?.kind === "text" ? block.text : "").toMatch(/^<conversation>\n\[Earlier summary\]: The earlier summary\.\n\[User\]: Next task\n<\/conversation>/);
  });
});

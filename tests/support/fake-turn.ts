import type { SessionCompactInput, SessionMessage } from "claude-code";
import type { CompactNext } from "../../src/compaction/compact-hook.ts";
import type { ToolCall, ToolCheckNext, ToolVerdict } from "../../src/permissions/tool-check.ts";
import type { ContextUsage } from "../../src/routing/session-tracker.ts";

// Builders for the hook inputs the compaction and permission tests pass in, and spies
// for the `next` each hook is given. The routed-turn harness lives in routing.ts.

export function user(text: string, extra: Partial<SessionMessage> = {}): SessionMessage {
  return { role: "user", text, toolUses: [], ...extra };
}

export function assistant(text: string, extra: Partial<SessionMessage> = {}): SessionMessage {
  return { role: "assistant", text, toolUses: [], ...extra };
}

export function compactInput(messages: readonly SessionMessage[], extra: Partial<SessionCompactInput> = {}): SessionCompactInput {
  return { trigger: "manual", messages, ...extra };
}

// A stop's four counts, with every token in the output count, so the context is the total given.
export function usageOf(tokens: number): ContextUsage {
  return { input_tokens: 0, output_tokens: tokens, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
}

// A call where a person can be asked, as the engine sets `approver` in an interactive session.
export function toolCall(extra: Partial<ToolCall> = {}): ToolCall {
  return { tool: "Bash", input: { command: "git status" }, tool_use_id: "call_routed_1", approver: "person", ...extra };
}

export type ToolSpy = ToolCheckNext & { readonly calls: ToolCall[] };

// The `next` a tool.check hook gets: it records each call and answers the verdict given.
export function toolNext(verdict: ToolVerdict, signal: AbortSignal = new AbortController().signal): ToolSpy {
  const calls: ToolCall[] = [];
  const next = async (call: ToolCall): Promise<ToolVerdict> => {
    calls.push(call);
    return verdict;
  };
  return Object.assign(next, { calls, signal });
}

// What auto mode does with a hook's final verdict on a routed call, as 2.1.310
// does it: a hook's ask still goes to the server classifier, which gives a routed
// model no verdict, and its fail-closed block refuses the call.
export function autoModeOutcome(verdict: ToolVerdict): "runs" | "refused" | "refused by the classifier" {
  if (verdict.decision === "allow") return "runs";
  return verdict.decision === "deny" ? "refused" : "refused by the classifier";
}

export type CompactSpy = CompactNext & { readonly calls: SessionCompactInput[] };

// The `next` a session.compact hook gets: it records each call and answers Claude's compaction.
export function compactNext(signal: AbortSignal = new AbortController().signal): CompactSpy {
  const calls: SessionCompactInput[] = [];
  const next = async (e: SessionCompactInput) => {
    calls.push(e);
    return { messages: [] };
  };
  return Object.assign(next, { signal, calls });
}

// The host's SubagentHandback, as 2.1.310 runs it: a subagent's call with a
// non-empty `message` delivers that report into its caller's transcript. Answers
// whether a report was delivered.
export function deliverHandback(
  toolUses: readonly { readonly name: string; readonly input: unknown }[],
  caller: { role: "user" | "assistant"; content: { type: string; [field: string]: unknown }[] }[],
): boolean {
  const call = toolUses.find((use) => use.name === "SubagentHandback");
  const message = (call?.input as { message?: unknown } | undefined)?.message;
  if (typeof message !== "string" || message.trim() === "") return false;
  caller.push({ role: "user", content: [{ type: "text", text: message }] });
  return true;
}

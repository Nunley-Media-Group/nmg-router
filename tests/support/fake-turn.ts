import type { SessionCompactInput, SessionMessage } from "claude-code";
import type { CompactNext } from "../../src/compaction/compact-hook.ts";
import type { ToolCall, ToolVerdict } from "../../src/permissions/tool-check.ts";
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

export function toolCall(extra: Partial<ToolCall> = {}): ToolCall {
  return { tool: "Bash", input: { command: "git status" }, tool_use_id: "call_routed_1", ...extra };
}

export type ToolSpy = ((call: ToolCall) => Promise<ToolVerdict>) & { readonly calls: ToolCall[] };

// The `next` a tool.check hook gets: it records each call and answers the verdict given.
export function toolNext(verdict: ToolVerdict): ToolSpy {
  const calls: ToolCall[] = [];
  const next = async (call: ToolCall): Promise<ToolVerdict> => {
    calls.push(call);
    return verdict;
  };
  return Object.assign(next, { calls });
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

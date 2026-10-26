import type { SessionCompactInput, SessionCompactResult, SessionMessage } from "claude-code";
import { RoutedError } from "../errors/routed-errors.ts";
import type { Router } from "../routing/router.ts";
import { MAIN_LOOP, type SessionTracker } from "../routing/session-tracker.ts";
import type { ApiMessageInput } from "../translate/messages.ts";
import { summaryText, type RoutedView } from "./routed-view.ts";
import { buildSummaryRequest } from "./summary-request.ts";

// The `session.compact` hook for a routed model. The routed model summarizes the
// transcript, and the summary replaces it. A Claude model's compaction passes to
// core unchanged. A routed failure is a skip, and never a Claude summary. When the
// loop has an in-place summary, that summary and the messages after it are what
// gets summarized, so the request fits the routed window.

export type CompactDeps = {
  readonly router: Router;
  readonly tracker: SessionTracker;
  // The session's selected model, which summarizes the main loop.
  readonly selectedModel: () => Promise<string>;
  readonly view: RoutedView;
  // The main loop's transcript in Messages API form, which the view's cut counts.
  readonly messages: () => Promise<readonly ApiMessageInput[] | { readonly deny: string }>;
};

export type CompactNext = {
  (e: SessionCompactInput): Promise<SessionCompactResult>;
  readonly signal: AbortSignal;
};

// The model whose transcript this compaction summarizes: a subagent's own, as its
// steps recorded it, else the session's selected model.
async function modelOf(deps: CompactDeps, agentId: string | undefined): Promise<string | undefined> {
  return agentId === undefined ? deps.selectedModel() : deps.tracker.model(agentId);
}

function notCompacted(provider: string, kind: string): SessionCompactResult {
  return { skip: `${provider} could not summarize this conversation (${kind}); it was not compacted.` };
}

// The summary as the conversation reads from now on: one message, with no handle.
function summaryMessage(model: string, summary: string): SessionMessage {
  return {
    role: "user",
    text: summaryText(model, summary),
    toolUses: [],
  };
}

// The view's summary and the messages after its cut, or undefined when the loop
// has no view or the transcript no longer reaches its cut.
async function sinceView(
  deps: CompactDeps,
  loop: string,
): Promise<{ readonly summary: string; readonly messages: readonly ApiMessageInput[] } | undefined> {
  const entry = deps.view.get(loop);
  if (entry === undefined) return undefined;
  const messages = await deps.messages();
  if (!Array.isArray(messages) || messages.length < entry.cut) {
    deps.view.drop(loop);
    return undefined;
  }
  return { summary: entry.summary, messages: messages.slice(entry.cut) };
}

export async function compactSession(deps: CompactDeps, e: SessionCompactInput, next: CompactNext): Promise<SessionCompactResult> {
  const model = await modelOf(deps, e.agentId);
  if (model === undefined || !(await deps.router.isRouted(model))) return next(e);
  if (e.trigger === "precompute") return { skip: "nmg-router compacts routed sessions when compaction runs." };

  const info = await deps.router.describe(model);
  const loop = e.agentId ?? MAIN_LOOP;
  try {
    const target = { id: model, maxOutput: info.maxOutput };
    const viewed = await sinceView(deps, loop);
    const request =
      viewed === undefined
        ? buildSummaryRequest(e.messages, e.instructions, target)
        : buildSummaryRequest(viewed.messages, e.instructions, target, viewed.summary);
    const text = await deps.router.complete(model, request, next.signal);
    if (next.signal.aborted) return notCompacted(info.provider, "interrupted");
    const summary = text.trim();
    if (summary === "") return notCompacted(info.provider, "malformed");
    deps.tracker.resetContext(loop);
    // The summary now stands in the transcript itself, so the view has nothing left to add.
    deps.view.drop(loop);
    return { messages: [summaryMessage(model, summary)] };
  } catch (error) {
    return notCompacted(info.provider, error instanceof RoutedError ? error.kind : "internal");
  }
}

// The `.catch` path: the hook threw. A routed model's compaction is skipped, naming
// its provider; a Claude model's is left to core, as the engine would run it.
export async function compactFailure(deps: CompactDeps, e: SessionCompactInput): Promise<SessionCompactResult | undefined> {
  try {
    const model = await modelOf(deps, e.agentId);
    if (model === undefined || !(await deps.router.isRouted(model))) return undefined;
    const info = await deps.router.describe(model);
    return { skip: `${info.provider} could not summarize this conversation; it was not compacted.` };
  } catch {
    return undefined;
  }
}

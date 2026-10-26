import { MAIN_LOOP, type SessionTracker } from "../routing/session-tracker.ts";
import { SUBAGENT_HANDBACK } from "../tools/supplement-schemas.ts";
import type { Approver, AskPerson } from "./person-approval.ts";
import type { PermissionModeTracker } from "./permission-mode.ts";
import { policyFor, type Decision, type PolicyHost } from "./policy.ts";
import type { PermissionMode } from "./mode.ts";

// The `tool.check` hook for routed calls in auto mode. It acts only where Claude
// Code's own check left an unsettled ask, and answers it allow or deny. A rule, a
// hook, a setting, a Claude call or any other mode returns Claude Code's verdict
// unchanged.

// The call as `tool.check` names it. The engine's input has more fields, which go unread here.
export type ToolCall = {
  readonly tool: string;
  readonly input: unknown;
  readonly tool_use_id?: string | undefined;
  readonly agentId?: string | undefined;
  readonly approver?: Approver | undefined;
};

// Claude Code's verdict for the call, or the one this hook returns.
export type ToolVerdict = {
  readonly decision: Decision;
  readonly reason?: string | undefined;
  readonly rule?: string | undefined;
  readonly hook?: string | undefined;
  readonly setting?: string | undefined;
};

export type ToolCheckDeps = {
  readonly tracker: SessionTracker;
  readonly mode: PermissionModeTracker;
  readonly readMode: () => Promise<PermissionMode>;
  readonly host: PolicyHost;
  readonly askPerson: AskPerson;
};

export type ToolCheckNext = ((call: ToolCall) => Promise<ToolVerdict>) & { readonly signal?: AbortSignal | undefined };

// A routed call is one whose tool id the routed steps emitted, in auto mode.
// SubagentHandback is the host's own: on 2.1.311 only the auto-mode classifier can
// allow it, and the host refuses a hook's allow, so its verdict is left to core.
function isRoutedAuto(deps: Pick<ToolCheckDeps, "tracker" | "mode">, call: ToolCall): boolean {
  if (call.tool === SUBAGENT_HANDBACK) return false;
  return call.tool_use_id !== undefined && deps.tracker.isRoutedTool(call.tool_use_id) && deps.mode.isAuto();
}

export async function checkRoutedTool(deps: ToolCheckDeps, call: ToolCall, next: ToolCheckNext): Promise<ToolVerdict> {
  if (!isRoutedAuto(deps, call)) return next(call);
  const verdict = await next(call);
  // A rule, hook or setting already decided the call, and only an ask is open to the policy.
  if (verdict.decision !== "ask" || verdict.rule !== undefined || verdict.hook !== undefined || verdict.setting !== undefined) {
    return verdict;
  }
  const policy = policyFor(await deps.readMode());
  return policy.decide(
    deps.host,
    {
      tool: call.tool,
      input: call.input,
      model: deps.tracker.model(call.agentId ?? MAIN_LOOP),
      approver: call.approver,
      signal: next.signal,
    },
    deps.askPerson,
  );
}

// The `.catch` path: a routed call in auto mode is refused when its check failed.
export function checkFailed(deps: Pick<ToolCheckDeps, "tracker" | "mode">, call: ToolCall): ToolVerdict | undefined {
  return isRoutedAuto(deps, call) ? { decision: "deny", reason: "nmg-router: permission check failed" } : undefined;
}

import type { PermissionMode } from "./mode.ts";
import type { ApprovalCall, ApprovalHost, AskPerson } from "./person-approval.ts";

// Who decides a routed tool call that no rule settles. Each policy answers allow or
// deny with a reason, never ask: in auto mode a hook's ask still meets the server
// classifier, whose block refuses routed calls. A call the policy cannot decide is
// put to the person. A policy's text never enters the routed conversation.

export type Decision = "allow" | "ask" | "deny";

export type Verdict = { readonly decision: Decision; readonly reason: string };

export type PolicyHost = ApprovalHost & {
  readonly session: { cwd(): Promise<string> };
  readonly model: { classify(text: string, labels: readonly string[]): Promise<string | undefined> };
};

export type PermissionPolicy = {
  decide(host: PolicyHost, call: ApprovalCall, askPerson: AskPerson): Promise<Verdict>;
};

const LABELS: readonly Decision[] = ["allow", "ask", "deny"];

// A Claude model labels the call. Its allow or deny is the verdict; an ask, a
// failed classification or no label puts the call to the person.
export const claudeClassifierPolicy: PermissionPolicy = {
  async decide(host, call, askPerson) {
    const cwd = await host.session.cwd();
    const text = [
      "Decide whether this tool call from a routed model may run without asking the person.",
      "Answer with one label: allow, ask or deny.",
      `Working directory: ${cwd}`,
      `Tool: ${call.tool}`,
      `Input: ${JSON.stringify(call.input)}`,
    ].join("\n");
    try {
      const label = await host.model.classify(text, LABELS);
      if (label === "allow" || label === "deny") return { decision: label, reason: "nmg-router: Claude classifier verdict for a routed call" };
    } catch {
      // A rejected classification gives no verdict, the same as an unlabelled one.
    }
    return askPerson(host, call);
  },
};

// The server classifier does not judge routed models, so the person decides.
export const serverClassifierOffPolicy: PermissionPolicy = {
  decide: (host, call, askPerson) => askPerson(host, call),
};

export function policyFor(mode: PermissionMode): PermissionPolicy {
  return mode === "claude-classifier" ? claudeClassifierPolicy : serverClassifierOffPolicy;
}

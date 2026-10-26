import type { PermissionMode } from "./mode.ts";

// Who decides a routed tool call that no rule settles. Each policy answers allow, ask
// or deny with a reason. A policy's text never enters the routed conversation.

export type Decision = "allow" | "ask" | "deny";

export type Verdict = { readonly decision: Decision; readonly reason: string };

export type PolicyHost = {
  readonly session: { cwd(): Promise<string> };
  readonly model: { classify(text: string, labels: readonly string[]): Promise<string | undefined> };
};

export type PermissionPolicy = {
  decide(host: PolicyHost, call: { readonly tool: string; readonly input: unknown }): Promise<Verdict>;
};

const LABELS: readonly Decision[] = ["allow", "ask", "deny"];

function isDecision(value: unknown): value is Decision {
  return typeof value === "string" && (LABELS as readonly string[]).includes(value);
}

// A Claude model labels the call. A failed or unlabelled classification asks the person.
export const claudeClassifierPolicy: PermissionPolicy = {
  async decide(host, call) {
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
      if (isDecision(label)) return { decision: label, reason: "nmg-router: Claude classifier verdict for a routed call" };
    } catch {
      // A rejected classification gives no verdict, the same as an unlabelled one.
    }
    return { decision: "ask", reason: "nmg-router: classifier gave no verdict" };
  },
};

// The server classifier does not judge routed models, so the person decides.
export const serverClassifierOffPolicy: PermissionPolicy = {
  async decide() {
    return { decision: "ask", reason: "nmg-router: routed call; the server classifier does not judge routed models" };
  },
};

export function policyFor(mode: PermissionMode): PermissionPolicy {
  return mode === "claude-classifier" ? claudeClassifierPolicy : serverClassifierOffPolicy;
}

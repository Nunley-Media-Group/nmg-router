import type { Verdict } from "./policy.ts";

// Puts a routed call to the person in Claude Code's own question dialog, and turns
// the answer into allow or deny. A hook's ask is never the answer: in auto mode the
// server classifier still judges a hook's ask, and its block refuses routed calls.
// The question and its answer never enter the routed conversation.

export type Approver = "host" | "person";

export type ApprovalHost = {
  readonly ui: {
    ask(question: string, options: { readonly header: string; readonly options: readonly string[] }): Promise<string>;
  };
};

export type ApprovalCall = {
  readonly tool: string;
  readonly input: unknown;
  // The routed model that made the call, when its loop's model is known.
  readonly model: string | undefined;
  readonly approver: Approver | undefined;
  readonly signal?: AbortSignal | undefined;
};

export type AskPerson = (host: ApprovalHost, call: ApprovalCall) => Promise<Verdict>;

// The longest input summary a question shows.
export const INPUT_SUMMARY_LIMIT = 300;

const ALLOW = "Allow";
const DENY = "Deny";

export const ALLOWED: Verdict = { decision: "allow", reason: "nmg-router: the person allowed this routed call" };
export const NOT_ALLOWED: Verdict = { decision: "deny", reason: "nmg-router: the person did not allow this routed call" };
export const NOBODY_TO_ASK: Verdict = {
  decision: "deny",
  reason: "nmg-router: routed calls in auto mode need a person to approve them here; add an allow rule or turn auto mode off",
};

// Bash's command, or the input as JSON, cut to the limit.
export function inputSummary(tool: string, input: unknown): string {
  const command = tool === "Bash" && typeof input === "object" && input !== null ? (input as { command?: unknown }).command : undefined;
  const text = typeof command === "string" ? command : (JSON.stringify(input) ?? "");
  return text.length <= INPUT_SUMMARY_LIMIT ? text : `${text.slice(0, INPUT_SUMMARY_LIMIT)}…`;
}

export function questionOf(call: Pick<ApprovalCall, "tool" | "input" | "model">): string {
  return `${call.model ?? "A routed model"} wants to run ${call.tool}: ${inputSummary(call.tool, call.input)}. Allow it?`;
}

// One question at a time: parallel routed calls wait their turn, and a call
// abandoned while it waits is denied without a question.
export function createPersonApproval(): AskPerson {
  let queue: Promise<unknown> = Promise.resolve();
  return (host, call) => {
    if (call.approver !== "person") return Promise.resolve(NOBODY_TO_ASK);
    const turn = queue.then(async (): Promise<Verdict> => {
      if (call.signal?.aborted === true) return NOT_ALLOWED;
      try {
        const answer = await host.ui.ask(questionOf(call), { header: "nmg-router", options: [ALLOW, DENY] });
        return answer === ALLOW ? ALLOWED : NOT_ALLOWED;
      } catch {
        // A dismissed question is not an allow.
        return NOT_ALLOWED;
      }
    });
    queue = turn.catch(() => undefined);
    return turn;
  };
}

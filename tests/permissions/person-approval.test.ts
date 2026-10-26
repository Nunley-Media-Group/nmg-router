import { describe, expect, it } from "vitest";
import {
  ALLOWED,
  INPUT_SUMMARY_LIMIT,
  NOBODY_TO_ASK,
  NOT_ALLOWED,
  createPersonApproval,
  inputSummary,
  type ApprovalCall,
} from "../../src/permissions/person-approval.ts";
import { routeStep } from "../../src/routing/turn-step.ts";
import { fakeEngine, type FakeOptions } from "../support/fake-engine.ts";
import { CHAT_URL, chatTurn, collect, harness, postsTo, remember, replies, signIn, spyNext, step } from "../support/routing.ts";

const MODEL = "opencode-go/glm-5.1";

function call(extra: Partial<ApprovalCall> = {}): ApprovalCall {
  return { tool: "Bash", input: { command: "npm test" }, model: MODEL, approver: "person", ...extra };
}

function engineWith(options: Partial<FakeOptions>) {
  return fakeEngine({ platform: "linux", ...options });
}

// AC6: the person decides a routed call in Claude Code's own dialog, and the answer is allow or deny.
describe("asking the person", () => {
  it("asks with the model, the tool and the input, under an nmg-router header, and Allow allows", async () => {
    const engine = engineWith({ ask: "Allow" });

    expect(await createPersonApproval()(engine, call())).toEqual(ALLOWED);
    expect(engine.recorded.asks).toEqual([
      { question: `${MODEL} wants to run Bash: npm test. Allow it?`, options: { header: "nmg-router", options: ["Allow", "Deny"] } },
    ]);
    expect(ALLOWED.reason).toMatch(/^nmg-router: /);
  });

  it.each<[string, string | Error]>([
    ["Deny", "Deny"],
    ["free text under Other", "only if it is read-only"],
    ["a dismissed question", new Error("dismissed")],
  ])("denies on %s, with a reason naming nmg-router", async (_label, ask) => {
    expect(await createPersonApproval()(engineWith({ ask }), call())).toEqual(NOT_ALLOWED);
    expect(NOT_ALLOWED.reason).toMatch(/^nmg-router: /);
  });

  it.each<["host" | undefined]>([["host"], [undefined]])("denies without a question when the approver is %s", async (approver) => {
    const engine = engineWith({ ask: "Allow" });

    expect(await createPersonApproval()(engine, call({ approver }))).toEqual(NOBODY_TO_ASK);
    expect(engine.recorded.asks).toEqual([]);
    expect(NOBODY_TO_ASK.reason).toContain("add an allow rule or turn auto mode off");
  });

  it("shows a tool's input as JSON, cut to 300 characters", () => {
    expect(inputSummary("Write", { file_path: "a.txt" })).toBe('{"file_path":"a.txt"}');
    const long = inputSummary("Bash", { command: "x".repeat(INPUT_SUMMARY_LIMIT + 50) });
    expect(long).toBe(`${"x".repeat(INPUT_SUMMARY_LIMIT)}…`);
  });
});

describe("one question at a time", () => {
  it("asks parallel calls in turn, the second only after the first is answered", async () => {
    const order: string[] = [];
    let answerFirst: (label: string) => void = () => undefined;
    const engine = engineWith({
      ask: (question) => {
        order.push(question.includes("first") ? "ask first" : "ask second");
        return question.includes("first") ? new Promise((resolve) => (answerFirst = resolve)) : "Deny";
      },
    });
    const askPerson = createPersonApproval();

    const first = askPerson(engine, call({ input: { command: "first" } }));
    const second = askPerson(engine, call({ input: { command: "second" } }));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(order).toEqual(["ask first"]);

    answerFirst("Allow");
    expect(await first).toEqual(ALLOWED);
    expect(await second).toEqual(NOT_ALLOWED);
    expect(order).toEqual(["ask first", "ask second"]);
  });

  it("denies a call abandoned while it waits, without asking it", async () => {
    let answerFirst: (label: string) => void = () => undefined;
    const engine = engineWith({ ask: () => new Promise((resolve) => (answerFirst = resolve)) });
    const askPerson = createPersonApproval();
    const abandoned = new AbortController();

    const first = askPerson(engine, call());
    const second = askPerson(engine, call({ signal: abandoned.signal }));
    abandoned.abort();
    await new Promise((resolve) => setTimeout(resolve, 5));
    answerFirst("Allow");

    expect(await first).toEqual(ALLOWED);
    expect(await second).toEqual(NOT_ALLOWED);
    expect(engine.recorded.asks).toHaveLength(1);
  });
});

describe("the routed conversation", () => {
  it("never carries the question or its answer", async () => {
    const h = harness({ ask: "Allow", http: replies(chatTurn({ text: "ok" })) });
    await signIn(h.engine);
    await createPersonApproval()(h.engine, call());
    remember(h.capture);

    await collect(routeStep(h.router, step(0), spyNext()));

    const body = postsTo(h.engine, CHAT_URL)[0]?.body ?? "";
    expect(body).not.toContain("Allow it?");
    expect(body).not.toContain("nmg-router: the person");
  });
});

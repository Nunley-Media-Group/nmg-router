import { describe, expect, it } from "vitest";
import { checkFailed, checkRoutedTool, type ToolCheckDeps, type ToolVerdict } from "../../src/permissions/tool-check.ts";
import { createPermissionModeTracker, type PermissionModeTracker } from "../../src/permissions/permission-mode.ts";
import type { PermissionMode } from "../../src/permissions/mode.ts";
import { routeStep } from "../../src/routing/turn-step.ts";
import { CHAT_URL, chatTurn, collect, harness, postsTo, remember, replies, signIn, spyNext, step } from "../support/routing.ts";
import { autoModeOutcome, toolCall, toolNext } from "../support/fake-turn.ts";
import { ALLOWED, NOT_ALLOWED, createPersonApproval } from "../../src/permissions/person-approval.ts";
import type { FakeOptions } from "../support/fake-engine.ts";

// The id a routed step emitted for the call under test.
const ROUTED_CALL = "call_routed_1";

// A harness whose routed call id is recorded, with the permission mode and the policy the row picks.
function autoFixture(options: Partial<FakeOptions> = {}, policy: PermissionMode = "claude-classifier", mode = "auto") {
  const h = harness(options);
  const permissions: PermissionModeTracker = createPermissionModeTracker();
  permissions.observe({ permission_mode: mode });
  h.tracker.recordToolId(ROUTED_CALL);
  const deps: ToolCheckDeps = {
    tracker: h.tracker,
    mode: permissions,
    readMode: async () => policy,
    host: h.engine,
    askPerson: createPersonApproval(),
  };
  return { h, permissions, deps };
}

// AC5: in claude-classifier mode, a routed call that no rule settles gets the classifier's verdict.
describe("the Claude classifier decides a routed call", () => {
  it.each<["allow" | "deny"]>([["allow"], ["deny"]])("returns the classifier's %s, and asks nobody", async (label) => {
    const { h, deps } = autoFixture({ classify: label, ask: "Allow" });

    const verdict = await checkRoutedTool(deps, toolCall({ tool_use_id: ROUTED_CALL }), toolNext({ decision: "ask", reason: "core" }));

    expect(verdict).toEqual({ decision: label, reason: "nmg-router: Claude classifier verdict for a routed call" });
    expect(h.engine.recorded.classifications).toEqual([{ text: expect.any(String), labels: ["allow", "ask", "deny"] }]);
    expect(h.engine.recorded.asks).toEqual([]);
  });

  it("classifies on the tool, its input and the working directory", async () => {
    const { h, deps } = autoFixture({ classify: "allow", cwd: "/work/notes" });

    await checkRoutedTool(deps, toolCall({ tool_use_id: ROUTED_CALL }), toolNext({ decision: "ask" }));

    const [classified] = h.engine.recorded.classifications;
    expect(classified?.text).toContain("Tool: Bash");
    expect(classified?.text).toContain('{"command":"git status"}');
    expect(classified?.text).toContain("Working directory: /work/notes");
  });

  it("puts an ask label, a rejected classification or no label to the person", async () => {
    for (const classify of ["ask", new Error("classifier unavailable"), undefined]) {
      const { h, deps } = autoFixture({ classify, ask: "Allow" });

      const verdict = await checkRoutedTool(deps, toolCall({ tool_use_id: ROUTED_CALL }), toolNext({ decision: "ask" }));

      expect(verdict).toEqual(ALLOWED);
      expect(h.engine.recorded.asks).toHaveLength(1);
    }
  });

  it("keeps the classification out of every routed request", async () => {
    const { h, deps } = autoFixture({ classify: "deny", http: replies(chatTurn({ text: "ok" })) });
    await signIn(h.engine);
    await checkRoutedTool(deps, toolCall({ tool_use_id: ROUTED_CALL }), toolNext({ decision: "ask" }));
    remember(h.capture);

    await collect(routeStep(h.router, step(0), spyNext()));

    const [request] = postsTo(h.engine, CHAT_URL);
    expect(request?.body).toBeDefined();
    expect(request?.body).not.toContain("Decide whether this tool call");
    expect(request?.body).not.toContain("Working directory:");
  });
});

// AC6, SCN006: server-classifier-off puts the call to the person, and asks no classifier.
describe("the server classifier off", () => {
  it.each<[string, string | Error, typeof ALLOWED, string]>([
    ["Allow", "Allow", ALLOWED, "runs"],
    ["Deny", "Deny", NOT_ALLOWED, "refused"],
    ["a dismissed question", new Error("dismissed"), NOT_ALLOWED, "refused"],
  ])("answers %s as allow or deny, so no server classifier verdict is needed", async (_label, ask, expected, outcome) => {
    const { h, deps } = autoFixture({ classify: "allow", ask }, "server-classifier-off");
    h.tracker.recordStep("main", "opencode-go/glm-5.1");

    const verdict = await checkRoutedTool(deps, toolCall({ tool_use_id: ROUTED_CALL }), toolNext({ decision: "ask" }));

    expect(verdict).toEqual(expected);
    expect(autoModeOutcome(verdict)).toBe(outcome);
    expect(h.engine.recorded.classifications).toEqual([]);
    expect(h.engine.recorded.asks).toEqual([
      {
        question: "opencode-go/glm-5.1 wants to run Bash: git status. Allow it?",
        options: { header: "nmg-router", options: ["Allow", "Deny"] },
      },
    ]);
  });

  it("names a subagent's own model in the question", async () => {
    const { h, deps } = autoFixture({ ask: "Allow" }, "server-classifier-off");
    h.tracker.recordStep("agent-1", "opencode-go/glm-5.3");

    await checkRoutedTool(deps, toolCall({ tool_use_id: ROUTED_CALL, agentId: "agent-1" }), toolNext({ decision: "ask" }));

    expect(h.engine.recorded.asks[0]?.question).toMatch(/^opencode-go\/glm-5\.3 wants to run Bash/);
  });

  it("never leaves a routed auto-mode call as ask, in either mode, whoever approves", async () => {
    for (const policy of ["claude-classifier", "server-classifier-off"] as const) {
      for (const approver of ["person", "host", undefined] as const) {
        const { deps } = autoFixture({ classify: undefined, ask: new Error("dismissed") }, policy);

        const verdict = await checkRoutedTool(deps, toolCall({ tool_use_id: ROUTED_CALL, approver }), toolNext({ decision: "ask" }));

        expect(verdict.decision).not.toBe("ask");
        expect(autoModeOutcome(verdict)).not.toBe("refused by the classifier");
      }
    }
  });
});

// AC7: a rule, a settled check, a hook, a setting, a Claude call or another mode keeps Claude Code's verdict.
describe("verdicts this hook leaves alone", () => {
  it.each<[string, ToolVerdict]>([
    ["an allow rule", { decision: "allow", reason: "rule", rule: "Bash(git status:*)" }],
    ["a deny rule", { decision: "deny", reason: "rule", rule: "Bash(rm:*)" }],
    ["a settled deny", { decision: "deny", reason: "check" }],
    ["a settled allow", { decision: "allow" }],
    ["an ask from a hook", { decision: "ask", hook: "pre-hook" }],
    ["an ask from a setting", { decision: "ask", setting: "defaultMode" }],
  ])("returns %s unchanged", async (_label, verdict) => {
    const { h, deps } = autoFixture({ classify: "deny" });

    expect(await checkRoutedTool(deps, toolCall({ tool_use_id: ROUTED_CALL }), toolNext(verdict))).toEqual(verdict);
    expect(h.engine.recorded.classifications).toEqual([]);
  });

  it("returns a Claude call's or an id-less call's ask unchanged", async () => {
    const { h, deps } = autoFixture({ classify: "deny" });
    const core: ToolVerdict = { decision: "ask", reason: "core" };

    expect(await checkRoutedTool(deps, toolCall({ tool_use_id: "call_claude_9" }), toolNext(core))).toEqual(core);
    expect(await checkRoutedTool(deps, toolCall({ tool_use_id: undefined }), toolNext(core))).toEqual(core);
    expect(h.engine.recorded.classifications).toEqual([]);
  });

  it("returns a routed call's ask unchanged outside auto mode", async () => {
    const { h, deps, permissions } = autoFixture({ classify: "deny" });
    permissions.observe({ permission_mode: "default" });
    const core: ToolVerdict = { decision: "ask", reason: "core" };

    expect(await checkRoutedTool(deps, toolCall({ tool_use_id: ROUTED_CALL }), toolNext(core))).toEqual(core);
    expect(h.engine.recorded.classifications).toEqual([]);
  });
});

describe("the permission mode", () => {
  it("keeps the latest mode an event reports, and ignores an event that reports none", () => {
    const tracker = createPermissionModeTracker();
    expect(tracker.isAuto()).toBe(false);

    tracker.observe({ permission_mode: "auto" });
    tracker.observe({});
    expect(tracker.isAuto()).toBe(true);

    tracker.observe({ permission_mode: "plan" });
    expect(tracker.isAuto()).toBe(false);
  });
});

// The `.catch` path refuses a routed call in auto mode, and leaves every other call alone.
describe("a failed check", () => {
  it("denies a routed call in auto mode", () => {
    const { deps } = autoFixture();

    expect(checkFailed(deps, toolCall({ tool_use_id: ROUTED_CALL }))).toEqual({
      decision: "deny",
      reason: "nmg-router: permission check failed",
    });
  });

  it("leaves a Claude call and a call outside auto mode to the engine", () => {
    const { deps, permissions } = autoFixture();
    expect(checkFailed(deps, toolCall({ tool_use_id: "call_claude_9" }))).toBeUndefined();

    permissions.observe({ permission_mode: "default" });
    expect(checkFailed(deps, toolCall({ tool_use_id: ROUTED_CALL }))).toBeUndefined();
  });
});

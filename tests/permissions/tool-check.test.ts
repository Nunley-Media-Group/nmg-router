import { describe, expect, it } from "vitest";
import { checkFailed, checkRoutedTool, type ToolCheckDeps, type ToolVerdict } from "../../src/permissions/tool-check.ts";
import { createPermissionModeTracker, type PermissionModeTracker } from "../../src/permissions/permission-mode.ts";
import type { PermissionMode } from "../../src/permissions/mode.ts";
import { routeStep } from "../../src/routing/turn-step.ts";
import { CHAT_URL, chatTurn, collect, harness, postsTo, remember, replies, signIn, spyNext, step } from "../support/routing.ts";
import { toolCall, toolNext } from "../support/fake-turn.ts";
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
  };
  return { h, permissions, deps };
}

// AC5: in claude-classifier mode, a routed call that no rule settles gets the classifier's verdict.
describe("the Claude classifier decides a routed call", () => {
  it.each<["allow" | "ask" | "deny"]>([["allow"], ["ask"], ["deny"]])("returns the classifier's %s", async (label) => {
    const { h, deps } = autoFixture({ classify: label });

    const verdict = await checkRoutedTool(deps, toolCall({ tool_use_id: ROUTED_CALL }), toolNext({ decision: "ask", reason: "core" }));

    expect(verdict).toEqual({ decision: label, reason: "nmg-router: Claude classifier verdict for a routed call" });
    expect(h.engine.recorded.classifications).toEqual([{ text: expect.any(String), labels: ["allow", "ask", "deny"] }]);
  });

  it("classifies on the tool, its input and the working directory", async () => {
    const { h, deps } = autoFixture({ classify: "allow", cwd: "/work/notes" });

    await checkRoutedTool(deps, toolCall({ tool_use_id: ROUTED_CALL }), toolNext({ decision: "ask" }));

    const [classified] = h.engine.recorded.classifications;
    expect(classified?.text).toContain("Tool: Bash");
    expect(classified?.text).toContain('{"command":"git status"}');
    expect(classified?.text).toContain("Working directory: /work/notes");
  });

  it("asks the person when the classification is rejected or names no label", async () => {
    for (const classify of [new Error("classifier unavailable"), undefined]) {
      const { deps } = autoFixture({ classify });

      const verdict = await checkRoutedTool(deps, toolCall({ tool_use_id: ROUTED_CALL }), toolNext({ decision: "ask" }));

      expect(verdict).toEqual({ decision: "ask", reason: "nmg-router: classifier gave no verdict" });
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

// AC6: server-classifier-off asks the person, with a reason that names nmg-router.
describe("the server classifier off", () => {
  it("answers ask with an nmg-router reason, and asks no classifier", async () => {
    const { h, deps } = autoFixture({ classify: "allow" }, "server-classifier-off");

    const verdict = await checkRoutedTool(deps, toolCall({ tool_use_id: ROUTED_CALL }), toolNext({ decision: "ask" }));

    expect(verdict).toEqual({
      decision: "ask",
      reason: "nmg-router: routed call; the server classifier does not judge routed models",
    });
    expect(h.engine.recorded.classifications).toEqual([]);
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

// The `.catch` path asks the person about a routed call in auto mode, and leaves every other call alone.
describe("a failed check", () => {
  it("asks the person for a routed call in auto mode", () => {
    const { deps } = autoFixture();

    expect(checkFailed(deps, toolCall({ tool_use_id: ROUTED_CALL }))).toEqual({
      decision: "ask",
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

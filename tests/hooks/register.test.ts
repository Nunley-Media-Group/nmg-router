import { describe, expect, it, vi } from "vitest";
import { register } from "../../hooks/register.ts";
import { HUB_PANE_ID } from "../../src/hub/hub-controller.ts";
import { PANE_ID } from "../../src/login/pane.ts";

// Records every registration the module makes, so the wiring is checked without a host.
function recorder() {
  const calls: { event: string; matcher: unknown }[] = [];
  const on = ((event: string, matcher: unknown) => {
    calls.push({ event, matcher: typeof matcher === "function" ? undefined : matcher });
    return { catch: () => undefined };
  }) as unknown as Parameters<typeof register>[0];
  return { on, calls };
}

describe("hooks wiring", () => {
  // One command.run hook serves /login and /logout and passes every other command on.
  // The host needs each port's functions spelled at their call sites, so the two
  // commands share one hook rather than two copies of the same port. The routed
  // turns add the compose capture and the turn.step hook, which answers routed models.
  // Routed compaction, the main-loop trigger, routed permissions and the permission
  // mode observers are the rest.
  it("registers the command hooks, the compose capture, the turn step, the compaction and permission hooks, the login and model hub panes, and nothing else", () => {
    const { on, calls } = recorder();
    register(on, {} as never);
    expect(calls).toEqual([
      { event: "command.run", matcher: undefined },
      { event: "prompt.compose", matcher: undefined },
      { event: "turn.step", matcher: undefined },
      { event: "session.compact", matcher: undefined },
      { event: "turn.complete", matcher: undefined },
      { event: "tool.check", matcher: undefined },
      { event: "classic.UserPromptSubmit", matcher: undefined },
      { event: "classic.PermissionRequest", matcher: undefined },
      { event: "classic.PostToolUse", matcher: undefined },
      { event: "ui.render", matcher: { component: "Pane", requestId: PANE_ID } },
      { event: "ui.close", matcher: { id: PANE_ID } },
      { event: "session.start", matcher: undefined },
      { event: "command.run", matcher: { command: "model" } },
      { event: "command.run", matcher: { command: "usage" } },
      { event: "ui.render", matcher: { component: "Pane", requestId: HUB_PANE_ID } },
      { event: "ui.focus", matcher: { requestId: HUB_PANE_ID } },
      { event: "ui.close", matcher: { id: HUB_PANE_ID } },
    ]);
  });

  // The usage hook's catch handler, as `register` declares it.
  function usageCatchOf(): (engine: unknown, e: unknown, next: unknown) => unknown {
    type Handler = (engine: unknown, e: unknown, next: unknown) => unknown;
    let usageCatch: Handler | undefined;
    const on = ((event: string, matcher: unknown) => ({
      catch: (handler: Handler) => {
        if (event === "command.run" && (matcher as { command?: string } | undefined)?.command === "usage") usageCatch = handler;
        return undefined;
      },
    })) as unknown as Parameters<typeof register>[0];
    register(on, {} as never);
    if (usageCatch === undefined) throw new Error("no /usage catch");
    return usageCatch;
  }

  const usageInput = { command: "usage", args: "", origin: { kind: "composer" }, presentation: { isFullscreen: false, columns: 200 } };

  // A failed `/usage` hook still runs Claude Code's own view, through its catch.
  it("runs the built-in /usage through the usage hook's catch when the hook failed before calling next", () => {
    const next = Object.assign(vi.fn(() => ({ text: "built-in" })), { called: false, error: { kind: "throw", budget: 1000 } });

    expect(usageCatchOf()({}, usageInput, next)).toEqual({ text: "built-in" });
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(usageInput);
  });

  // After an interrupted panel, the catch's `next` is the host's replay of that rejection, not a second run.
  it("passes an interrupted /usage's rejection on through the replayed next, calling it once", async () => {
    const interrupted = new Error("interrupted");
    const replay = Object.assign(vi.fn(() => Promise.reject(interrupted)), { called: true, error: { kind: "throw", budget: 1000 } });

    await expect(usageCatchOf()({}, usageInput, replay)).rejects.toBe(interrupted);
    expect(replay).toHaveBeenCalledTimes(1);
  });
});

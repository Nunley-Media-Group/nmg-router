import { describe, expect, it } from "vitest";
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
      { event: "command.run", matcher: { command: "model" } },
      { event: "ui.render", matcher: { component: "Pane", requestId: HUB_PANE_ID } },
      { event: "ui.focus", matcher: { requestId: HUB_PANE_ID } },
      { event: "ui.close", matcher: { id: HUB_PANE_ID } },
    ]);
  });
});

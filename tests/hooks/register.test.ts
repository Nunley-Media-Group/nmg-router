import { describe, expect, it } from "vitest";
import { register } from "../../hooks/register.ts";
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
  // commands share one hook rather than two copies of the same port.
  it("registers the command hook, the pane render and the pane close, and nothing else", () => {
    const { on, calls } = recorder();
    register(on, {} as never);
    expect(calls).toEqual([
      { event: "command.run", matcher: undefined },
      { event: "ui.render", matcher: { component: "Pane", requestId: PANE_ID } },
      { event: "ui.close", matcher: { id: PANE_ID } },
    ]);
  });
});

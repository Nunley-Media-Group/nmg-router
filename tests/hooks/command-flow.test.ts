import type { CommandRunInput, CommandRunResult } from "claude-code";
import { describe, expect, it, vi } from "vitest";
import { register } from "../../hooks/register.ts";
import { createCommandFlows } from "../../src/login/command-flow.ts";
import { fakeEngine, type FakeEngine } from "../support/fake-engine.ts";

// The host gives a command.run hook 10 s of its own time, and a person's picks
// are not a `$` call. These tests drive the registered hooks and check the hook
// answers before anyone picks, so a pick at any pace still reaches the flow.

type Hook = (...args: unknown[]) => unknown;
type Node = { readonly props: Record<string, unknown> };

function registered() {
  const hooks = new Map<string, Hook>();
  const catches = new Map<string, Hook>();
  const on = ((event: string, matcher: unknown, hook?: unknown) => {
    hooks.set(event, (typeof matcher === "function" ? matcher : hook) as Hook);
    return { catch: (handler: Hook) => catches.set(event, handler) };
  }) as unknown as Parameters<typeof register>[0];
  register(on, {} as never);
  return { hooks, catches };
}

function inputOf(command: string, origin: CommandRunInput["origin"] = { kind: "composer" }): CommandRunInput {
  return { command, args: "", origin, presentation: { isFullscreen: false, columns: 120 } };
}

const element = (props: Record<string, unknown>): Node => ({ props });
const elements = { Box: element, Text: element, Button: element, Input: element, Select: element };

function find(node: unknown, key: string): Node {
  const found = (function walk(current: unknown): Node | undefined {
    if (Array.isArray(current)) return current.map(walk).find((hit) => hit !== undefined);
    if (typeof current !== "object" || current === null || !("props" in current)) return undefined;
    const { props } = current as Node;
    return props.key === key ? (current as Node) : walk(props.children);
  })(node);
  if (found === undefined) throw new Error(`no element keyed "${key}" in the pane`);
  return found;
}

function drawPane(hooks: Map<string, Hook>): unknown {
  const render = hooks.get("ui.render");
  return render?.({ ui: { resolve: () => elements } }, { surface: "terminal" }, () => undefined);
}

// The engine re-runs a handed-off command through the hooks, as `$.command.run` does.
function reentrant(engine: FakeEngine, hooks: Map<string, Hook>, next: (e: CommandRunInput) => Promise<CommandRunResult>) {
  return {
    ...engine,
    command: {
      run: async (args: { command: string; args?: string }) => {
        engine.recorded.commands.push(args);
        const rerun = inputOf(args.command, { kind: "plugin", name: "nmg-router" } as CommandRunInput["origin"]);
        return (await hooks.get("command.run")?.(engine, rerun, next)) as CommandRunResult;
      },
    },
  };
}

describe("command.run under the host's hook budget", () => {
  for (const command of ["login", "logout"]) {
    it(`answers /${command} at once, before the person picks, without calling next(e)`, async () => {
      const { hooks } = registered();
      const engine = fakeEngine({ platform: "macos" });
      const next = vi.fn(async () => ({ text: "built-in" }));

      const answer = await hooks.get("command.run")?.(engine, inputOf(command), next);

      expect(answer).toEqual({});
      await vi.waitFor(() => expect(engine.recorded.panes).toHaveLength(1));
      expect(next).not.toHaveBeenCalled();
      expect(engine.recorded.ui.join("\n")).not.toContain("cancelled");
    });

    it(`hands an Anthropic pick on /${command} to next(e) through a re-run, whenever the pick comes`, async () => {
      const { hooks } = registered();
      const engine = fakeEngine({ platform: "macos" });
      const next = vi.fn(async (e: CommandRunInput) => ({ text: `built-in ${e.command}` }));
      const host = reentrant(engine, hooks, next);

      expect(await hooks.get("command.run")?.(host, inputOf(command), next)).toEqual({});
      await vi.waitFor(() => expect(engine.recorded.panes).toHaveLength(1));
      const onSelect = find(drawPane(hooks), "pick").props.onSelect as (value: string) => void;
      onSelect("anthropic");

      await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(1));
      expect(engine.recorded.commands).toEqual([{ command, args: "" }]);
      expect(next.mock.calls[0]?.[0]).toMatchObject({ command, origin: { kind: "plugin" } });
      // The built-in command prints its own output; the mod adds no line for it.
      expect(engine.recorded.ui).not.toContain(`built-in ${command}`);
    });
  }

  it("shows a routed outcome as a transcript line once the person answers", async () => {
    const { hooks } = registered();
    const engine = fakeEngine({ platform: "macos" });
    const next = vi.fn(async () => ({ text: "built-in" }));

    await hooks.get("command.run")?.(engine, inputOf("login"), next);
    await vi.waitFor(() => expect(engine.recorded.panes).toHaveLength(1));
    (find(drawPane(hooks), "cancel").props.onPress as () => void)();

    await vi.waitFor(() => expect(engine.recorded.ui).toContain("Login cancelled."));
    expect(engine.recorded.commands).toEqual([]);
    expect(next).not.toHaveBeenCalled();
  });

  it("passes a plugin's run of /login on to the picker when no Anthropic pick is pending", async () => {
    const { hooks } = registered();
    const engine = fakeEngine({ platform: "macos" });
    const next = vi.fn(async () => ({ text: "built-in" }));
    const origin = { kind: "plugin", name: "other" } as CommandRunInput["origin"];

    expect(await hooks.get("command.run")?.(engine, inputOf("login", origin), next)).toEqual({});
    await vi.waitFor(() => expect(engine.recorded.panes).toHaveLength(1));
    expect(next).not.toHaveBeenCalled();
  });

  it("answers a failed /login or /logout with text and never runs the built-in command", async () => {
    const { catches } = registered();
    const handler = catches.get("command.run");
    const next = Object.assign(vi.fn(async () => ({ text: "built-in" })), { called: false });

    expect(await handler?.({}, inputOf("logout"), next)).toEqual({ text: "/logout could not start. Nothing was changed." });
    expect(await handler?.({}, inputOf("login"), next)).toEqual({ text: "/login could not start. Nothing was changed." });
    expect(next).not.toHaveBeenCalled();
    expect(await handler?.({}, inputOf("status"), next)).toEqual({ text: "built-in" });
  });
});

describe("command flows", () => {
  it("logs a generic line, not the error, when a flow fails", async () => {
    const engine = fakeEngine({ platform: "macos" });
    const answer = createCommandFlows().start(engine, inputOf("login"), async () => {
      throw new Error("provider reply: secret-ish body");
    });

    expect(answer).toEqual({});
    await vi.waitFor(() => expect(engine.recorded.ui).toHaveLength(1));
    expect(engine.recorded.ui).toEqual(["/login stopped on an unexpected error. Nothing else was changed."]);
  });
});

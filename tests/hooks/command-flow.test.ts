import type { CommandRunInput, CommandRunResult } from "claude-code";
import { describe, expect, it, vi } from "vitest";
import { register } from "../../hooks/register.ts";
import { createCommandFlows } from "../../src/login/command-flow.ts";
import { createPaneController, PANE_ID } from "../../src/login/pane.ts";
import { fakeEngine, type FakeEngine } from "../support/fake-engine.ts";

// The host gives a command.run hook 10 s of its own time, and a person's picks
// are not a `$` call. These tests drive the registered hooks and check the hook
// answers before anyone picks, so a pick at any pace still reaches the flow.
// The terminal is 91 columns wide, below the host's 144-column floor for a pane
// the person did not ask for, so a pane opened after the hook would not be drawn.

const NARROW = 91;

type Hook = (...args: unknown[]) => unknown;
type Node = { readonly props: Record<string, unknown> };

// This map holds one hook per event. The login flow registers first for each event
// it uses, and the model hub's hooks, registered later for the same events, are
// another feature's, so the first registration is the flow's.
function registered() {
  const hooks = new Map<string, Hook>();
  const catches = new Map<string, Hook>();
  const on = ((event: string, matcher: unknown, hook?: unknown) => {
    if (!hooks.has(event)) hooks.set(event, (typeof matcher === "function" ? matcher : hook) as Hook);
    return { catch: (handler: Hook) => catches.set(event, handler) };
  }) as unknown as Parameters<typeof register>[0];
  register(on, {} as never);
  return { hooks, catches };
}

function inputOf(command: string, origin: CommandRunInput["origin"] = { kind: "composer" }): CommandRunInput {
  return { command, args: "", origin, presentation: { isFullscreen: false, columns: NARROW } };
}

// Runs the command hook as the engine runs it for the person's command.
function runCommand(hooks: Map<string, Hook>, engine: FakeEngine, input: CommandRunInput, next: unknown) {
  return engine.asking(() => hooks.get("command.run")?.(engine, input, next));
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
    it(`answers /${command} once its pane is open, before the person picks, without calling next(e)`, async () => {
      const { hooks } = registered();
      const engine = fakeEngine({ platform: "macos", columns: NARROW });
      const next = vi.fn(async () => ({ text: "built-in" }));

      const answer = await runCommand(hooks, engine, inputOf(command), next);

      expect(answer).toEqual({});
      expect(engine.recorded.panes).toHaveLength(1);
      expect(next).not.toHaveBeenCalled();
      expect(engine.recorded.ui.join("\n")).not.toContain("cancelled");
    });

    it(`draws the /${command} picker at ${NARROW} columns, in the pane opened inside the hook`, async () => {
      const { hooks } = registered();
      const engine = fakeEngine({ platform: "macos", columns: NARROW });

      await runCommand(hooks, engine, inputOf(command), vi.fn());

      await vi.waitFor(() => expect(find(drawPane(hooks), "pick").props.options).toBeDefined());
      expect(engine.recorded.panes).toEqual([expect.objectContaining({ id: PANE_ID, focus: true })]);
      // Nothing says the pane is waiting or could not be shown.
      expect(engine.recorded.ui).toEqual([]);
    });

    it(`hands an Anthropic pick on /${command} to next(e) through a re-run, whenever the pick comes`, async () => {
      const { hooks } = registered();
      const engine = fakeEngine({ platform: "macos", columns: NARROW });
      const next = vi.fn(async (e: CommandRunInput) => ({ text: `built-in ${e.command}` }));
      const host = reentrant(engine, hooks, next);

      expect(await engine.asking(() => hooks.get("command.run")?.(host, inputOf(command), next))).toEqual({});
      await vi.waitFor(() => expect(find(drawPane(hooks), "pick")).toBeDefined());
      const onSelect = find(drawPane(hooks), "pick").props.onSelect as (value: string) => void;
      onSelect("anthropic");

      await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(1));
      expect(engine.recorded.commands).toEqual([{ command, args: "" }]);
      expect(next.mock.calls[0]?.[0]).toMatchObject({ command, origin: { kind: "plugin" } });
      // The mod's pane closes before the built-in command draws its own dialog.
      expect(engine.recorded.paneCloses).toEqual([PANE_ID]);
      // The built-in command prints its own output; the mod adds no line for it.
      expect(engine.recorded.ui).not.toContain(`built-in ${command}`);
    });
  }

  it("draws the next step in the same pane after a pick, with no second open", async () => {
    const { hooks } = registered();
    const engine = fakeEngine({ platform: "macos", columns: NARROW });

    await runCommand(hooks, engine, inputOf("login"), vi.fn());
    await vi.waitFor(() => expect(find(drawPane(hooks), "pick")).toBeDefined());
    (find(drawPane(hooks), "pick").props.onSelect as (value: string) => void)("opencode-go");

    await vi.waitFor(() => expect(find(drawPane(hooks), "secret")).toBeDefined());
    expect(engine.recorded.panes).toHaveLength(1);
    expect(engine.recorded.paneCloses).toEqual([]);
  });

  it("shows a routed outcome as a transcript line once the person answers, and closes the pane", async () => {
    const { hooks } = registered();
    const engine = fakeEngine({ platform: "macos", columns: NARROW });
    const next = vi.fn(async () => ({ text: "built-in" }));

    await runCommand(hooks, engine, inputOf("login"), next);
    await vi.waitFor(() => expect(find(drawPane(hooks), "cancel")).toBeDefined());
    (find(drawPane(hooks), "cancel").props.onPress as () => void)();

    await vi.waitFor(() => expect(engine.recorded.ui).toContain("Login cancelled."));
    expect(engine.recorded.paneCloses).toEqual([PANE_ID]);
    expect(engine.recorded.commands).toEqual([]);
    expect(next).not.toHaveBeenCalled();
  });

  it("keeps a second /login's pane open when it supersedes a pending flow", async () => {
    const { hooks } = registered();
    const engine = fakeEngine({ platform: "macos", columns: NARROW });

    await runCommand(hooks, engine, inputOf("login"), vi.fn());
    await vi.waitFor(() => expect(find(drawPane(hooks), "pick")).toBeDefined());
    await runCommand(hooks, engine, inputOf("login"), vi.fn());

    // The first flow ends cancelled, and its end leaves the second command's pane alone.
    await vi.waitFor(() => expect(engine.recorded.ui).toEqual(["Login cancelled."]));
    expect(engine.recorded.paneCloses).toEqual([]);
    (find(drawPane(hooks), "pick").props.onSelect as (value: string) => void)("opencode-go");
    await vi.waitFor(() => expect(find(drawPane(hooks), "secret")).toBeDefined());
    expect(engine.recorded.ui).toEqual(["Login cancelled."]);
    expect(engine.keyboard()).toBe(PANE_ID);
  });

  it("gives the OpenAI Codex paste field the keyboard, even after the pane lost it", async () => {
    const { hooks } = registered();
    const engine = fakeEngine({ platform: "macos", columns: NARROW });

    await runCommand(hooks, engine, inputOf("login"), vi.fn());
    await vi.waitFor(() => expect(find(drawPane(hooks), "pick")).toBeDefined());
    (find(drawPane(hooks), "pick").props.onSelect as (value: string) => void)("openai-codex");
    // The host hands the keys back to the prompt while the flow prepares the sign-in.
    engine.dropKeys();

    await vi.waitFor(() => expect(engine.recorded.focus.at(-1)).toBe("paste"));
    expect(engine.keyboard()).toBe(PANE_ID);
    expect(find(drawPane(hooks), "paste")).toBeDefined();
    // The sign-in page is still opened in the browser.
    expect(engine.recorded.processes.some((process) => process.argv[0] === "open")).toBe(true);
    expect(engine.recorded.paneCloses).toEqual([]);
  });

  it("passes a plugin's run of /login on to the picker when no Anthropic pick is pending", async () => {
    const { hooks } = registered();
    const engine = fakeEngine({ platform: "macos", columns: NARROW });
    const next = vi.fn(async () => ({ text: "built-in" }));
    const origin = { kind: "plugin", name: "other" } as CommandRunInput["origin"];

    expect(await runCommand(hooks, engine, inputOf("login", origin), next)).toEqual({});
    expect(engine.recorded.panes).toHaveLength(1);
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
  it("logs a generic line, not the error, when a flow fails, and closes the pane", async () => {
    const engine = fakeEngine({ platform: "macos" });
    const answer = await createCommandFlows().start(engine, inputOf("login"), createPaneController(), async () => {
      throw new Error("provider reply: secret-ish body");
    });

    expect(answer).toEqual({});
    await vi.waitFor(() => expect(engine.recorded.ui).toHaveLength(1));
    expect(engine.recorded.ui).toEqual(["/login stopped on an unexpected error. Nothing else was changed."]);
    expect(engine.recorded.paneCloses).toEqual([PANE_ID]);
  });

  it("answers with the reason and runs no flow when the pane cannot be placed", async () => {
    // Opened outside the person's command at 91 columns, the host leaves the pane undrawn.
    const engine = fakeEngine({ platform: "macos", columns: NARROW });
    const flow = vi.fn(async () => ({ text: "ran" }));

    const answer = await createCommandFlows().start(engine, inputOf("logout"), createPaneController(), flow);

    expect(answer).toEqual({
      text: "The /logout pane could not be shown: unasked below 144 columns (91 now). Nothing was changed.",
    });
    expect(flow).not.toHaveBeenCalled();
    expect(engine.recorded.paneCloses).toEqual([PANE_ID]);
  });
});

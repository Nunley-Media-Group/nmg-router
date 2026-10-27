import type { CommandRunInput } from "claude-code";
import { describe, expect, it } from "vitest";
import { register } from "../../hooks/register.ts";
import { writeCache } from "../../src/catalog/cache.ts";
import { HUB_PANE_ID } from "../../src/hub/hub-controller.ts";
import { fakeEngine, recordHooks } from "../support/fake-engine.ts";
import { KIMI, keyed, textOf } from "../support/hub-harness.ts";

// The registered hooks, dispatched as the host chains them: `/model`, the hub pane's
// draw, its focus and its Esc, with the engine as `$`.

function wired() {
  const engine = fakeEngine({ platform: "linux", columns: 200 });
  const { on, dispatch } = recordHooks(engine);
  register(on as never, {} as never);
  return { engine, dispatch };
}

function model(args: string): CommandRunInput {
  return {
    command: "model",
    args,
    origin: { kind: "composer" },
    presentation: { isFullscreen: false, columns: 200 },
  } as unknown as CommandRunInput;
}

function drawHubPane(dispatch: (event: string, input: unknown) => unknown): unknown {
  return dispatch("ui.render", { component: "Pane", requestId: HUB_PANE_ID, surface: "terminal" });
}

describe("the model hub's hooks", () => {
  it("opens the hub for a bare /model, and answers at once", async () => {
    const { engine, dispatch } = wired();
    expect(await dispatch("command.run", model(""))).toEqual({});
    expect(engine.recorded.panes).toEqual([expect.objectContaining({ id: HUB_PANE_ID, focus: true })]);
  });

  it("passes /model with an argument to core, after recording the recent use", async () => {
    const { engine, dispatch } = wired();
    const result = await dispatch("command.run", model("opus"));
    expect(result).toEqual({});
    expect(engine.recorded.panes).toEqual([]);
    expect(await engine.store.get("models.recent")).toMatchObject({ opus: expect.any(Number) });
  });

  it("draws the hub pane, and an Esc clears a search before the next Esc closes it", async () => {
    const { engine, dispatch } = wired();
    await dispatch("command.run", model(""));
    keyed(drawHubPane(dispatch), "search")?.props.onInput?.("kimi");

    const refused = await dispatch("ui.close", { id: HUB_PANE_ID, origin: { kind: "person" } });
    expect(refused).toEqual({ deny: "The search was cleared first." });
    expect(keyed(drawHubPane(dispatch), "search")?.props.value).toBe("");

    const closed = await dispatch("ui.close", { id: HUB_PANE_ID, origin: { kind: "person" } });
    expect(closed).toEqual({});
    expect(engine.recorded.paneCloses).toEqual([]);
  });

  // Core's /model refuses an id that is neither Claude's nor in a modelPicker row, so
  // the session start writes the rows from the cached catalog before the first switch.
  it("lets core switch to a cached routed model once the session has started, with no refresh", async () => {
    const { engine, dispatch } = wired();
    await writeCache(engine, { version: 1, providers: { "opencode-go": { fetchedAt: 1, status: "ok", models: [KIMI] } } });
    expect(await dispatch("command.run", model(KIMI.id))).toEqual({ text: `Model '${KIMI.id}' not found` });

    await dispatch("session.start", { cwd: "/work", surface: "terminal", isInteractive: true });

    expect(engine.recorded.http).toEqual([]);
    expect(await dispatch("command.run", model(KIMI.id))).toEqual({});
  });

  it("shows the detail line of the row the focus rests on", async () => {
    const { dispatch } = wired();
    await dispatch("command.run", model(""));
    await dispatch("ui.focus", {
      component: "Pane",
      requestId: HUB_PANE_ID,
      element: "row:opus",
      origin: { kind: "person" },
    });
    expect(textOf(drawHubPane(dispatch))).toContain("Opus");
  });
});

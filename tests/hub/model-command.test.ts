import type { CommandRunInput } from "claude-code";
import { describe, expect, it, vi } from "vitest";
import { HUB_PANE_ID } from "../../src/hub/hub-controller.ts";
import { handleModelCommand } from "../../src/hub/model-command.ts";
import { drawnElements } from "../support/fake-engine.ts";
import { hubHarness, keyed, settle, textOf, type HubHarness } from "../support/hub-harness.ts";

// `/model`, the hub's pane and its picks, driven through the controller over stubbed services.

function input(args: string): CommandRunInput {
  return {
    command: "model",
    args,
    origin: { kind: "composer" },
    presentation: { isFullscreen: false, columns: 200 },
  } as unknown as CommandRunInput;
}

async function openBare(h: HubHarness): Promise<void> {
  const result = await handleModelCommand(h.host, input(""), vi.fn(), h.hub);
  expect(result).toEqual({});
}

function tree(h: HubHarness): unknown {
  return h.hub.draw(drawnElements as never);
}

describe("/model with arguments", () => {
  it("records the recent use and runs on through next(e), without opening the hub", async () => {
    const h = await hubHarness();
    const next = vi.fn(async () => ({ text: "switched" }));
    const result = await handleModelCommand(h.host, input(" opus "), next, h.hub);
    expect(result).toEqual({ text: "switched" });
    expect(next).toHaveBeenCalledOnce();
    expect(h.engine.recorded.panes).toEqual([]);
    expect(await h.engine.store.get("models.recent")).toMatchObject({ opus: expect.any(Number) });
  });
});

describe("/model with no arguments", () => {
  it("opens the hub on All models and answers at once", async () => {
    const h = await hubHarness();
    await openBare(h);
    expect(h.engine.recorded.panes).toEqual([expect.objectContaining({ id: HUB_PANE_ID, focus: true })]);
    expect(textOf(tree(h))).toContain("All models (8)");
  });

  it("writes the detail line of the row the focus rests on", async () => {
    const h = await hubHarness();
    await openBare(h);
    h.hub.focused("row:opencode-go/kimi-k3.1-pro");
    expect(textOf(tree(h))).toContain("Kimi K3.1 Pro · 128k ctx");
  });

  it("refreshes a provider once per session, the first time its entry is opened", async () => {
    const h = await hubHarness();
    await openBare(h);
    keyed(tree(h), "scope:opencode-go")?.props.onPress?.();
    await settle();
    expect(h.services.refresh).toHaveBeenCalledTimes(1);
    expect(h.services.refresh).toHaveBeenCalledWith("opencode-go");

    keyed(tree(h), "scope:all")?.props.onPress?.();
    keyed(tree(h), "scope:opencode-go")?.props.onPress?.();
    await settle();
    expect(h.services.refresh).toHaveBeenCalledTimes(1);

    await openBare(h);
    keyed(tree(h), "scope:opencode-go")?.props.onPress?.();
    await settle();
    expect(h.services.refresh).toHaveBeenCalledTimes(1);
  });

  // The host's ring keeps a position, and a scope change redraws a different number of
  // rows ahead of the sidebar, so the hub puts the ring back on its element by key.
  it("keeps the focus ring on the pressed sidebar entry, and on the login button in the locked view", async () => {
    const h = await hubHarness();
    await openBare(h);
    await settle();
    h.hub.focused("scope:opencode-go");
    keyed(tree(h), "scope:opencode-go")?.props.onPress?.();
    await settle();
    expect(h.engine.recorded.focus.at(-1)).toBe("scope:opencode-go");

    h.hub.focused("scope:xai");
    keyed(tree(h), "scope:xai")?.props.onPress?.();
    await settle();
    expect(h.engine.recorded.focus.at(-1)).toBe("login");
  });

  it("puts the ring on the search field when the element it rested on is no longer drawn", async () => {
    const h = await hubHarness();
    await openBare(h);
    await settle();
    h.hub.focused("row:opus");
    keyed(tree(h), "scope:opencode-go")?.props.onPress?.();
    await settle();
    expect(h.engine.recorded.focus.at(-1)).toBe("search");
  });

  it("clears a non-empty search on Esc, and closes the hub once the search is empty", async () => {
    const h = await hubHarness();
    await openBare(h);
    keyed(tree(h), "search")?.props.onInput?.("kimi");
    expect(h.hub.refusesClose({ kind: "person" })).toBe(true);
    expect(keyed(tree(h), "search")?.props.value).toBe("");
    expect(h.hub.refusesClose({ kind: "person" })).toBe(false);
  });

  it("switches to a routed pick through /model, after closing the hub", async () => {
    const h = await hubHarness();
    await openBare(h);
    keyed(tree(h), "row:opencode-go/kimi-k3.1-pro")?.props.onPress?.();
    await settle();
    expect(h.engine.recorded.paneCloses).toEqual([HUB_PANE_ID]);
    expect(h.engine.recorded.commands).toEqual([expect.objectContaining({ command: "model", args: "opencode-go/kimi-k3.1-pro" })]);

    await openBare(h);
    keyed(tree(h), "row:opus")?.props.onPress?.();
    await settle();
    expect(h.engine.recorded.commands.at(-1)).toEqual(expect.objectContaining({ command: "model", args: "opus" }));
  });

  it("refuses a pick the transcript does not fit, and keeps the hub open with a notice", async () => {
    const h = await hubHarness({ contextTokens: 200000 });
    await openBare(h);
    expect(textOf(tree(h))).toContain("context>128k");
    keyed(tree(h), "row:opencode-go/kimi-k3.1-pro")?.props.onPress?.();
    await settle();
    expect(h.engine.recorded.toasts).toEqual([
      "Kept claude-sonnet-5-5: this conversation is larger than opencode-go/kimi-k3.1-pro's window.",
    ]);
    expect(h.engine.recorded.commands).toEqual([]);
    expect(h.engine.recorded.paneCloses).toEqual([]);
    expect(h.engine.recorded.compacts).toEqual([]);
    expect(keyed(tree(h), "row:opencode-go/kimi-k3.1-pro")).toBeDefined();
  });

  it("switches to a routed pick the transcript fits exactly, without compacting", async () => {
    const h = await hubHarness({ contextTokens: 128000 });
    await openBare(h);
    keyed(tree(h), "row:opencode-go/kimi-k3.1-pro")?.props.onPress?.();
    await settle();
    expect(h.engine.recorded.toasts).toEqual([]);
    expect(h.engine.recorded.commands).toEqual([
      expect.objectContaining({ command: "model", args: "opencode-go/kimi-k3.1-pro" }),
    ]);
    expect(h.engine.recorded.compacts).toEqual([]);
  });

  it("switches to a Claude model whatever the transcript size, since the lineup has no window", async () => {
    const h = await hubHarness({ contextTokens: 200000 });
    await openBare(h);
    keyed(tree(h), "row:opus")?.props.onPress?.();
    await settle();
    expect(h.engine.recorded.toasts).toEqual([]);
    expect(h.engine.recorded.commands).toEqual([expect.objectContaining({ command: "model", args: "opus" })]);
  });

  it("shows a locked provider's bundled models and login, and a cancelled login keeps the hub closed", async () => {
    const h = await hubHarness();
    await openBare(h);
    keyed(tree(h), "scope:xai")?.props.onPress?.();
    expect(textOf(tree(h))).toContain("xAI has no credentials.");
    keyed(tree(h), "login")?.props.onPress?.();
    await settle();
    expect(h.engine.recorded.paneCloses).toEqual([HUB_PANE_ID]);
    expect(h.engine.recorded.ui).toContain("Login cancelled.");
    expect(h.engine.recorded.panes.filter((pane) => pane.id === HUB_PANE_ID)).toHaveLength(1);
  });
});

import type { CommandRunInput } from "claude-code";
import { describe, expect, it, vi } from "vitest";
import { HUB_PANE_ID } from "../../src/hub/hub-controller.ts";
import { handleModelCommand } from "../../src/hub/model-command.ts";
import { drawnElements } from "../support/fake-engine.ts";
import {
  chooseModel,
  chooseScope,
  hubHarness,
  keyed,
  nodesOf,
  optionValues,
  settle,
  textOf,
  type HubHarness,
} from "../support/hub-harness.ts";

// `/model`, the hub's pane and its picks, driven through the controller over stubbed services.

function input(args: string): CommandRunInput {
  return {
    command: "model",
    args,
    origin: { kind: "composer" },
    presentation: { isFullscreen: false, columns: 200 },
  } as unknown as CommandRunInput;
}

// As the person's command: the hub's open is asked, so it is placed at any width.
async function openBare(h: HubHarness): Promise<void> {
  const result = await h.engine.asking(() => handleModelCommand(h.host, input(""), vi.fn(), h.hub));
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

  // Core's /model refuses a routed id until Claude Code has loaded its settings row.
  it("waits for the id's settings row to be loaded before core's /model runs", async () => {
    const h = await hubHarness();
    const order: string[] = [];
    const rowLoaded = vi.fn(async () => (order.push("loaded"), true));
    const next = vi.fn(async () => (order.push("core"), {}));
    await handleModelCommand(h.host, input(" opencode-go/kimi-k3.1-pro "), next, h.hub, rowLoaded);
    expect(rowLoaded).toHaveBeenCalledWith("opencode-go/kimi-k3.1-pro");
    expect(order).toEqual(["loaded", "core"]);
    expect(h.engine.recorded.ui).toEqual([]);
  });

  it("still runs core's /model when the row never loads, and says so", async () => {
    const h = await hubHarness();
    const next = vi.fn(async () => ({}));
    await handleModelCommand(h.host, input("opencode-go/kimi-k3.1-pro"), next, h.hub, async () => false);
    expect(next).toHaveBeenCalledOnce();
    expect(h.engine.recorded.ui).toEqual([
      "nmg-router: Claude Code has not loaded opencode-go/kimi-k3.1-pro's model picker row yet.",
    ]);
  });
});

describe("/model with no arguments", () => {
  it("opens the hub on All models and answers at once", async () => {
    const h = await hubHarness();
    await openBare(h);
    expect(h.engine.recorded.panes).toEqual([expect.objectContaining({ id: HUB_PANE_ID, focus: true })]);
    expect(textOf(tree(h))).toContain("All models (8)");
  });

  it("selects the current model's row, and writes its detail line", async () => {
    const h = await hubHarness({ selectedModel: "opencode-go/kimi-k3.1-pro" });
    await openBare(h);
    expect(keyed(tree(h), "models")?.props.value).toBe("row:opencode-go/kimi-k3.1-pro");
    expect(textOf(tree(h))).toContain("Kimi K3.1 Pro · 128k ctx");
  });

  it("refreshes a provider once per session, the first time its entry is opened", async () => {
    const h = await hubHarness();
    await openBare(h);
    chooseScope(tree(h), "opencode-go");
    await settle();
    expect(h.services.refresh).toHaveBeenCalledTimes(1);
    expect(h.services.refresh).toHaveBeenCalledWith("opencode-go");

    chooseScope(tree(h), "all");
    chooseScope(tree(h), "opencode-go");
    await settle();
    expect(h.services.refresh).toHaveBeenCalledTimes(1);

    await openBare(h);
    chooseScope(tree(h), "opencode-go");
    await settle();
    expect(h.services.refresh).toHaveBeenCalledTimes(1);
  });

  // A provider picked from the sidebar hands the ring to its models, so the arrows
  // move through them next; a locked provider's view puts it on the login button.
  it("puts the ring on the models after a provider pick, and on the login button in the locked view", async () => {
    const h = await hubHarness();
    await openBare(h);
    await settle();
    h.hub.focused("scopes");
    chooseScope(tree(h), "opencode-go");
    await settle();
    expect(h.engine.recorded.focus.at(-1)).toBe("models");
    expect(optionValues(tree(h), "models").sort()).toEqual(["row:opencode-go/glm-5.1", "row:opencode-go/kimi-k3.1-pro"]);

    h.hub.focused("scopes");
    chooseScope(tree(h), "xai");
    await settle();
    expect(h.engine.recorded.focus.at(-1)).toBe("login");
  });

  it("puts the ring on the search field when the search leaves no models to rest on", async () => {
    const h = await hubHarness();
    await openBare(h);
    await settle();
    keyed(tree(h), "search")?.props.onInput?.("zzzz");
    chooseScope(tree(h), "all");
    await settle();
    expect(keyed(tree(h), "models")).toBeUndefined();
    expect(h.engine.recorded.focus.at(-1)).toBe("search");
  });

  // A Select away from the ring draws only its selected option, so the hub draws the
  // rest as text until the Select takes the ring.
  it("lists the providers and the models as text until their Select takes the ring", async () => {
    const h = await hubHarness();
    await openBare(h);
    const shownText = (): string => textOf(nodesOf(tree(h), "Text"));
    expect(shownText()).toContain("OpenCode Go (2)");
    expect(shownText()).toContain("opencode-go/glm-5.1");
    h.hub.focused("scopes");
    expect(shownText()).not.toContain("OpenCode Go (2)");
    expect(shownText()).toContain("opencode-go/glm-5.1");
    h.hub.focused("models");
    expect(shownText()).toContain("OpenCode Go (2)");
    expect(shownText()).not.toContain("opencode-go/glm-5.1");
  });

  it("clears a non-empty search on Esc, and closes the hub once the search is empty", async () => {
    const h = await hubHarness();
    await openBare(h);
    keyed(tree(h), "search")?.props.onInput?.("kimi");
    expect(h.hub.refusesClose({ kind: "person" })).toBe(true);
    expect(keyed(tree(h), "search")?.props.value).toBe("");
    expect(h.hub.refusesClose({ kind: "person" })).toBe(false);
  });

  // Escape hands the keyboard to the prompt before the hub refuses the close, so the
  // letters typed next would land in the prompt unless the hub asks for the keys again.
  it("takes the keyboard back after Esc clears a search, with the ring on the search field", async () => {
    const h = await hubHarness({ columns: 91 });
    await openBare(h);
    keyed(tree(h), "search")?.props.onInput?.("glm");
    h.engine.dropKeys();
    expect(h.hub.refusesClose({ kind: "person" })).toBe(true);
    await settle();
    expect(h.engine.keyboard()).toBe(HUB_PANE_ID);
    expect(h.engine.recorded.focus.at(-1)).toBe("search");
    expect(h.engine.recorded.panes.every((pane) => pane.id === HUB_PANE_ID && pane.focus === true)).toBe(true);
    expect(h.engine.recorded.paneCloses).toEqual([]);
  });

  // Printable keys reach a pane only while an Input holds its ring, so a ring put back
  // on the models would send the letters typed after Esc to the prompt.
  it("puts the ring on the search field after Esc clears a search with the ring on the models", async () => {
    const h = await hubHarness({ columns: 91 });
    await openBare(h);
    keyed(tree(h), "search")?.props.onInput?.("kimi");
    h.hub.focused("models");
    h.engine.dropKeys();
    expect(h.hub.refusesClose({ kind: "person" })).toBe(true);
    await settle();
    expect(h.engine.keyboard()).toBe(HUB_PANE_ID);
    expect(h.engine.recorded.focus.at(-1)).toBe("search");
    expect(optionValues(tree(h), "models")).toContain("row:opencode-go/kimi-k3.1-pro");
  });

  it("switches to a routed pick through /model, after closing the hub", async () => {
    const h = await hubHarness();
    await openBare(h);
    chooseModel(tree(h), "opencode-go/kimi-k3.1-pro");
    await settle();
    expect(h.engine.recorded.paneCloses).toEqual([HUB_PANE_ID]);
    expect(h.engine.recorded.commands).toEqual([expect.objectContaining({ command: "model", args: "opencode-go/kimi-k3.1-pro" })]);

    await openBare(h);
    chooseModel(tree(h), "opus");
    await settle();
    expect(h.engine.recorded.commands.at(-1)).toEqual(expect.objectContaining({ command: "model", args: "opus" }));
  });

  it("refuses a pick the transcript does not fit, and keeps the hub open with a notice", async () => {
    const h = await hubHarness({ contextTokens: 200000 });
    await openBare(h);
    expect(textOf(tree(h))).toContain("context>128k");
    chooseModel(tree(h), "opencode-go/kimi-k3.1-pro");
    await settle();
    const notice = "Kept claude-sonnet-5-5: this conversation is larger than opencode-go/kimi-k3.1-pro's window.";
    expect(h.engine.recorded.toasts).toEqual([notice]);
    // The hub holds no toasts, and draws the notice itself while it stays open.
    expect(h.engine.recorded.heldToasts).toEqual([]);
    expect(textOf(tree(h))).toContain(notice);
    expect(h.engine.recorded.commands).toEqual([]);
    expect(h.engine.recorded.paneCloses).toEqual([]);
    expect(h.engine.recorded.compacts).toEqual([]);
    expect(optionValues(tree(h), "models")).toContain("row:opencode-go/kimi-k3.1-pro");
  });

  it("switches to a routed pick the transcript fits exactly, without compacting", async () => {
    const h = await hubHarness({ contextTokens: 128000 });
    await openBare(h);
    chooseModel(tree(h), "opencode-go/kimi-k3.1-pro");
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
    chooseModel(tree(h), "opus");
    await settle();
    expect(h.engine.recorded.toasts).toEqual([]);
    expect(h.engine.recorded.commands).toEqual([expect.objectContaining({ command: "model", args: "opus" })]);
  });

  it("clears the refusal notice when the search changes", async () => {
    const h = await hubHarness({ contextTokens: 200000 });
    await openBare(h);
    chooseModel(tree(h), "opencode-go/kimi-k3.1-pro");
    await settle();
    keyed(tree(h), "search")?.props.onInput?.("glm");
    expect(textOf(tree(h))).not.toContain("Kept claude-sonnet-5-5");
  });

  it("draws a locked provider's login in the hub's pane below 110 columns, and Esc cancels back to the hub", async () => {
    const h = await hubHarness({ columns: 91 });
    await openBare(h);
    chooseScope(tree(h), "xai");
    expect(textOf(tree(h))).toContain("xAI has no credentials.");
    expect(textOf(tree(h))).toContain("1 model in catalog:");
    h.engine.pressing(() => keyed(tree(h), "login")?.props.onPress?.());
    await settle();
    // No second pane, nothing closed and nothing left undrawn: the key step is in the hub.
    expect(h.engine.recorded.panes.every((pane) => pane.id === HUB_PANE_ID)).toBe(true);
    expect(h.engine.recorded.paneCloses).toEqual([]);
    expect(h.engine.recorded.ui.join("\n")).not.toContain("could not be shown");
    expect(textOf(tree(h))).toContain("xAI API key");
    expect(h.engine.keyboard()).toBe(HUB_PANE_ID);
    expect(h.engine.recorded.focus.at(-1)).toBe("secret");

    h.engine.dropKeys();
    expect(h.hub.refusesClose({ kind: "person" })).toBe(true);
    await settle();
    expect(h.engine.recorded.ui).toContain("Login cancelled.");
    expect(textOf(tree(h))).toContain("xAI has no credentials.");
    expect(h.engine.keyboard()).toBe(HUB_PANE_ID);
    expect(h.engine.recorded.focus.at(-1)).toBe("login");
    expect(h.engine.recorded.paneCloses).toEqual([]);
  });
});

import { describe, expect, it, vi } from "vitest";
import { HUB_PANE_ID } from "../../src/hub/hub-controller.ts";
import { handleModelCommand } from "../../src/hub/model-command.ts";
import { loginToProvider } from "../../src/login/login-command.ts";
import { drawnElements } from "../support/fake-engine.ts";
import { hubHarness, keyed, settle, textOf } from "../support/hub-harness.ts";

// A locked provider's login hands off to its flow, which is replaced here by a saved login.
vi.mock("../../src/login/login-command.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/login/login-command.ts")>();
  return { ...actual, loginToProvider: vi.fn(async () => ({ ok: true, text: "Logged in to xAI" })) };
});

describe("the hub's login hand-off", () => {
  it("reopens the hub on the provider after a successful login", async () => {
    const h = await hubHarness();
    await handleModelCommand(
      h.host,
      { command: "model", args: "", origin: { kind: "composer" }, presentation: { isFullscreen: false, columns: 200 } } as never,
      vi.fn(),
      h.hub,
    );
    keyed(h.hub.draw(drawnElements as never), "scope:xai")?.props.onPress?.();
    keyed(h.hub.draw(drawnElements as never), "login")?.props.onPress?.();
    await settle();

    expect(vi.mocked(loginToProvider)).toHaveBeenCalledWith(h.host, "xai", h.services);
    expect(h.engine.recorded.ui).toContain("Logged in to xAI");
    expect(h.engine.recorded.panes.filter((pane) => pane.id === HUB_PANE_ID)).toHaveLength(2);
    expect(textOf(h.hub.draw(drawnElements as never))).toContain("xAI");
  });
});

import { describe, expect, it, vi } from "vitest";
import { HUB_PANE_ID } from "../../src/hub/hub-controller.ts";
import { handleModelCommand } from "../../src/hub/model-command.ts";
import { loginToProvider } from "../../src/login/login-command.ts";
import { drawnElements } from "../support/fake-engine.ts";
import { chooseScope, hubHarness, keyed, settle, textOf } from "../support/hub-harness.ts";

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
    chooseScope(h.hub.draw(drawnElements as never), "xai");
    // The faked login saves a credential, so the provider is no longer locked.
    vi.mocked(loginToProvider).mockImplementationOnce(async () => {
      (h.services.credentials as { list: unknown }).list = async () => [{ account: "default" }];
      return { ok: true, text: "Logged in to xAI" };
    });
    keyed(h.hub.draw(drawnElements as never), "login")?.props.onPress?.();
    await settle();

    expect(vi.mocked(loginToProvider)).toHaveBeenCalledWith(
      h.host,
      "xai",
      expect.objectContaining({ catalog: h.services.catalog, credentials: h.services.credentials }),
    );
    expect(h.engine.recorded.ui).toContain("Logged in to xAI");
    // The login ran in the hub's own pane: the hub was never closed or opened anew.
    expect(h.engine.recorded.paneCloses).toEqual([]);
    expect(h.engine.recorded.panes.every((pane) => pane.id === HUB_PANE_ID)).toBe(true);
    const drawn = h.hub.draw(drawnElements as never);
    expect(textOf(drawn)).not.toContain("has no credentials");
    expect(keyed(drawn, "scopes")?.props.value).toBe("xai");
    expect(keyed(drawn, "search")).toBeDefined();
  });
});

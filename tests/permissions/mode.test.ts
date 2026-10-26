import { describe, expect, it } from "vitest";
import { CONFIG_KEY, createModeReader, effectiveMode } from "../../src/permissions/mode.ts";
import { fakeEngine, type FakeOptions } from "../support/fake-engine.ts";
import { assertNoSentinel, makeSentinel } from "../support/sentinel.ts";

const HANDLE = { handle: "handle-value", kind: "bearer" as const };

// A reader over a fake engine, with the plugin's own option values it is given.
function readerOver(options: Partial<FakeOptions>, pluginOptions: Record<string, unknown> = {}) {
  const engine = fakeEngine({ platform: "linux", ...options });
  const reader = createModeReader(pluginOptions);
  return { engine, read: () => reader(engine) };
}

// AC4: unset, the effective mode follows the first-party login; a set row value always wins.
describe("the effective mode", () => {
  it.each<[string | undefined, boolean, string]>([
    [undefined, true, "claude-classifier"],
    [undefined, false, "server-classifier-off"],
    ["claude-classifier", false, "claude-classifier"],
    ["server-classifier-off", true, "server-classifier-off"],
    ["not-a-mode", true, "claude-classifier"],
    ["not-a-mode", false, "server-classifier-off"],
  ])("with row %s and login %s is %s", (row, hasLogin, expected) => {
    expect(effectiveMode(row, hasLogin)).toBe(expected);
  });
});

describe("reading the mode for a session", () => {
  it("is claude-classifier with a first-party login, and server-classifier-off without one", async () => {
    expect(await readerOver({ authorize: HANDLE }).read()).toBe("claude-classifier");
    expect(await readerOver({ authorize: null }).read()).toBe("server-classifier-off");
  });

  it("lets a set row win over the login, either way", async () => {
    const withLogin = readerOver({ authorize: HANDLE, config: [{ key: CONFIG_KEY, value: "server-classifier-off" }] });
    const withoutLogin = readerOver({ authorize: null, config: [{ key: CONFIG_KEY, value: "claude-classifier" }] });

    expect(await withLogin.read()).toBe("server-classifier-off");
    expect(await withoutLogin.read()).toBe("claude-classifier");
  });

  it("falls back to the plugin's own option when the config row gives no mode", async () => {
    const reader = readerOver({ authorize: null }, { routedAutoPermissions: "claude-classifier" });

    expect(await reader.read()).toBe("claude-classifier");
  });

  it("reads the login once per session, and not at all when a set row decides", async () => {
    const unset = readerOver({ authorize: HANDLE });
    await unset.read();
    await unset.read();
    expect(unset.engine.recorded.authorizes).toBe(1);

    const set = readerOver({ authorize: HANDLE, config: [{ key: CONFIG_KEY, value: "server-classifier-off" }] });
    await set.read();
    expect(set.engine.recorded.authorizes).toBe(0);
  });

  it("never stores, logs, sends or passes the login handle", async () => {
    const sentinel = makeSentinel();
    const { engine, read } = readerOver({ authorize: { handle: sentinel, kind: "bearer" } });

    await read();

    assertNoSentinel(engine, sentinel, [JSON.stringify(engine.recorded.debug), JSON.stringify(engine.recorded.classifications)]);
    expect(engine.recorded.authorizes).toBe(1);
  });
});

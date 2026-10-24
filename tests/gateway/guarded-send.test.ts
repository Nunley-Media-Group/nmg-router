import { describe, expect, it, vi } from "vitest";
import { guardedSend } from "../../src/gateway/guarded-send.ts";
import { fakeEngine } from "../support/fake-engine.ts";

describe("guardedSend", () => {
  it("refuses a Claude relay request before the transport is called", async () => {
    const engine = fakeEngine();
    const transport = vi.fn(async () => ({ model: "clinepass/claude-sonnet-5-5", content: "answer" }));
    await expect(
      guardedSend(transport, { provider: "clinepass", model: "clinepass/claude-sonnet-5-5" }),
    ).rejects.toThrow("clinepass/claude-sonnet-5-5");
    expect(transport).not.toHaveBeenCalled();
    expect(engine.calls).toHaveLength(0);
    expect(engine.httpCalls).toHaveLength(0);
  });

  it("rejects a spike-style fallback response, returns no content, and calls the transport once", async () => {
    const transport = vi.fn(async () => ({ model: "anthropic/claude-opus-5-5", content: "answer" }));
    const send = guardedSend(transport, { provider: "opencode-go", model: "opencode-go/kimi-k3.1-pro" });
    await expect(send).rejects.toThrow("opencode-go/kimi-k3.1-pro");
    await expect(send).rejects.toThrow("anthropic/claude-opus-5-5");
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("returns the content of an accepted response from one transport call", async () => {
    const transport = vi.fn(async () => ({ model: "kimi-k3.1-pro", content: "answer" }));
    await expect(
      guardedSend(transport, { provider: "opencode-go", model: "opencode-go/kimi-k3.1-pro" }),
    ).resolves.toBe("answer");
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("never retries when the transport fails", async () => {
    const transport = vi.fn(async () => {
      throw new Error("connection reset");
    });
    await expect(guardedSend(transport, { provider: "opencode-go", model: "opencode-go/kimi-k3.1-pro" })).rejects.toThrow(
      "connection reset",
    );
    expect(transport).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it, vi } from "vitest";
import { AnthropicRequestRefused, AnthropicResponseRejected } from "../../src/errors/errors.ts";
import { guardedSend } from "../../src/gateway/guarded-send.ts";
import { fakeEngine } from "../support/fake-engine.ts";

const kimi = { provider: "opencode-go", model: "opencode-go/kimi-k3.1-pro", baseUrl: "https://relay.example.com/v1" };

describe("guardedSend", () => {
  it("refuses an Anthropic request before the transport, $.http or $.process runs", async () => {
    const engine = fakeEngine({ platform: "linux" });
    const transport = vi.fn(async () => ({ model: "clinepass/claude-sonnet-5-5", content: "answer" }));

    for (const request of [
      { provider: "anthropic", model: "anthropic/claude-opus-5-5" },
      { provider: "clinepass", model: "clinepass/claude-sonnet-5-5" },
    ]) {
      await expect(guardedSend(transport, request)).rejects.toThrow(AnthropicRequestRefused);
    }
    await expect(guardedSend(transport, { provider: "anthropic", model: "anthropic/claude-opus-5-5" })).rejects.toThrow(
      "anthropic/claude-opus-5-5",
    );

    expect(transport).not.toHaveBeenCalled();
    expect(engine.recorded.http).toEqual([]);
    expect(engine.recorded.processes).toEqual([]);
  });

  it("returns the content of a clean response from the requested model", async () => {
    const transport = vi.fn(async () => ({ model: "kimi-k3.1-pro", content: "hello" }));

    await expect(guardedSend(transport, kimi)).resolves.toBe("hello");
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("rejects a spike fallback: a kimi request answered by an Anthropic model", async () => {
    const transport = vi.fn(async () => ({ model: "anthropic/claude-opus-5-5", content: "leaked answer" }));

    const outcome = guardedSend(transport, kimi);
    await expect(outcome).rejects.toThrow(AnthropicResponseRejected);
    await expect(outcome).rejects.toThrow("opencode-go/kimi-k3.1-pro");
    await expect(outcome).rejects.toThrow("anthropic/claude-opus-5-5");
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("never retries a transport that fails", async () => {
    const transport = vi.fn(async () => {
      throw new Error("connection reset");
    });

    await expect(guardedSend(transport, kimi)).rejects.toThrow("connection reset");
    expect(transport).toHaveBeenCalledTimes(1);
  });
});

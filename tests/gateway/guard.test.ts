import { describe, expect, it } from "vitest";
import { isAnthropicHost, isAnthropicModel, isAnthropicProvider } from "../../src/gateway/anthropic.ts";
import { checkRequest, checkResponse } from "../../src/gateway/guard.ts";
import { AnthropicRequestRefused, AnthropicResponseRejected } from "../../src/errors/errors.ts";

describe("Anthropic request guard", () => {
  it.each([
    ["the anthropic provider", { provider: "anthropic", model: "claude-sonnet-5-5" }],
    ["an Anthropic host base URL", { provider: "relay", model: "relay/kimi-k3.1-pro", baseUrl: "https://api.anthropic.com" }],
    ["an anthropic/* model", { provider: "opencode-go", model: "anthropic/claude-opus-5-5" }],
    ["a relayed Claude model", { provider: "clinepass", model: "clinepass/claude-sonnet-5-5" }],
  ])("refuses %s with an error naming the model", (_label, request) => {
    expect(() => checkRequest(request)).toThrow(AnthropicRequestRefused);
    expect(() => checkRequest(request)).toThrow(request.model);
  });

  it("passes a non-Anthropic model on a non-Anthropic host", () => {
    expect(() =>
      checkRequest({ provider: "opencode-go", model: "opencode-go/kimi-k3.1-pro", baseUrl: "https://relay.example.test" }),
    ).not.toThrow();
  });
});

describe("Anthropic response guard", () => {
  it("rejects an Anthropic response model, naming both models", () => {
    const error = (() => {
      try {
        checkResponse("opencode-go/kimi-k3.1-pro", { model: "anthropic/claude-opus-5-5" });
      } catch (caught) {
        return caught;
      }
      return undefined;
    })();
    expect(error).toBeInstanceOf(AnthropicResponseRejected);
    expect((error as AnthropicResponseRejected).requested).toBe("opencode-go/kimi-k3.1-pro");
    expect((error as AnthropicResponseRejected).returned).toBe("anthropic/claude-opus-5-5");
  });

  it("rejects a response that names no model", () => {
    expect(() => checkResponse("opencode-go/kimi-k3.1-pro", {})).toThrow(AnthropicResponseRejected);
  });

  it("accepts a non-Anthropic response model", () => {
    expect(() => checkResponse("opencode-go/kimi-k3.1-pro", { model: "kimi-k3.1-pro" })).not.toThrow();
  });
});

describe("Anthropic detection", () => {
  it.each(["anthropic/claude-opus-5-5", "clinepass/claude-sonnet-5-5", "opus-5", "Fable_5", "sonnet.5"])(
    "treats %s as an Anthropic model",
    (id) => expect(isAnthropicModel(id)).toBe(true),
  );

  it.each(["opencode-go/kimi-k3.1-pro", "openai/gpt-5"])("does not treat %s as an Anthropic model", (id) =>
    expect(isAnthropicModel(id)).toBe(false),
  );

  it.each([
    ["https://api.anthropic.com", true],
    ["https://claude.ai/chat", true],
    ["https://www.claude.com", true],
    ["https://anthropic.com.evil.test", false],
    ["https://relay.example.test", false],
    ["not a url", true],
  ])("isAnthropicHost(%s) is %s", (url, expected) => expect(isAnthropicHost(url)).toBe(expected));

  it("recognises the anthropic provider id in any case", () => {
    expect(isAnthropicProvider("Anthropic")).toBe(true);
    expect(isAnthropicProvider("opencode-go")).toBe(false);
  });
});

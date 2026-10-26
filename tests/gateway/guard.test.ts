import { describe, expect, it } from "vitest";
import { AnthropicRequestRefused, AnthropicResponseRejected } from "../../src/errors/errors.ts";
import { isAnthropicHost, isAnthropicModel, isAnthropicProvider } from "../../src/gateway/anthropic.ts";
import { checkRequest, checkResponse } from "../../src/gateway/guard.ts";

describe("checkRequest", () => {
  it.each([
    ["the provider is anthropic", { provider: "anthropic", model: "anthropic/claude-opus-5-5" }],
    [
      "the base URL is the Anthropic API",
      { provider: "relay", model: "relay/kimi-k3.1-pro", baseUrl: "https://api.anthropic.com" },
    ],
    ["a relay serves a Claude model", { provider: "clinepass", model: "clinepass/claude-sonnet-5-5" }],
  ])("refuses when %s, and names the model", (_label, request) => {
    expect(() => checkRequest(request)).toThrow(AnthropicRequestRefused);
    expect(() => checkRequest(request)).toThrow(request.model);
  });

  it("passes a non-Anthropic model on a non-Anthropic provider", () => {
    expect(() =>
      checkRequest({
        provider: "opencode-go",
        model: "opencode-go/kimi-k3.1-pro",
        baseUrl: "https://relay.example.com/v1",
      }),
    ).not.toThrow();
  });
});

describe("checkResponse", () => {
  it("rejects an Anthropic response and names both models", () => {
    const check = () => checkResponse("opencode-go/kimi-k3.1-pro", { model: "anthropic/claude-opus-5-5" });
    expect(check).toThrow(AnthropicResponseRejected);
    expect(check).toThrow("opencode-go/kimi-k3.1-pro");
    expect(check).toThrow("anthropic/claude-opus-5-5");
  });

  it("rejects a response that names no model", () => {
    expect(() => checkResponse("opencode-go/kimi-k3.1-pro", {})).toThrow(AnthropicResponseRejected);
    expect(() => checkResponse("opencode-go/kimi-k3.1-pro", { model: "  " })).toThrow(AnthropicResponseRejected);
  });

  it("passes a response from the requested non-Anthropic model", () => {
    expect(() => checkResponse("opencode-go/kimi-k3.1-pro", { model: "kimi-k3.1-pro" })).not.toThrow();
  });
});

describe("isAnthropicModel", () => {
  it.each([
    "anthropic/claude-opus-5-5",
    "clinepass/claude-sonnet-5-5",
    "claude-haiku-4",
    "relay/opus-5-5",
    "relay/Sonnet_5",
    "relay/fable.5",
  ])("treats %s as Anthropic", (id) => {
    expect(isAnthropicModel(id)).toBe(true);
  });

  it.each(["opencode-go/kimi-k3.1-pro", "relay/deepseek-v3", "relay/gpt-5", "relay/mistral-large"])(
    "treats %s as not Anthropic",
    (id) => {
      expect(isAnthropicModel(id)).toBe(false);
    },
  );
});

describe("isAnthropicHost", () => {
  it.each([
    "https://anthropic.com",
    "https://api.anthropic.com/v1",
    "https://claude.ai",
    "https://console.claude.com",
    "https://api.claude.com/v1",
    "not a url",
    "",
  ])("treats %s as an Anthropic host, failing closed", (url) => {
    expect(isAnthropicHost(url)).toBe(true);
  });

  it.each(["https://opencode.ai/zen/v1", "https://notanthropic.com", "https://anthropic.com.example.org"])(
    "treats %s as not an Anthropic host",
    (url) => {
      expect(isAnthropicHost(url)).toBe(false);
    },
  );
});

describe("isAnthropicProvider", () => {
  it("matches the anthropic id regardless of case or spacing", () => {
    expect(isAnthropicProvider("anthropic")).toBe(true);
    expect(isAnthropicProvider(" Anthropic ")).toBe(true);
    expect(isAnthropicProvider("opencode-go")).toBe(false);
  });
});

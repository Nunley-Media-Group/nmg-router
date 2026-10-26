import { describe, expect, it } from "vitest";
import { ProviderRejected } from "../../src/errors/errors.ts";
import { createProviderRegistry } from "../../src/providers/registry.ts";

describe("provider registry", () => {
  it("rejects the anthropic id and never lists it", () => {
    const registry = createProviderRegistry();

    expect(() => registry.register({ id: "anthropic" })).toThrow(ProviderRejected);
    expect(registry.list()).toEqual([]);
    expect(registry.get("anthropic")).toBeUndefined();
  });

  it.each([
    "https://api.anthropic.com",
    "https://claude.ai",
    "https://console.claude.com",
    "https://api.claude.com/v1",
  ])("rejects a relay whose base URL is an Anthropic host: %s", (baseUrl) => {
    const registry = createProviderRegistry();

    expect(() => registry.register({ id: "relay", baseUrl })).toThrow(ProviderRejected);
    expect(registry.list()).toEqual([]);
    expect(registry.get("relay")).toBeUndefined();
  });

  it("lists and returns a provider on a non-Anthropic host", () => {
    const registry = createProviderRegistry();
    const provider = { id: "opencode-go", baseUrl: "https://relay.example.com/v1" };

    registry.register(provider);

    expect(registry.list()).toEqual([provider]);
    expect(registry.get("opencode-go")).toEqual(provider);
  });
});

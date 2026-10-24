import { describe, expect, it } from "vitest";
import { ProviderRejected } from "../../src/errors/errors.ts";
import { createProviderRegistry } from "../../src/providers/registry.ts";

describe("provider registry", () => {
  it("rejects the anthropic id and never lists it", () => {
    const registry = createProviderRegistry();
    expect(() => registry.register({ id: "anthropic" })).toThrow(ProviderRejected);
    expect(registry.get("anthropic")).toBeUndefined();
    expect(registry.list()).toEqual([]);
  });

  it.each([
    "https://api.anthropic.com",
    "https://claude.ai",
    "https://console.claude.com/v1",
  ])("rejects a provider whose base URL %s is on an Anthropic host", (baseUrl) => {
    const registry = createProviderRegistry();
    expect(() => registry.register({ id: "relay", baseUrl })).toThrow(ProviderRejected);
    expect(registry.list()).toEqual([]);
  });

  it("registers and lists a non-Anthropic provider", () => {
    const registry = createProviderRegistry();
    registry.register({ id: "opencode-go", baseUrl: "https://relay.example.test" });
    expect(registry.get("opencode-go")).toEqual({ id: "opencode-go", baseUrl: "https://relay.example.test" });
    expect(registry.list().map((provider) => provider.id)).toEqual(["opencode-go"]);
  });
});

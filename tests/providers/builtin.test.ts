import { describe, expect, it } from "vitest";
import { isAnthropicHost, isAnthropicProvider } from "../../src/gateway/anthropic.ts";
import { BUILTIN_PROVIDERS } from "../../src/providers/builtin/index.ts";
import { openCodeWire } from "../../src/providers/builtin/opencode-go.ts";
import { BUNDLED_METADATA } from "../../src/providers/metadata.ts";
import { harness } from "../support/login-harness.ts";

describe("built-in providers (AC1)", () => {
  it("lists opencode-go, cline-pass, openai-codex and xai in that order, none of them Anthropic", async () => {
    const { services } = harness({ platform: "linux" });
    await services.catalog.load();

    const providers = services.catalog.providers();
    expect(providers.map((provider) => provider.identity.id)).toEqual(["opencode-go", "cline-pass", "openai-codex", "xai"]);
    for (const provider of providers) {
      expect(isAnthropicProvider(provider.identity.id)).toBe(false);
      expect(isAnthropicHost(provider.identity.baseUrl)).toBe(false);
      expect(["api-key", "oauth-code"]).toContain(provider.login.kind);
      expect(provider.wire("some-model").baseUrl).toMatch(/^https:\/\//);
    }
  });

  it("gives each built-in its name, base URL and login kind", () => {
    expect(BUILTIN_PROVIDERS.map((provider) => [provider.identity.name, provider.identity.baseUrl, provider.login.kind])).toEqual([
      ["OpenCode Go", "https://opencode.ai/inference/go", "api-key"],
      ["ClinePass", "https://api.cline.bot/api/v1", "api-key"],
      ["OpenAI Codex", "https://chatgpt.com/backend-api", "oauth-code"],
      ["xAI", "https://api.x.ai/v1", "api-key"],
    ]);
  });
});

describe("OpenCode Go wire resolution", () => {
  it("takes a per-id override first", () => {
    expect(openCodeWire("deepseek-v4-flash")).toEqual({ wire: "openai-responses", baseUrl: "https://opencode.ai/inference/go/v1" });
    expect(openCodeWire("minimax-m2.7").wire).toBe("openai-completions");
  });

  it("takes the bundled metadata wire before the prefix", () => {
    expect(openCodeWire("kimi-k3", "openai-completions").wire).toBe("openai-completions");
    expect(openCodeWire("minimax-m2.5", "anthropic-messages")).toEqual({
      wire: "anthropic-messages",
      baseUrl: "https://opencode.ai/inference/go",
    });
  });

  it("falls back to the prefix, then to openai-completions", () => {
    expect(openCodeWire("gpt-5.5").wire).toBe("openai-responses");
    expect(openCodeWire("grok-4.5").wire).toBe("openai-responses");
    expect(openCodeWire("minimax-m2.5").wire).toBe("anthropic-messages");
    expect(openCodeWire("qwen3.7-max").wire).toBe("anthropic-messages");
    expect(openCodeWire("glm-5.1")).toEqual({ wire: "openai-completions", baseUrl: "https://opencode.ai/inference/go/v1" });
  });

  it("keeps a per-id lookup from matching a prototype property", () => {
    expect(openCodeWire("constructor").wire).toBe("openai-completions");
  });
});

describe("bundled metadata", () => {
  it("covers a current model for each built-in except ClinePass", () => {
    const providers = Object.keys(BUNDLED_METADATA).map((id) => id.split("/")[0]);
    expect(new Set(providers)).toEqual(new Set(["opencode-go", "openai-codex", "xai"]));
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { clinePass } from "../../src/providers/builtin/cline-pass.ts";
import { openaiCodex, parseCodexUsage, parseCodexUsageHeaders } from "../../src/providers/builtin/openai-codex.ts";
import { openCodeGo, parseOpenCodeGoUsage } from "../../src/providers/builtin/opencode-go.ts";
import { xai } from "../../src/providers/builtin/xai.ts";
import { fakeEngine } from "../support/fake-engine.ts";

const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const OPENCODE_USAGE_URL = "https://opencode.ai/zen/go/v1/usage";

function fixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(import.meta.dirname, "..", "fixtures", name), "utf8")) as Record<string, unknown>;
}

describe("OpenAI Codex usage", () => {
  it("maps the recorded usage body to its primary and secondary windows, labelled by length", () => {
    expect(parseCodexUsage(fixture("codex-usage.json"))).toEqual({
      windows: [
        { id: "primary", label: "5h", usedPercent: 23, resetsAt: 1798000000000 },
        { id: "secondary", label: "7d", usedPercent: 41, resetsAt: 1798500000000 },
      ],
    });
  });

  it("answers undefined for a body with no rate-limit windows", () => {
    expect(parseCodexUsage({})).toBeUndefined();
    expect(parseCodexUsage({ rate_limit: { primary_window: { used_percent: "23" } } })).toBeUndefined();
  });

  it("maps the x-codex headers to 5h and 7d windows", () => {
    expect(
      parseCodexUsageHeaders({
        "x-codex-primary-used-percent": "23",
        "x-codex-primary-window-minutes": "300",
        "x-codex-primary-reset-at": "1798000000",
        "x-codex-secondary-used-percent": "41",
        "x-codex-secondary-window-minutes": "10080",
        "x-codex-secondary-reset-at": "1798500000",
      }),
    ).toEqual({
      windows: [
        { id: "primary", label: "5h", usedPercent: 23, resetsAt: 1798000000000 },
        { id: "secondary", label: "7d", usedPercent: 41, resetsAt: 1798500000000 },
      ],
    });
  });

  it("answers undefined when the response carries no x-codex headers", () => {
    expect(parseCodexUsageHeaders({ "content-type": "text/event-stream" })).toBeUndefined();
  });

  it("reads the usage endpoint with the account id and the bearer token, and nothing else", async () => {
    const engine = fakeEngine({ platform: "linux", http: () => ({ status: 200, body: fixture("codex-usage.json") }) });
    const outcome = await openaiCodex.usage?.read({ http: engine.http } as never, {
      platform: "linux",
      auth: { token: "sentinel-token", accountId: "acct-test" },
    });

    expect(outcome?.kind).toBe("ok");
    expect(engine.recorded.http).toHaveLength(1);
    expect(engine.recorded.http[0]).toMatchObject({
      url: CODEX_USAGE_URL,
      method: "GET",
      headers: { authorization: "Bearer sentinel-token", "chatgpt-account-id": "acct-test" },
    });
  });
});

describe("OpenCode Go usage", () => {
  it("maps the recorded usage body to its rolling, weekly and monthly windows, in that order", () => {
    expect(parseOpenCodeGoUsage(fixture("opencode-go-usage.json"))).toEqual({
      windows: [
        { id: "rolling", label: "5h", usedPercent: 12, resetsAt: Date.parse("2026-12-23T04:00:00Z") },
        { id: "weekly", label: "weekly", usedPercent: 41, resetsAt: Date.parse("2027-01-01T00:00:00Z") },
        { id: "monthly", label: "monthly", usedPercent: 7, resetsAt: Date.parse("2027-01-22T00:00:00Z") },
      ],
    });
  });

  it("answers undefined when any of the three windows is missing or mis-shaped", () => {
    const body = fixture("opencode-go-usage.json") as { usage: Record<string, unknown> };
    const { monthly: _monthly, ...withoutMonthly } = body.usage;
    expect(parseOpenCodeGoUsage({ usage: withoutMonthly })).toBeUndefined();
    expect(parseOpenCodeGoUsage({ usage: { ...body.usage, weekly: { percent: 140, resetsAt: "2027-01-01T00:00:00Z" } } })).toBeUndefined();
  });

  it("reads a body missing monthly as malformed, against a faked HTTP host", async () => {
    const body = fixture("opencode-go-usage.json") as { usage: Record<string, unknown> };
    const { monthly: _monthly, ...withoutMonthly } = body.usage;
    const engine = fakeEngine({ platform: "linux", http: () => ({ status: 200, body: { usage: withoutMonthly } }) });

    const outcome = await openCodeGo.usage?.read({ http: engine.http } as never, {
      platform: "linux",
      auth: { token: "sentinel-token" },
    });

    expect(outcome).toEqual({ kind: "malformed" });
  });

  it("sends the stored key as a bearer token only to its own usage endpoint", async () => {
    const engine = fakeEngine({ platform: "linux", http: () => ({ status: 200, body: fixture("opencode-go-usage.json") }) });

    await openCodeGo.usage?.read({ http: engine.http } as never, { platform: "linux", auth: { token: "sentinel-token" } });

    expect(engine.recorded.http.map((request) => request.url)).toEqual([OPENCODE_USAGE_URL]);
    expect(engine.recorded.http[0]?.headers.authorization).toBe("Bearer sentinel-token");
  });
});

describe("providers without a usage source", () => {
  it("gives xAI and ClinePass no usage source", () => {
    expect(xai.usage).toBeUndefined();
    expect(clinePass.usage).toBeUndefined();
  });
});

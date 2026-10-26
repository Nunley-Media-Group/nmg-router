import { describe, expect, it } from "vitest";
import { classify, retryAfterSeconds, refusedError } from "../../src/errors/routed-errors.ts";
import { makeSentinel } from "../support/sentinel.ts";

const NOW = Date.parse("2026-10-26T12:00:00Z");

describe("classifying a failed HTTP status", () => {
  it("maps 401 and 403 to a sign-in prompt that names the status", () => {
    const error = classify("OpenCode Go", { kind: "http", status: 401, headers: {}, body: "" }, NOW);
    expect(error.kind).toBe("unauthenticated");
    expect(error.message).toBe("OpenCode Go rejected the login (HTTP 401). Run /login.");
  });

  it("reads a 429's wait from retry-after and names it", () => {
    const error = classify("OpenCode Go", { kind: "http", status: 429, headers: { "retry-after": "12" }, body: "" }, NOW);
    expect(error.kind).toBe("rate_limited");
    expect(error.retryAfterSeconds).toBe(12);
    expect(error.message).toBe("OpenCode Go rate limit reached. Retry after 12 s.");
  });

  it("leaves the wait clause out when no retry header is present", () => {
    const error = classify("OpenCode Go", { kind: "http", status: 429, headers: {}, body: "" }, NOW);
    expect(error.message).toBe("OpenCode Go rate limit reached.");
  });

  it("classifies a 429 whose body names a quota code as quota exhausted, without its text", () => {
    const body = JSON.stringify({ error: { code: "insufficient_quota", message: "secret detail" } });
    const error = classify("OpenAI Codex", { kind: "http", status: 429, headers: { "retry-after": "5" }, body }, NOW);
    expect(error.kind).toBe("quota_exhausted");
    expect(error.message).toBe("OpenAI Codex quota is used up.");
    expect(error.message).not.toContain("secret detail");
  });

  it("maps 402 to quota exhausted, 5xx to a server error, and any other 4xx to a refusal", () => {
    expect(classify("P", { kind: "http", status: 402, headers: {}, body: "" }, NOW).message).toBe("P quota is used up.");
    expect(classify("P", { kind: "http", status: 503, headers: {}, body: "" }, NOW).message).toBe("P server error (HTTP 503).");
    expect(classify("P", { kind: "http", status: 404, headers: {}, body: "" }, NOW).message).toBe("P refused the request (HTTP 404).");
  });

  it("never carries the body, a header value or a credential into a message", () => {
    const sentinel = makeSentinel();
    const body = `{"error":"${sentinel}"}`;
    const headers = { "x-debug": sentinel };
    for (const status of [401, 402, 404, 429, 500]) {
      const error = classify("P", { kind: "http", status, headers, body }, NOW);
      expect(error.message).not.toContain(sentinel);
    }
  });
});

describe("retry-after headers", () => {
  it("reads the four headers in order, and an HTTP date against now", () => {
    expect(retryAfterSeconds({ "retry-after-ms": "2500" }, NOW)).toBe(3);
    expect(retryAfterSeconds({ "retry-after": "7" }, NOW)).toBe(7);
    expect(retryAfterSeconds({ "retry-after": "Mon, 26 Oct 2026 12:00:30 GMT" }, NOW)).toBe(30);
    expect(retryAfterSeconds({ "x-ratelimit-reset-ms": "4000" }, NOW)).toBe(4);
    expect(retryAfterSeconds({ "x-ratelimit-reset": String(Math.floor(NOW / 1000) + 9) }, NOW)).toBe(9);
    expect(retryAfterSeconds({}, NOW)).toBeUndefined();
  });
});

describe("other failures", () => {
  it("names a missing login and a network failure", () => {
    expect(classify("OpenCode Go", { kind: "named", error: "not_logged_in" }).message).toBe("Not logged in to OpenCode Go. Run /login.");
    expect(classify("OpenCode Go", { kind: "named", error: "network" }).message).toBe("Could not reach OpenCode Go.");
  });

  it("maps a stream error event to its kind", () => {
    expect(classify("P", { kind: "stream", error: "malformed" }).message).toBe("P sent a response nmg-router could not read.");
    expect(classify("P", { kind: "stream", error: "rate_limited", retryAfterSeconds: 3 }).message).toBe("P rate limit reached. Retry after 3 s.");
  });

  it("passes a guard refusal's own message through", () => {
    const refusal = new Error('Refused a routed request for "x": it names an Anthropic model.');
    const error = refusedError(refusal);
    expect(error.kind).toBe("refused");
    expect(error.message).toBe(refusal.message);
  });
});

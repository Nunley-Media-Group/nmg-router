import { describe, expect, it } from "vitest";
import { getJson, postForm, checkStatus, requestHeaders } from "../../src/providers/http.ts";
import { parseOpenAiModelList, toDiscovery, openAiModelsList } from "../../src/models/openai-models-list.ts";
import { createProviderRegistry } from "../../src/providers/registry.ts";
import { ProviderRejected } from "../../src/errors/errors.ts";
import { openCodeGo } from "../../src/providers/builtin/opencode-go.ts";
import { fakeEngine } from "../support/fake-engine.ts";

describe("HTTP outcomes (T002)", () => {
  it("maps a 2xx JSON body to ok and a non-2xx to its status, never with the body", async () => {
    const engine = fakeEngine({ platform: "linux", http: (request) => (request.url.endsWith("/ok") ? { status: 200, body: { x: 1 } } : { status: 503, body: { secret: "x" } }) });
    expect(await getJson(engine, "https://h.example/ok", {})).toEqual({ kind: "ok", body: { x: 1 } });
    expect(await getJson(engine, "https://h.example/bad", {})).toEqual({ kind: "status", status: 503 });
  });

  it("maps a rejected fetch to offline and an unparsable body to malformed", async () => {
    const engine = fakeEngine({ platform: "linux", http: () => ({ status: 200, text: "<html>" }) });
    expect(await getJson(engine, "https://h.example/none", {})).toEqual({ kind: "malformed" });
    const unreachable = fakeEngine({ platform: "linux" });
    expect(await getJson(unreachable, "https://h.example/none", {})).toEqual({ kind: "offline" });
  });

  it("posts a form and reports the content type and fields", async () => {
    const engine = fakeEngine({ platform: "linux", http: () => ({ status: 200, body: {} }) });
    await postForm(engine, "https://auth.example/token", { grant_type: "refresh_token", refresh_token: "r" });
    const [request] = engine.recorded.http;
    expect(request?.method).toBe("POST");
    expect(request?.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(new URLSearchParams(request?.body ?? "").get("grant_type")).toBe("refresh_token");
  });

  it("answers a key check from the status alone", async () => {
    const engine = fakeEngine({ platform: "linux", http: () => ({ status: 204 }) });
    expect(await checkStatus(engine, "https://h.example/models", {})).toEqual({ kind: "ok" });
  });

  it("adds the bearer token only when there is one", () => {
    expect(requestHeaders({ "User-Agent": "nmg-router" }, undefined)).toEqual({
      accept: "application/json",
      "User-Agent": "nmg-router",
    });
    expect(requestHeaders(undefined, "t")).toMatchObject({ authorization: "Bearer t" });
  });
});

describe("OpenAI model list parser (T002)", () => {
  it.each([
    ["a data array", { data: [{ id: "a" }] }],
    ["a models array", { models: [{ id: "a" }] }],
    ["a result array", { result: [{ id: "a" }] }],
    ["an items array", { items: [{ id: "a" }] }],
    ["a bare array", [{ id: "a" }]],
  ])("reads %s", (_label, body) => {
    expect(parseOpenAiModelList(body)?.map((model) => model.id)).toEqual(["a"]);
  });

  it("reads the limits and skips entries without an id", () => {
    const models = parseOpenAiModelList({
      data: [{ id: "m", context_length: 100, max_completion_tokens: 20 }, { name: "no-id" }, { id: "  " }],
    });
    expect(models).toEqual([{ id: "m", contextWindow: 100, maxOutput: 20 }]);
    expect(parseOpenAiModelList({ data: [{ id: "m", context_window: 50 }] })?.[0]?.contextWindow).toBe(50);
  });

  it("returns undefined when no list is present", () => {
    expect(parseOpenAiModelList({ error: "nope" })).toBeUndefined();
    expect(parseOpenAiModelList("text")).toBeUndefined();
  });

  it("maps outcomes to unauthenticated, unavailable, empty and offline", () => {
    expect(toDiscovery({ kind: "status", status: 401 }, parseOpenAiModelList)).toEqual({ kind: "unauthenticated" });
    expect(toDiscovery({ kind: "status", status: 403 }, parseOpenAiModelList)).toEqual({ kind: "unauthenticated" });
    expect(toDiscovery({ kind: "status", status: 500 }, parseOpenAiModelList)).toEqual({ kind: "unavailable" });
    expect(toDiscovery({ kind: "malformed" }, parseOpenAiModelList)).toEqual({ kind: "unavailable" });
    expect(toDiscovery({ kind: "ok", body: { data: [] } }, parseOpenAiModelList)).toEqual({ kind: "empty" });
    expect(toDiscovery({ kind: "offline" }, parseOpenAiModelList)).toEqual({ kind: "offline" });
  });

  it("builds a model source over a url and its headers", async () => {
    const engine = fakeEngine({ platform: "linux", http: () => ({ status: 200, body: { data: [{ id: "x" }] } }) });
    const source = openAiModelsList({ url: "https://h.example/models", headers: () => ({ "X-Test": "1" }) });
    expect(await source.list(engine, { platform: "linux", auth: { token: "t" } })).toEqual({
      kind: "ok",
      models: [{ id: "x", contextWindow: undefined, maxOutput: undefined }],
    });
    expect(engine.recorded.http[0]?.headers).toMatchObject({ "X-Test": "1", authorization: "Bearer t" });
  });
});

describe("provider registry accepts plugins (T001)", () => {
  it("registers a built-in plugin and rejects one whose id is Anthropic", () => {
    const registry = createProviderRegistry();
    registry.register(openCodeGo);
    expect(registry.get("opencode-go")).toBe(openCodeGo);
    expect(() => registry.register({ ...openCodeGo, identity: { ...openCodeGo.identity, id: "anthropic" } })).toThrow(
      ProviderRejected,
    );
  });

  it("rejects a plugin whose base URL is an Anthropic host", () => {
    const registry = createProviderRegistry();
    expect(() =>
      registry.register({ ...openCodeGo, identity: { ...openCodeGo.identity, baseUrl: "https://api.anthropic.com" } }),
    ).toThrow(ProviderRejected);
    expect(registry.list()).toEqual([]);
  });
});

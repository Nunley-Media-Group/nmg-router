import { describe, expect, it, vi } from "vitest";
import { routeStep } from "../../src/routing/turn-step.ts";
import { collect, harness, signIn, spyNext, step } from "../support/routing.ts";

// AC1: a Claude step passes through `next` unchanged, with no request, subprocess or credential read.
describe("Claude passthrough", () => {
  it.each(["claude-haiku-5-5", "haiku"])("starts no request, subprocess or credential read for %s", async (model) => {
    const h = harness();
    await signIn(h.engine);
    const reads = vi.spyOn(h.engine.store, "get");
    const next = spyNext();
    const { chunks } = await collect(routeStep(h.router, step(0, model), next));

    expect(next.calls).toHaveLength(1);
    expect(chunks).toEqual([{ kind: "text", index: 0, text: "from claude" }]);
    expect(h.engine.recorded.http).toEqual([]);
    expect(h.engine.recorded.processes).toEqual([]);
    expect(reads.mock.calls.filter(([key]) => key === "credentials.index")).toEqual([]);
  });

  // A provider-shaped id that is not in the catalog is looked up in the user config,
  // whose path depends on the platform, so the first such step runs the platform probe.
  // It still sends no request and reads no credential.
  it.each(["anthropic/claude-opus-5-5", "unknown-provider/some-model"])("passes %s through with no request or credential read", async (model) => {
    const h = harness();
    await signIn(h.engine);
    const reads = vi.spyOn(h.engine.store, "get");
    const next = spyNext();
    await collect(routeStep(h.router, step(0, model), next));

    expect(next.calls).toHaveLength(1);
    expect(h.engine.recorded.http).toEqual([]);
    expect(reads.mock.calls.filter(([key]) => key === "credentials.index")).toEqual([]);
  });
});

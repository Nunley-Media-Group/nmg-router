import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCatalog } from "../../src/catalog/catalog.ts";
import { createCredentialStore } from "../../src/credentials/store.ts";
import { detailLine } from "../../src/hub/hub-state.ts";
import { catalogSource } from "../../src/hub/sources.ts";
import { routeStep } from "../../src/routing/turn-step.ts";
import type { ApiMessageInput } from "../../src/translate/messages.ts";
import { chatTurn, collect, harness, postsTo, remember, signIn, spyNext, step, textOf } from "../support/routing.ts";

// A routed turn carries an image only to a model the catalog marks vision. ClinePass
// image support comes from its model data, matched to the recommended aliases.

const RECOMMENDED_URL = "https://api.cline.bot/api/v1/ai/cline/recommended-models";
const CLINE_MODELS_URL = "https://api.cline.bot/api/v1/ai/cline/models";
const CLINE_CHAT_URL = "https://api.cline.bot/api/v1/chat/completions";
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const RECOMMENDED = {
  clinePass: [{ id: "cline-pass/kimi-k3" }, { id: "cline-pass/glm-5.3" }, { id: "cline-pass/qwen3.8-max" }],
};

const withImage: ApiMessageInput = {
  role: "user",
  content: [
    { type: "text", text: "What is in this picture?" },
    { type: "image", source: { type: "base64", media_type: "image/png", data: PNG } },
  ],
};

async function routedImageTurn(model: string) {
  const answer = chatTurn({ text: "Routed answer." });
  const h = harness(
    {
      http: (request) => {
        if (request.url === RECOMMENDED_URL) return { status: 200, text: JSON.stringify(RECOMMENDED) };
        if (request.url === CLINE_MODELS_URL) return { status: 200, text: readFileSync(join(import.meta.dirname, "..", "fixtures", "cline-pass-models.json"), "utf8") };
        if (request.url === CLINE_CHAT_URL) return { status: 200, text: answer };
        return undefined;
      },
    },
    [withImage],
  );
  await h.engine.store.set("accounts.active", { "cline-pass": "default" });
  await signIn(h.engine, "cline-pass");
  const catalog = createCatalog({ ...h.engine, credentials: createCredentialStore(h.engine) });
  await catalog.load();
  await catalog.refresh("cline-pass");
  remember(h.capture, model);

  const routed = await collect(routeStep(h.router, step(0, model), spyNext()));
  const [request] = postsTo(h.engine, CLINE_CHAT_URL);
  const body = JSON.parse(request?.body ?? "{}") as { messages: { role: string; content: unknown }[] };
  const user = body.messages.find((message) => message.role === "user");
  const parts = Array.isArray(user?.content) ? (user.content as { type: string; image_url?: { url: string } }[]) : [];
  return { routed, catalog, parts, sent: JSON.stringify(user?.content) };
}

describe("a routed image turn on ClinePass", () => {
  it("sends the image to a model its model data marks vision, and the hub shows it (AC1)", async () => {
    const { routed, catalog, parts } = await routedImageTurn("cline-pass/kimi-k3");

    expect(textOf(routed.chunks)).toBe("Routed answer.");
    expect(parts).toContainEqual({ type: "image_url", image_url: { url: `data:image/png;base64,${PNG}` } });
    const rows = catalogSource({ id: "cline-pass", label: "ClinePass", models: catalog.models(), speeds: {}, refresh: async () => undefined }).rows();
    expect(detailLine(rows.find((row) => row.switchArg === "cline-pass/kimi-k3")!)).toContain("vision");
    expect(detailLine(rows.find((row) => row.switchArg === "cline-pass/glm-5.3")!)).not.toContain("vision");
  });

  it.each(["cline-pass/glm-5.3", "cline-pass/qwen3.8-max"])(
    "replaces the image with the omission note for %s, which is text-only or unknown (AC5)",
    async (model) => {
      const { routed, parts, sent } = await routedImageTurn(model);

      expect(textOf(routed.chunks)).toBe("Routed answer.");
      expect(parts.some((part) => part.type === "image_url")).toBe(false);
      expect(sent).toContain(`(image omitted: ${model} has no image input)`);
    },
  );
});

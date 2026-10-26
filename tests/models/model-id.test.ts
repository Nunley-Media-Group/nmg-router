import { describe, expect, it } from "vitest";
import { parseModelId, toModelId } from "../../src/models/model-id.ts";

describe("model ids (FR2)", () => {
  it("joins provider and model with a slash", () => {
    expect(toModelId("opencode-go", "glm-5.1")).toBe("opencode-go/glm-5.1");
  });

  it("strips one provider prefix that the list already carries", () => {
    expect(toModelId("cline-pass", "cline-pass/glm-5.2")).toBe("cline-pass/glm-5.2");
    expect(toModelId("cline-pass", "cline-pass/cline-pass/x")).toBe("cline-pass/cline-pass/x");
  });

  it("splits at the first slash", () => {
    expect(parseModelId("openrouter/vendor/model")).toEqual({ provider: "openrouter", model: "vendor/model" });
    expect(parseModelId("no-slash")).toBeUndefined();
    expect(parseModelId("/model")).toBeUndefined();
    expect(parseModelId("provider/")).toBeUndefined();
  });
});

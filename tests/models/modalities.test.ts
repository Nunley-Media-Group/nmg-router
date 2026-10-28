import { describe, expect, it } from "vitest";
import { inputModalitiesOf, visionOf } from "../../src/models/modalities.ts";

describe("input modalities (AC3, FR1)", () => {
  it.each([
    ["input_modalities", { input_modalities: ["text", "image"] }, { input_modalities: ["text"] }],
    ["architecture.input_modalities", { architecture: { input_modalities: ["Text", "IMAGE"] } }, { architecture: { input_modalities: ["text"] } }],
    ["modalities.input", { modalities: { input: ["text", "image", "pdf"] } }, { modalities: { input: ["text"] } }],
    ["architecture.modality", { architecture: { modality: "text+image->text" } }, { architecture: { modality: "text->text" } }],
  ])("reads %s", (_shape, withImage, textOnly) => {
    expect(visionOf(withImage)).toBe(true);
    expect(visionOf(textOnly)).toBe(false);
  });

  it("takes the first shape present, in order", () => {
    const entry = { input_modalities: ["text"], architecture: { input_modalities: ["text", "image"] } };
    expect(inputModalitiesOf(entry)).toEqual(["text"]);
  });

  it("names the inputs before the arrow of a modality string", () => {
    expect(inputModalitiesOf({ architecture: { modality: "text + image + video -> text" } })).toEqual(["text", "image", "video"]);
  });

  it("is unknown when no shape is present or the entry is not an object", () => {
    expect(visionOf({ id: "glm-5.3" })).toBeUndefined();
    expect(visionOf({ architecture: { modality: "text" } })).toBeUndefined();
    expect(visionOf(undefined)).toBeUndefined();
    expect(visionOf("text+image->text")).toBeUndefined();
    expect(visionOf([{ input_modalities: ["image"] }])).toBeUndefined();
  });
});

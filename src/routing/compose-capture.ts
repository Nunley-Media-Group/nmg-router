import type { PromptComposeInput, PromptComposeResult } from "claude-code";

// Keeps the latest system prompt and offered tools per model, from the
// `prompt.compose` the engine renders for each request. `turn.step` does not carry
// either one, so this is where the router reads them. Analysis renders are skipped.

export type Captured = {
  readonly system: string;
  readonly toolNames: readonly string[];
};

export type ComposeCapture = {
  record(input: Pick<PromptComposeInput, "model" | "traits" | "tools">, result: PromptComposeResult): void;
  get(model: string): Captured | undefined;
};

export function createComposeCapture(): ComposeCapture {
  const byModel = new Map<string, Captured>();
  return {
    record(input, result) {
      if (input.traits.includes("analysis")) return;
      byModel.set(input.model, {
        system: result.sections.map((section) => section.text).join("\n\n"),
        toolNames: [...input.tools],
      });
    },
    get: (model) => byModel.get(model),
  };
}

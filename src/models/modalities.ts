// A model list entry's input modalities, in whichever shape its service uses:
// `input_modalities` (OpenAI, Codex, xAI), `architecture.input_modalities` and
// `architecture.modality` (OpenRouter-style lists such as ClinePass's), or
// `modalities.input`. An entry that states none has unknown modalities.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringsOf(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string").map((item) => item.toLowerCase());
}

// `text+image->text` names its inputs before the arrow.
function modalityInputs(value: unknown): string[] | undefined {
  if (typeof value !== "string" || !value.includes("->")) return undefined;
  const inputs = value.slice(0, value.indexOf("->"));
  return inputs.split("+").map((item) => item.trim().toLowerCase()).filter((item) => item !== "");
}

export function inputModalitiesOf(entry: unknown): readonly string[] | undefined {
  if (!isRecord(entry)) return undefined;
  const architecture = isRecord(entry.architecture) ? entry.architecture : undefined;
  const modalities = isRecord(entry.modalities) ? entry.modalities : undefined;
  return (
    stringsOf(entry.input_modalities) ??
    stringsOf(architecture?.input_modalities) ??
    stringsOf(modalities?.input) ??
    modalityInputs(architecture?.modality)
  );
}

// Whether the entry takes images, or undefined when it does not say.
export function visionOf(entry: unknown): boolean | undefined {
  return inputModalitiesOf(entry)?.includes("image");
}

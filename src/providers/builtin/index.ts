import type { ProviderPlugin } from "../types.ts";
import { clinePass } from "./cline-pass.ts";
import { openCodeGo } from "./opencode-go.ts";
import { openaiCodex } from "./openai-codex.ts";
import { xai } from "./xai.ts";

// The one list to extend. A provider is one module plus one entry here.
export const BUILTIN_PROVIDERS: readonly ProviderPlugin[] = [openCodeGo, clinePass, openaiCodex, xai];

export const BUILTIN_IDS: readonly string[] = BUILTIN_PROVIDERS.map((provider) => provider.identity.id);

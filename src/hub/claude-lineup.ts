// The Claude models the hub lists. Picking one runs Claude Code's own `/model <alias>`.

export type ClaudeEntry = { readonly alias: string; readonly label: string };

export const CLAUDE_LINEUP: readonly ClaudeEntry[] = [
  { alias: "default", label: "Default" },
  { alias: "opus", label: "Opus" },
  { alias: "sonnet", label: "Sonnet" },
  { alias: "haiku", label: "Haiku" },
  { alias: "fable", label: "Fable" },
];

// A model id is an alias's Claude model when it is the alias or carries it between
// dashes, as `claude-opus-5-5` carries `opus`.
export function claudeMatches(alias: string, model: string): boolean {
  return model === alias || model.includes(`-${alias}-`);
}

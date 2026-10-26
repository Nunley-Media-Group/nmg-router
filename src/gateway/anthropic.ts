const ANTHROPIC_DOMAINS = ["anthropic.com", "claude.ai", "claude.com"];

// Matches model names such as "opus-5-5" or "sonnet_5" in the name after the
// last "/", so a relay that renames a Claude model still counts as one.
const ANTHROPIC_MODEL_NAME = /(opus|sonnet|haiku|fable)[-_.]?\d/i;

export function isAnthropicProvider(id: string): boolean {
  return id.trim().toLowerCase() === "anthropic";
}

export function isAnthropicModel(id: string): boolean {
  const lower = id.trim().toLowerCase();
  if (lower.startsWith("anthropic/")) return true;
  const name = lower.slice(lower.lastIndexOf("/") + 1);
  return name.includes("claude") || ANTHROPIC_MODEL_NAME.test(name);
}

// An unparsable URL or one without a host counts as Anthropic: fail closed.
export function isAnthropicHost(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return true;
  }
  if (host === "") return true;
  return ANTHROPIC_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

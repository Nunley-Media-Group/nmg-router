const ANTHROPIC_DOMAINS = ["anthropic.com", "claude.ai", "claude.com"];
const MODEL_FAMILY = /(opus|sonnet|haiku|fable)[-_.]?\d/i;

export function isAnthropicProvider(id: string): boolean {
  return id.trim().toLowerCase() === "anthropic";
}

export function isAnthropicModel(id: string): boolean {
  const lower = id.toLowerCase();
  if (lower.startsWith("anthropic/")) {
    return true;
  }
  const name = lower.slice(lower.lastIndexOf("/") + 1);
  return name.includes("claude") || MODEL_FAMILY.test(name);
}

export function isAnthropicHost(url: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return true;
  }
  return ANTHROPIC_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

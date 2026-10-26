import { ProviderRejected } from "../errors/errors.ts";
import { isAnthropicHost, isAnthropicProvider } from "../gateway/anthropic.ts";
import type { ProviderPlugin } from "./types.ts";

export type ProviderDefinition = {
  readonly id: string;
  readonly baseUrl?: string;
};

// A registry holds plugins; a bare definition is still accepted for the
// foundation's callers. Either way, the id and base URL are checked the same.
export type ProviderEntry = ProviderDefinition | ProviderPlugin;

export type ProviderRegistry = {
  register(entry: ProviderEntry): void;
  get(id: string): ProviderEntry | undefined;
  list(): ProviderEntry[];
};

function identityOf(entry: ProviderEntry): ProviderDefinition {
  if ("identity" in entry) return { id: entry.identity.id, baseUrl: entry.identity.baseUrl };
  return entry;
}

export function createProviderRegistry(): ProviderRegistry {
  const providers = new Map<string, ProviderEntry>();

  return {
    register(entry) {
      const { id, baseUrl } = identityOf(entry);
      if (isAnthropicProvider(id)) {
        throw new ProviderRejected(id, "id");
      }
      if (baseUrl !== undefined && isAnthropicHost(baseUrl)) {
        throw new ProviderRejected(id, "host");
      }
      providers.set(id, entry);
    },
    get(id) {
      return isAnthropicProvider(id) ? undefined : providers.get(id);
    },
    list() {
      return [...providers.values()];
    },
  };
}

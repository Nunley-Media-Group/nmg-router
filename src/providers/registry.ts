import { ProviderRejected } from "../errors/errors.ts";
import { isAnthropicHost, isAnthropicProvider } from "../gateway/anthropic.ts";

export interface ProviderDefinition {
  id: string;
  baseUrl?: string;
}

export interface ProviderRegistry {
  register(definition: ProviderDefinition): void;
  get(id: string): ProviderDefinition | undefined;
  list(): ProviderDefinition[];
}

export function createProviderRegistry(): ProviderRegistry {
  const providers = new Map<string, ProviderDefinition>();
  return {
    register(definition) {
      if (isAnthropicProvider(definition.id)) {
        throw new ProviderRejected(definition.id, "Anthropic is not a provider");
      }
      if (definition.baseUrl !== undefined && isAnthropicHost(definition.baseUrl)) {
        throw new ProviderRejected(definition.id, "its base URL is on an Anthropic host");
      }
      providers.set(definition.id, { ...definition });
    },
    get: (id) => providers.get(id),
    list: () => [...providers.values()],
  };
}

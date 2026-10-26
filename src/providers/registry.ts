import { ProviderRejected } from "../errors/errors.ts";
import { isAnthropicHost, isAnthropicProvider } from "../gateway/anthropic.ts";

export type ProviderDefinition = {
  readonly id: string;
  readonly baseUrl?: string;
};

export type ProviderRegistry = {
  register(definition: ProviderDefinition): void;
  get(id: string): ProviderDefinition | undefined;
  list(): ProviderDefinition[];
};

export function createProviderRegistry(): ProviderRegistry {
  const providers = new Map<string, ProviderDefinition>();

  return {
    register(definition) {
      if (isAnthropicProvider(definition.id)) {
        throw new ProviderRejected(definition.id, "id");
      }
      if (definition.baseUrl !== undefined && isAnthropicHost(definition.baseUrl)) {
        throw new ProviderRejected(definition.id, "host");
      }
      providers.set(definition.id, definition);
    },
    get(id) {
      return isAnthropicProvider(id) ? undefined : providers.get(id);
    },
    list() {
      return [...providers.values()];
    },
  };
}

import { getJson, requestHeaders } from "../providers/http.ts";
import type { CapabilityIndex, CapabilitySource, ModelCapabilities, ProviderContext } from "../providers/types.ts";

// The two kinds of capability source a provider can declare: one read from the
// provider's own endpoint, and one bundled with the mod for a provider that
// publishes no capability data.

// Sends the provider's headers and stored token, the same as its listing. Any
// outcome other than a readable body answers undefined.
export function listedCapabilities(options: {
  readonly url: string;
  readonly headers: (context: ProviderContext) => Record<string, string>;
  readonly parse: (body: unknown) => CapabilityIndex | undefined;
}): CapabilitySource {
  return {
    async read(deps, context) {
      const outcome = await getJson(deps, options.url, requestHeaders(options.headers(context), context.auth?.token));
      return outcome.kind === "ok" ? options.parse(outcome.body) : undefined;
    },
  };
}

// Keyed by the model's id as the provider lists it.
export function staticCapabilities(table: Readonly<Record<string, ModelCapabilities>>): CapabilitySource {
  const index: CapabilityIndex = (rawId) => (Object.hasOwn(table, rawId) ? table[rawId] : undefined);
  return {
    async read() {
      return index;
    },
  };
}

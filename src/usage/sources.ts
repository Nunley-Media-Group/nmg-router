import { getJson, requestHeaders } from "../providers/http.ts";
import type { HttpDeps, ProviderContext, UsageSource } from "../providers/types.ts";
import { failureOf, type UsageOutcome, type UsageReport } from "./report.ts";

// A usage source that reads one provider endpoint. It sends the provider's headers
// and the context's own token, and only to the given URL. A body the parser does
// not accept is a malformed reading.
export function endpointUsage(options: {
  readonly url: string;
  readonly headers: (context: ProviderContext) => Record<string, string>;
  readonly parse: (body: unknown) => UsageReport | undefined;
}): UsageSource {
  return {
    async read(deps: HttpDeps, context: ProviderContext): Promise<UsageOutcome> {
      const outcome = await getJson(deps, options.url, requestHeaders(options.headers(context), context.auth?.token));
      if (outcome.kind !== "ok") return { kind: failureOf(outcome) };
      const report = options.parse(outcome.body);
      return report === undefined ? { kind: "malformed" } : { kind: "ok", report };
    },
  };
}

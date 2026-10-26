import type { JsonSchema } from "../tools/json-schema.ts";
import type { Effort, WireFormat } from "../providers/types.ts";
import type { ReasoningMapper } from "./reasoning.ts";

// The wire-neutral shapes the router builds and the adapters read. Nothing here
// touches the host, so the translation layer runs in tests without Claude Code.

export type BlockKey = string | number;

export type ToolDef = {
  readonly name: string;
  readonly description: string;
  readonly schema: JsonSchema;
};

export type ResultBlock = { readonly kind: "text"; readonly text: string } | { readonly kind: "image"; readonly mediaType: string; readonly data: string };

export type TurnBlock =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "image"; readonly mediaType: string; readonly data: string }
  | { readonly kind: "tool_use"; readonly id: string; readonly name: string; readonly input: unknown }
  | { readonly kind: "tool_result"; readonly id: string; readonly isError: boolean; readonly content: readonly ResultBlock[] };

export type Turn = { readonly role: "user" | "assistant"; readonly blocks: readonly TurnBlock[] };

export type RoutedRequest = {
  // The provider's own model name, without the `provider/` prefix.
  readonly model: string;
  readonly system: string;
  readonly turns: readonly Turn[];
  readonly tools: readonly ToolDef[];
  // The clamped effort. `mapper` is the model's own reasoning field, else the wire's default.
  readonly reasoning?: { readonly effort: Effort; readonly mapper?: ReasoningMapper };
  readonly maxOutput?: number;
};

export type HttpRequestSpec = {
  readonly url: string;
  readonly method: "POST";
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
};

export type StopReason = "end" | "length" | "tool" | "refusal";

// Token counts as the provider reported them. Cache reads and writes are kept apart from input.
export type StreamUsage = {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly cacheReadTokens?: number;
  readonly cacheWriteTokens?: number;
};

// `malformed` covers an unparseable record. The others name the failure a user sees.
export type StreamErrorKind = "provider_error" | "quota_exhausted" | "rate_limited" | "malformed";

export type StreamEvent =
  | { readonly type: "model"; readonly id: string }
  | { readonly type: "text"; readonly block: BlockKey; readonly text: string }
  | { readonly type: "thinking"; readonly block: BlockKey; readonly text: string }
  | { readonly type: "toolStart"; readonly block: BlockKey; readonly id: string; readonly name: string }
  | { readonly type: "toolInput"; readonly block: BlockKey; readonly json: string }
  | { readonly type: "toolEnd"; readonly block: BlockKey }
  | { readonly type: "stop"; readonly reason: StopReason; readonly usage?: StreamUsage }
  | { readonly type: "error"; readonly kind: StreamErrorKind; readonly retryAfterSeconds?: number };

// Incremental: `push` takes text as it arrives. `end` runs once the body has closed.
export type StreamParser = {
  push(text: string): StreamEvent[];
  end(): StreamEvent[];
};

export type AdapterContext = {
  readonly baseUrl: string;
  // Identity headers from the provider plugin, for this request.
  readonly headers: Readonly<Record<string, string>>;
  readonly token?: string;
  readonly sessionId: string;
};

export type WireAdapter = {
  readonly wire: WireFormat;
  encode(request: RoutedRequest, context: AdapterContext): HttpRequestSpec;
  parser(): StreamParser;
};

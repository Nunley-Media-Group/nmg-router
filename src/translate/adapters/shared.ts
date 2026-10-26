import type { AdapterContext, HttpRequestSpec, ResultBlock, StreamErrorKind } from "../types.ts";

// Helpers the four wire adapters share. None of them reads a credential: the
// token only enters the headers the caller passes, and those leave on stdin.

export function requestSpec(
  url: string,
  body: Record<string, unknown>,
  context: AdapterContext,
  auth: Readonly<Record<string, string>>,
  extra: Readonly<Record<string, string>> = {},
): HttpRequestSpec {
  return {
    url,
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream", ...context.headers, ...extra, ...auth },
    body: JSON.stringify(body),
  };
}

export function bearer(token: string | undefined): Record<string, string> {
  return token === undefined ? {} : { authorization: `Bearer ${token}` };
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

export function stringOf(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function numberOf(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export function dataUrl(image: { readonly mediaType: string; readonly data: string }): string {
  return `data:${image.mediaType};base64,${image.data}`;
}

export type ImageBlock = Extract<ResultBlock, { kind: "image" }>;

export function imagesOf(content: readonly ResultBlock[]): ImageBlock[] {
  return content.filter((block): block is ImageBlock => block.kind === "image");
}

// A tool result as text: its text blocks in order, with a note where an image
// travels in the message after it.
export function resultText(content: readonly ResultBlock[]): string {
  const parts = content.map((block) => (block.kind === "text" ? block.text : "(image attached in the next message)"));
  return parts.join("\n");
}

// Quota and usage-limit codes are the only ones that mean the account is out of
// budget. Everything else from a stream error is a provider failure.
export function errorKindOf(code: string | undefined): StreamErrorKind {
  return code === "insufficient_quota" || code === "usage_limit_reached" ? "quota_exhausted" : "provider_error";
}

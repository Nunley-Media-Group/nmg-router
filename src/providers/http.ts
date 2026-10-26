import type { HttpDeps, ValidationOutcome } from "./types.ts";

// Every provider request goes through these helpers. Each one maps the host's
// result to a small outcome. No outcome carries a response body, a header or a
// token, so a caller that reports one cannot echo a secret.

export type HttpOutcome =
  | { kind: "ok"; body: unknown }
  | { kind: "status"; status: number }
  | { kind: "offline" }
  | { kind: "malformed" };

type Reply = { readonly status: number; readonly ok: boolean; readonly text: string };

export function requestHeaders(
  base: Readonly<Record<string, string>> | undefined,
  token: string | undefined,
): Record<string, string> {
  return {
    accept: "application/json",
    ...base,
    ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
  };
}

// A rejected fetch means the host could not reach the server at all.
async function send(
  deps: HttpDeps,
  url: string,
  init: { method?: string; headers: Record<string, string>; body?: string },
): Promise<Reply | undefined> {
  try {
    const reply = await deps.http.fetch(url, init);
    return { status: reply.status, ok: reply.ok, text: reply.text };
  } catch {
    return undefined;
  }
}

function parseBody(text: string): HttpOutcome {
  try {
    return { kind: "ok", body: JSON.parse(text) as unknown };
  } catch {
    return { kind: "malformed" };
  }
}

export async function getJson(
  deps: HttpDeps,
  url: string,
  headers: Record<string, string>,
): Promise<HttpOutcome> {
  const reply = await send(deps, url, { method: "GET", headers });
  if (reply === undefined) return { kind: "offline" };
  if (!reply.ok) return { kind: "status", status: reply.status };
  return parseBody(reply.text);
}

export async function postForm(
  deps: HttpDeps,
  url: string,
  fields: Readonly<Record<string, string>>,
): Promise<HttpOutcome> {
  const reply = await send(deps, url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
  if (reply === undefined) return { kind: "offline" };
  if (!reply.ok) return { kind: "status", status: reply.status };
  return parseBody(reply.text);
}

// A key check that needs only the status, so a 2xx with any body is valid.
export async function checkStatus(
  deps: HttpDeps,
  url: string,
  headers: Record<string, string>,
): Promise<ValidationOutcome> {
  const reply = await send(deps, url, { method: "GET", headers });
  if (reply === undefined) return { kind: "offline" };
  if (reply.ok) return { kind: "ok" };
  return { kind: "status", status: reply.status };
}

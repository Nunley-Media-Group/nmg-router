import { checkRequest, checkResponse, type RoutedRequest } from "./guard.ts";

export type GatewayReply<C> = {
  readonly model?: string;
  readonly content: C;
};

// Checks the request before the single transport call, and returns content
// only after the response passes. A refused or rejected exchange never retries
// and never falls back to another provider.
export async function guardedSend<R extends RoutedRequest, C>(
  transport: (request: R) => Promise<GatewayReply<C>>,
  request: R,
): Promise<C> {
  checkRequest(request);
  const reply = await transport(request);
  checkResponse(request.model, reply);
  return reply.content;
}

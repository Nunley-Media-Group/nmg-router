import { AnthropicRequestRefused, AnthropicResponseRejected } from "../errors/errors.ts";
import { isAnthropicHost, isAnthropicModel, isAnthropicProvider } from "./anthropic.ts";

export type RoutedRequest = {
  readonly provider: string;
  readonly model: string;
  readonly baseUrl?: string;
};

// Throws before anything is sent when the request would reach an Anthropic
// provider, host or model.
export function checkRequest(request: RoutedRequest): void {
  if (isAnthropicProvider(request.provider)) {
    throw new AnthropicRequestRefused(request.model, "provider");
  }
  if (request.baseUrl !== undefined && isAnthropicHost(request.baseUrl)) {
    throw new AnthropicRequestRefused(request.model, "host");
  }
  if (isAnthropicModel(request.model)) {
    throw new AnthropicRequestRefused(request.model, "model");
  }
}

// Throws when the response names an Anthropic model, or names no model at all.
export function checkResponse(requestedModel: string, response: { readonly model?: string }): void {
  const returned = response.model;
  if (returned === undefined || returned.trim() === "") {
    throw new AnthropicResponseRejected(requestedModel, undefined);
  }
  if (isAnthropicModel(returned)) {
    throw new AnthropicResponseRejected(requestedModel, returned);
  }
}

import { AnthropicRequestRefused, AnthropicResponseRejected } from "../errors/errors.ts";
import { isAnthropicHost, isAnthropicModel, isAnthropicProvider } from "./anthropic.ts";

export interface RoutedRequest {
  provider: string;
  model: string;
  baseUrl?: string;
}

export interface RoutedResponse {
  model?: string;
}

export function checkRequest(request: RoutedRequest): void {
  const refused =
    isAnthropicProvider(request.provider) ||
    (request.baseUrl !== undefined && isAnthropicHost(request.baseUrl)) ||
    isAnthropicModel(request.model);
  if (refused) {
    throw new AnthropicRequestRefused(request.model);
  }
}

export function checkResponse(requestedModel: string, response: RoutedResponse): void {
  const returned = response.model;
  if (!returned || isAnthropicModel(returned)) {
    throw new AnthropicResponseRejected(requestedModel, returned);
  }
}

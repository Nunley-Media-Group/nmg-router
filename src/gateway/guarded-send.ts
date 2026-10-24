import { checkRequest, checkResponse, type RoutedRequest } from "./guard.ts";

export interface TransportResponse<T> {
  model?: string;
  content: T;
}

export type Transport<T> = (request: RoutedRequest) => Promise<TransportResponse<T>>;

export async function guardedSend<T>(transport: Transport<T>, request: RoutedRequest): Promise<T> {
  checkRequest(request);
  const response = await transport(request);
  checkResponse(request.model, response);
  return response.content;
}

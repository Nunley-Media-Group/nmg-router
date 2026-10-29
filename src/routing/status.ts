import type { Effort } from "../providers/types.ts";
import { windowText } from "../usage/render.ts";
import type { UsageReport } from "../usage/report.ts";

// The routed status line: one structured object, and the one renderer of it.

export type Thinking = { readonly kind: "effort"; readonly effort: Effort } | { readonly kind: "off" } | { readonly kind: "unsupported" };

// A model with no supported levels cannot think. One that can, but got no effort on the step, is off.
export function thinkingOf(supported: readonly Effort[] | undefined, effort: Effort | undefined): Thinking {
  if (supported === undefined || supported.length === 0) return { kind: "unsupported" };
  return effort === undefined ? { kind: "off" } : { kind: "effort", effort };
}

type StatusShared = {
  readonly provider: { readonly id: string; readonly name: string };
  // The active account the step used. Undefined for a provider with no login.
  readonly account: string | undefined;
  readonly model: string;
  // The provider's latest good usage report, when it has one.
  readonly usage?: UsageReport;
};

// A routed main-loop step's line shows its thinking state. A failed step shows its error kind instead, and no windows.
export type RoutedStatus = StatusShared &
  (
    | { readonly thinking: Thinking; readonly error?: undefined }
    | { readonly thinking?: undefined; readonly error: string }
  );

// The only builder of the status line's text. An error line reads `<model> · <provider> error: <kind>`,
// which stays until a later routed step succeeds or a Claude main-loop step clears it.
export function renderStatus(state: RoutedStatus): string {
  if (state.error !== undefined) return `${state.model} · ${state.provider.name} error: ${state.error}`;
  const level = state.thinking.kind === "effort" ? state.thinking.effort : state.thinking.kind;
  const windows = (state.usage?.windows ?? []).map((window) => ` · ${windowText(window)}`).join("");
  return `${state.model} · thinking ${level}${windows}`;
}

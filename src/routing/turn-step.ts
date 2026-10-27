import type { HookStream, TurnStepChunk, TurnStepInput, TurnStepResult } from "claude-code";
import type { Router } from "./router.ts";

// The bodies of the `turn.step` hook and its `.catch`. A Claude step passes
// through to `next` unchanged, after it clears any routed status line the main loop
// left. A routed step is answered here, and `next` is never
// called for it, so a failure cannot send the step to Claude.

export type StepNext = {
  (e: TurnStepInput): HookStream<TurnStepChunk, TurnStepResult>;
  readonly signal: AbortSignal;
};

export async function* routeStep(
  router: Router,
  e: TurnStepInput,
  next: StepNext,
): AsyncGenerator<TurnStepChunk, TurnStepResult | void> {
  router.observe(e);
  if (!(await router.isRouted(e.model))) {
    router.claudeStep(e);
    return yield* next(e);
  }
  return yield* router.answer(e, next.signal);
}

// `next.error` names the failure; on a Claude step it replays `next(e)` so the step still goes to Claude.
export async function* routeStepFailed(
  router: Router,
  e: TurnStepInput,
  next: StepNext & { readonly error?: unknown },
): AsyncGenerator<TurnStepChunk, TurnStepResult | void> {
  router.observe(e);
  if (!(await router.isRouted(e.model))) {
    router.claudeStep(e);
    return yield* next(e);
  }
  return yield* router.fail(e, next.error);
}

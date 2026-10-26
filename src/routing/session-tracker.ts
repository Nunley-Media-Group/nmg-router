// What the mod remembers about each loop of the session: the model its latest step
// ran on, the routed context size from its last stop, and the tool ids routed steps
// emitted. A loop is `main` or a subagent's id. Nothing here holds a credential.

export const MAIN_LOOP = "main";

// The most recent tool ids kept. A call older than these is no longer recognised as routed.
const KEPT_TOOL_IDS = 1024;

// The four token counts of a response, as the stop chunk reports them.
export type ContextUsage = {
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cache_read_input_tokens: number;
  readonly cache_creation_input_tokens: number;
};

export type SessionTracker = {
  recordStep(loop: string, model: string): void;
  recordUsage(loop: string, usage: ContextUsage): void;
  recordToolId(id: string): void;
  isRoutedTool(id: string): boolean;
  model(loop: string): string | undefined;
  contextTokens(loop: string): number;
  // Called after a compaction of the loop, so its context starts again from zero.
  resetContext(loop: string): void;
};

export function createSessionTracker(): SessionTracker {
  const models = new Map<string, string>();
  const contexts = new Map<string, number>();
  // A set keeps insertion order, so its first entries are the oldest ids.
  const toolIds = new Set<string>();
  return {
    recordStep(loop, model) {
      models.set(loop, model);
    },
    recordUsage(loop, usage) {
      contexts.set(
        loop,
        usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens + usage.output_tokens,
      );
    },
    recordToolId(id) {
      toolIds.delete(id);
      toolIds.add(id);
      for (const old of toolIds) {
        if (toolIds.size <= KEPT_TOOL_IDS) break;
        toolIds.delete(old);
      }
    },
    isRoutedTool: (id) => toolIds.has(id),
    model: (loop) => models.get(loop),
    contextTokens: (loop) => contexts.get(loop) ?? 0,
    resetContext(loop) {
      contexts.set(loop, 0);
    },
  };
}

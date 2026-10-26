import type { ApiMessageInput } from "../translate/messages.ts";

// The provider's view of a loop after an in-place summary: the summary, the model
// that wrote it, and the transcript length it covers. A routed request sends the
// summary followed by only the messages after `cut`. The engine's transcript is
// never changed, so a Claude step never sees the view.

export type ViewEntry = {
  readonly summary: string;
  readonly model: string;
  readonly cut: number;
};

export type RoutedView = {
  get(loop: string): ViewEntry | undefined;
  set(loop: string, entry: ViewEntry): void;
  drop(loop: string): void;
  // The transcript a routed request sends for the loop. Drops the view when the
  // transcript is shorter than its cut, since the engine rewrote it.
  apply(loop: string, messages: readonly ApiMessageInput[]): readonly ApiMessageInput[];
  // The in-place summary running for the loop, if any. It never rejects.
  pending(loop: string): Promise<void> | undefined;
  hold(loop: string, running: Promise<void>): void;
};

// The summary as the conversation reads from then on. Compaction answers the same text.
export function summaryText(model: string, summary: string): string {
  return `This session continues from an earlier conversation that was compacted by ${model}. Summary of the earlier conversation:\n\n<summary>\n${summary}\n</summary>`;
}

export function createRoutedView(): RoutedView {
  const entries = new Map<string, ViewEntry>();
  const running = new Map<string, Promise<void>>();
  return {
    get: (loop) => entries.get(loop),
    set(loop, entry) {
      entries.set(loop, entry);
    },
    drop(loop) {
      entries.delete(loop);
    },
    apply(loop, messages) {
      const entry = entries.get(loop);
      if (entry === undefined) return messages;
      if (messages.length < entry.cut) {
        entries.delete(loop);
        return messages;
      }
      const summary = { type: "text", text: summaryText(entry.model, entry.summary) };
      const [first, ...rest] = messages.slice(entry.cut);
      // Two user messages in a row are merged, the summary first, so the roles still alternate.
      if (first?.role === "user") return [{ role: "user", content: [summary, ...first.content] }, ...rest];
      return [{ role: "user", content: [summary] }, ...(first === undefined ? [] : [first]), ...rest];
    },
    pending: (loop) => running.get(loop),
    hold(loop, promise) {
      const settled: Promise<void> = promise.then(
        () => undefined,
        () => undefined,
      ).finally(() => {
        if (running.get(loop) === settled) running.delete(loop);
      });
      running.set(loop, settled);
    },
  };
}

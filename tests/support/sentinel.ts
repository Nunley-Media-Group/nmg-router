import type { FakeEngine } from "./fake-engine.ts";

// A secret built at run time, so no literal credential-shaped value sits in source.
export function makeSentinel(): string {
  return ["nmg", "sentinel", Date.now().toString(36), Math.random().toString(36).slice(2, 12)].join("-");
}

function textOf(value: unknown): string {
  if (value instanceof Error) return `${value.name} ${value.message}`;
  return typeof value === "string" ? value : (JSON.stringify(value) ?? "");
}

// Fails when the sentinel reached any surface a credential must never reach. The
// failure names the surface, never the sentinel. stdin is excluded on purpose:
// the secret is meant to travel there.
export function assertNoSentinel(engine: FakeEngine, sentinel: string, extra: readonly unknown[] = []): void {
  const { processes, fsWrites, storeWrites, settingsWrites, http, ui, telemetry } = engine.recorded;
  const surfaces: [string, string[]][] = [
    ["process argv", processes.flatMap((call) => call.argv)],
    ["process env", processes.flatMap((call) => Object.values(call.env ?? {}))],
    ["http call", http.map((call) => call.url)],
    ["fs write", fsWrites.flatMap((write) => [write.path, write.text])],
    ["store write", storeWrites.flatMap((write) => [write.key, textOf(write.value)])],
    ["settings write", settingsWrites.map(textOf)],
    ["ui text", ui],
    ["telemetry", telemetry],
    ["error or console text", extra.map(textOf)],
  ];
  for (const [surface, texts] of surfaces) {
    if (texts.some((text) => text.includes(sentinel))) {
      throw new Error(`credential reached ${surface}`);
    }
  }
}

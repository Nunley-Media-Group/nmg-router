import type { FakeEngine } from "./fake-engine.ts";

/**
 * Fails when `sentinel` appears on any surface a credential must never reach:
 * recorded argv and env, stored values, files, UI and telemetry text, plus any
 * console output or error messages the test passes in as `extra`.
 * Child stdin is deliberately not scanned: it is the one channel a secret may use.
 */
export function assertNoSentinel(engine: FakeEngine, sentinel: string, extra: readonly unknown[] = []): void {
  const surfaces: [string, string][] = [];
  engine.calls.forEach((call, index) => {
    surfaces.push([`argv[${index}]`, call.argv.join(" ")]);
    surfaces.push([`env[${index}]`, JSON.stringify(call.env ?? {})]);
  });
  for (const [key, value] of engine.values) {
    surfaces.push([`store:${key}`, JSON.stringify(value)]);
  }
  for (const [path, text] of engine.files) {
    surfaces.push([`file:${path}`, text]);
  }
  engine.texts.forEach((text, index) => surfaces.push([`text[${index}]`, text]));
  extra.forEach((item, index) => {
    const text = item instanceof Error ? `${item.name}: ${item.message}` : String(item);
    surfaces.push([`extra[${index}]`, text]);
  });
  for (const [where, text] of surfaces) {
    if (text.includes(sentinel)) {
      throw new Error(`Sentinel leaked into ${where}`);
    }
  }
}

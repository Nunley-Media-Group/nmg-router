import type { PromptComposeResult, TurnStepChunk, TurnStepInput, TurnStepResult } from "claude-code";
import { encodeSecret } from "../../src/auth/accounts.ts";
import { createRoutedView, type RoutedView } from "../../src/compaction/routed-view.ts";
import { createCredentialStore } from "../../src/credentials/store.ts";
import { createComposeCapture, type ComposeCapture } from "../../src/routing/compose-capture.ts";
import { createRouter, type Router, type RouterHost } from "../../src/routing/router.ts";
import { createSessionTracker, type SessionTracker } from "../../src/routing/session-tracker.ts";
import { routeStep, routeStepFailed, type StepNext } from "../../src/routing/turn-step.ts";
import type { UsageMonitor } from "../../src/usage/monitor.ts";
import type { ApiMessageInput } from "../../src/translate/messages.ts";
import { fakeEngine, type FakeEngine, type FakeHttpResponder, type FakeOptions } from "./fake-engine.ts";

// The routed-turn harness: a fake engine wired as the router's host, a signed-in
// OpenCode Go account, and OpenAI-style chat streams the replies are built from.

export const PLUGIN_ROOT = "/plugin";
export const VERSION = "0.5.0";
export const SESSION = "session-7";
export const MODEL = "opencode-go/kimi-k3.1-pro";
export const CHAT_URL = "https://opencode.ai/inference/go/v1/chat/completions";
export const HEAD = "HTTP/2 200\r\ncontent-type: text/event-stream\r\n\r\n";

export type Harness = {
  readonly engine: FakeEngine;
  readonly router: Router;
  readonly capture: ComposeCapture;
  readonly messages: ApiMessageInput[];
  readonly tracker: SessionTracker;
  readonly view: RoutedView;
};

export function routerHostOf(engine: FakeEngine): RouterHost {
  const surface = engine as unknown as Pick<RouterHost, "process" | "ui" | "session" | "prompt" | "tool" | "model" | "config" | "clock"> & {
    plugin: { root: string };
  };
  return {
    env: engine.env,
    fs: engine.fs,
    http: engine.http,
    store: engine.store as unknown as RouterHost["store"],
    settings: engine.settings,
    process: surface.process,
    ui: surface.ui,
    session: surface.session,
    model: surface.model,
    config: surface.config,
    clock: surface.clock,
    prompt: surface.prompt,
    tool: surface.tool,
    pluginRoot: () => surface.plugin.root,
  } as RouterHost;
}

// `monitor` replaces the usage monitor, so a test moves its clock and the 60 s throttle is exact.
export function harness(
  options: Partial<FakeOptions> = {},
  messages: ApiMessageInput[] = [userText("Fix the notes")],
  monitor?: UsageMonitor,
): Harness {
  const engine = fakeEngine({
    platform: "linux",
    files: { [`${PLUGIN_ROOT}/.claude-plugin/plugin.json`]: JSON.stringify({ version: VERSION }) },
    pluginRoot: PLUGIN_ROOT,
    session: { id: SESSION, messages },
    ...options,
  });
  const capture = createComposeCapture();
  const tracker = createSessionTracker();
  const view = createRoutedView();
  return { engine, router: createRouter(routerHostOf(engine), capture, tracker, view, monitor), capture, messages, tracker, view };
}

export function userText(text: string): ApiMessageInput {
  return { role: "user", content: [{ type: "text", text }] };
}

export async function signIn(engine: FakeEngine, provider = "opencode-go", key = "sentinel-key"): Promise<void> {
  await createCredentialStore(engine).save(provider, "default", encodeSecret({ type: "api-key", key }));
  clearRecorded(engine);
}

// Forgets what the engine recorded so far, so a test sees only the calls it makes.
export function clearRecorded(engine: FakeEngine): void {
  const { recorded } = engine;
  for (const list of [recorded.http, recorded.processes, recorded.fsWrites, recorded.storeWrites, recorded.events, recorded.status, recorded.ui]) {
    list.splice(0);
  }
}

export function remember(capture: ComposeCapture, model = MODEL, system = "SYSTEM PROMPT", tools = ["Read", "Edit"]): void {
  capture.record({ model, traits: [], tools }, { sections: [{ id: "intro", text: system, scope: "shared" }] } as PromptComposeResult);
}

export function step(index = 0, model = MODEL, extra: Partial<TurnStepInput> = {}): TurnStepInput {
  return { turnId: "turn-1", index, model, messageCount: 1, ...extra };
}

// One OpenAI-style chat stream: optional thinking, optional text, optional tool call, then usage and [DONE].
export function chatTurn(options: {
  thinking?: string;
  text?: string;
  model?: string;
  tool?: { id: string; name: string; input: unknown };
}): string {
  const model = options.model ?? "fixture-model-1";
  const events: unknown[] = [];
  if (options.thinking !== undefined) events.push({ model, choices: [{ index: 0, delta: { role: "assistant", reasoning_content: options.thinking } }] });
  events.push({ model, choices: [{ index: 0, delta: { role: "assistant", content: options.text ?? "" } }] });
  if (options.tool !== undefined) {
    const { id, name, input } = options.tool;
    events.push({
      model,
      choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id, type: "function", function: { name, arguments: JSON.stringify(input) } }] } }],
    });
  }
  events.push({ model, choices: [{ index: 0, delta: {}, finish_reason: options.tool === undefined ? "stop" : "tool_calls" }] });
  events.push({ model, choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } });
  return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n";
}

// Answers each chat request with the next reply, in order. Undefined once they run out.
export function replies(...texts: string[]): FakeHttpResponder {
  const queue = [...texts];
  return (request) => {
    if (request.url !== CHAT_URL) return undefined;
    const text = queue.shift();
    return text === undefined ? undefined : { status: 200, text };
  };
}

export type Spy = StepNext & { readonly calls: TurnStepInput[] };

// The `next` a Claude step gets: it records each call and yields one text chunk.
export function spyNext(signal: AbortSignal = new AbortController().signal): Spy {
  const calls: TurnStepInput[] = [];
  const claudeResult = (e: TurnStepInput): TurnStepResult => ({
    turnId: e.turnId,
    index: e.index,
    answer: "from claude",
    toolUses: [],
    stopReason: "end_turn",
    usage: null,
  });
  const next = (e: TurnStepInput) => {
    calls.push(e);
    const stream = (async function* (): AsyncGenerator<TurnStepChunk, TurnStepResult> {
      yield { kind: "text", index: 0, text: "from claude" };
      return claudeResult(e);
    })();
    return Object.assign(stream, { result: Promise.resolve(claudeResult(e)) });
  };
  return Object.assign(next, { signal, calls }) as unknown as Spy;
}

export async function collect<T>(stream: AsyncGenerator<TurnStepChunk, T | void>): Promise<{ chunks: TurnStepChunk[]; result: T | void }> {
  const chunks: TurnStepChunk[] = [];
  for (;;) {
    const next = await stream.next();
    if (next.done === true) return { chunks, result: next.value };
    chunks.push(next.value);
  }
}

export function textOf(chunks: readonly TurnStepChunk[]): string {
  return chunks.flatMap((chunk) => (chunk.kind === "text" ? [chunk.text] : [])).join("");
}

export function postsTo(engine: FakeEngine, url: string) {
  return engine.recorded.http.filter((request) => request.method === "POST" && request.url === url);
}

// The engine's own check on a chunk a hook yields: a tool chunk needs an index,
// a name and an id of letters, digits, _ or -. The message is the host's.
export function engineRefusal(chunk: TurnStepChunk): string | undefined {
  if (chunk.kind !== "tool") return undefined;
  if (Number.isInteger(chunk.index) && chunk.name !== "" && /^[A-Za-z0-9_-]+$/.test(chunk.id)) return undefined;
  return "yielded a chunk with kind tool but no { index, id, name } (an id of letters, digits, _ or -)";
}

export type EngineRun = { chunks: TurnStepChunk[]; caught: boolean };

// Runs a step as the engine dispatches the turn.step hook and its .catch: a refused
// chunk fails the hook at its yield, the chunks already taken stay, and the catch
// handler continues the same stream.
export async function onEngine(
  router: Router,
  e: TurnStepInput,
  next: StepNext,
  refuse: (chunk: TurnStepChunk) => string | undefined = engineRefusal,
): Promise<EngineRun> {
  const chunks: TurnStepChunk[] = [];
  const stream = routeStep(router, e, next);
  for (;;) {
    const item = await stream.next();
    if (item.done === true) return { chunks, caught: false };
    const message = refuse(item.value);
    if (message === undefined) {
      chunks.push(item.value);
      continue;
    }
    await stream.return(undefined);
    const caught = Object.assign(next, { error: { kind: "throw" as const, message, budget: 1000 }, called: false });
    chunks.push(...(await collect(routeStepFailed(router, e, caught))).chunks);
    return { chunks, caught: true };
  }
}

// The kind of each block index, failing on an index two kinds share: the engine
// would merge the later chunks into the earlier block.
export function blockKinds(chunks: readonly TurnStepChunk[]): string[] {
  const kinds: string[] = [];
  for (const chunk of chunks) {
    if (chunk.kind === "stop" || chunk.kind === "engine") continue;
    const kind = chunk.kind === "input" ? "tool" : chunk.kind;
    const known = kinds[chunk.index];
    if (known !== undefined && known !== kind) throw new Error(`block ${chunk.index} carries both ${known} and ${kind}`);
    kinds[chunk.index] = kind;
  }
  return kinds;
}

import type {
  HookStream,
  ProcessSpawnChunk,
  ProcessSpawnRequest,
  ProcessSpawnResult,
  PromptComposeResult,
  ToolInfo,
  TurnStepChunk,
  TurnStepInput,
  TurnStepResult,
  TurnStepToolUse,
} from "claude-code";
import { resolveCredential } from "../auth/access-token.ts";
import { AnthropicRequestRefused, AnthropicResponseRejected, LoginError } from "../errors/errors.ts";
import { classify, refusedError, RoutedError } from "../errors/routed-errors.ts";
import type { HostPort } from "../host.ts";
import { checkRequest, checkResponse } from "../gateway/guard.ts";
import { parseModelId } from "../models/model-id.ts";
import { metadataFor } from "../providers/metadata.ts";
import type { Auth, ProviderPlugin, ResolvedWire } from "../providers/types.ts";
import { createServices } from "../services.ts";
import { offeredTools } from "../tools/offered-tools.ts";
import { WIRE_ADAPTERS } from "../translate/adapters/index.ts";
import { createChunkMapper } from "../translate/chunks.ts";
import { normalizeMessages, type ApiMessageInput } from "../translate/messages.ts";
import { clamp, toEffort, type ReasoningMapper } from "../translate/reasoning.ts";
import type { AdapterContext, RoutedRequest, StreamEvent, StreamParser } from "../translate/types.ts";
import { createTransportSelector } from "../transport/select.ts";
import { TransportFailure, type TransportResponse } from "../transport/types.ts";
import { readPluginVersion } from "../version.ts";
import type { ComposeCapture } from "./compose-capture.ts";
import { speedOf, withSpeed, type SpeedRecord } from "./metrics.ts";
import { errorStatusText, statusText, thinkingOf } from "./status.ts";

// Answers a routed model's turn step through the provider's wire. It sends one
// request, streams the reply back as engine chunks, and answers any failure with
// its message. It never calls `next`, so no step reaches Claude.

// The host calls the router makes. Each one is written literally in hooks/register.ts.
export type RouterHost = HostPort & {
  readonly ui: HostPort["ui"] & { status(text: string | undefined): void };
  readonly process: HostPort["process"] & {
    spawn(request: ProcessSpawnRequest): HookStream<ProcessSpawnChunk, ProcessSpawnResult>;
  };
  readonly session: {
    id(): Promise<string>;
    messages(args: { readonly agentId?: string }): Promise<ApiMessageInput[] | { readonly deny: string }>;
  };
  readonly prompt: { compose(args: { readonly model: string }): Promise<PromptComposeResult> };
  readonly tool: { list(): Promise<ToolInfo[]> };
  readonly pluginRoot: () => string;
};

export type Router = {
  // True when the model's provider is in the catalog. A Claude model or alias never is,
  // and asking costs no call.
  isRouted(model: string): Promise<boolean>;
  answer(e: TurnStepInput, signal: AbortSignal): AsyncGenerator<TurnStepChunk, TurnStepResult>;
  // The `.catch` path: a hook failed on a routed step, so its message is answered.
  fail(e: TurnStepInput, error: unknown): AsyncGenerator<TurnStepChunk, TurnStepResult>;
};

type StopChunk = Extract<TurnStepChunk, { kind: "stop" }>;

// How far a routed step got: the provider's name and how many blocks the engine
// took. A failure answers in the next block, so its text never lands in a block
// already streamed.
type Progress = { name: string; blocks: number };

// Progress is kept per step until the step ends, so the `.catch` answer for a hook
// the engine failed mid-stream can read it. A few steps are kept, oldest dropped.
const KEPT_STEPS = 16;

function stepKey(e: TurnStepInput): string {
  return `${e.agentId ?? ""}:${e.turnId}:${e.index}`;
}

type Tally = {
  text: string;
  toolUses: TurnStepToolUse[];
  toolNames: Map<number, string>;
  stop: StopChunk | undefined;
  blocks: number;
};

type Gate = {
  // Events in, chunks out. Chunks wait until the model event has passed the guard.
  accept(event: StreamEvent): TurnStepChunk[];
  finish(): void;
  readonly firstAt: number | undefined;
};

// Nothing reaches the engine before the response's model passes the guard. A stream
// that never names a model, or never stops, is malformed and its content is dropped.
function createGate(name: string, requested: string, turnId: string, step: number): Gate {
  const mapper = createChunkMapper({ turnId, step, model: requested });
  let verified = false;
  let stopped = false;
  let held: TurnStepChunk[] = [];
  let firstAt: number | undefined;
  return {
    accept(event) {
      switch (event.type) {
        case "error":
          throw classify(name, { kind: "stream", error: event.kind, retryAfterSeconds: event.retryAfterSeconds });
        case "model": {
          if (event.id.trim() === "") throw classify(name, { kind: "stream", error: "malformed" });
          checkResponse(requested, { model: event.id });
          verified = true;
          const released = held;
          held = [];
          return released;
        }
        case "text":
        case "thinking":
        case "toolStart":
          firstAt ??= Date.now();
          break;
        default:
          break;
      }
      const chunks = mapper.map(event);
      if (chunks.some((chunk) => chunk.kind === "stop")) stopped = true;
      if (verified) return chunks;
      held.push(...chunks);
      return [];
    },
    finish() {
      if (!verified || !stopped) throw classify(name, { kind: "stream", error: "malformed" });
    },
    get firstAt() {
      return firstAt;
    },
  };
}

function tally(result: Tally, chunk: TurnStepChunk): void {
  switch (chunk.kind) {
    case "text":
      result.text += chunk.text;
      result.blocks = Math.max(result.blocks, chunk.index + 1);
      return;
    case "thinking":
      result.blocks = Math.max(result.blocks, chunk.index + 1);
      return;
    case "tool":
      result.toolNames.set(chunk.index, chunk.name);
      result.blocks = Math.max(result.blocks, chunk.index + 1);
      return;
    case "input":
      result.toolUses.push({ name: result.toolNames.get(chunk.index) ?? "", input: JSON.parse(chunk.json) as unknown });
      result.blocks = Math.max(result.blocks, chunk.index + 1);
      return;
    case "stop":
      result.stop = chunk;
      return;
    default:
      return;
  }
}

function resultOf(e: TurnStepInput, result: Tally): TurnStepResult {
  return {
    turnId: e.turnId,
    index: e.index,
    answer: result.text,
    toolUses: result.toolUses,
    stopReason: result.stop?.stopReason ?? null,
    usage: result.stop?.usage ?? null,
  };
}

// Anything a routed step throws becomes one routed error. Unknown failures are internal.
function toRouted(name: string, error: unknown): RoutedError {
  if (error instanceof RoutedError) return error;
  if (error instanceof AnthropicRequestRefused || error instanceof AnthropicResponseRejected) return refusedError(error);
  if (error instanceof LoginError) {
    return classify(name, { kind: "named", error: error.code === "offline" ? "network" : "unauthenticated" });
  }
  if (error instanceof TransportFailure) return classify(name, { kind: "named", error: "network" });
  return classify(name, { kind: "named", error: "internal" });
}

export function createRouter(host: RouterHost, capture: ComposeCapture): Router {
  const services = createServices(host);
  const { catalog, credentials } = services;
  const transportFor = createTransportSelector({
    process: host.process,
    http: host.http,
    spawn: (request) => host.process.spawn(request),
  });
  let loaded: Promise<void> | undefined;
  let version: Promise<string> | undefined;
  const steps = new Map<string, Progress>();

  async function providerOf(model: string): Promise<ProviderPlugin | undefined> {
    const parsed = parseModelId(model);
    if (parsed === undefined) return undefined;
    loaded ??= catalog.load();
    await loaded;
    return catalog.providers().find((plugin) => plugin.identity.id === parsed.provider);
  }

  async function credentialFor(plugin: ProviderPlugin): Promise<Auth | undefined> {
    if (plugin.login.kind === "none") return undefined;
    const account = await catalog.activeAccount(plugin.identity.id);
    if (account === undefined) throw classify(plugin.identity.name, { kind: "named", error: "not_logged_in" });
    const auth = await resolveCredential({ http: host.http, credentials }, plugin, account);
    if (auth === undefined) throw classify(plugin.identity.name, { kind: "named", error: "not_logged_in" });
    return auth;
  }

  async function systemFor(model: string): Promise<string> {
    const rendered = await host.prompt.compose({ model });
    return rendered.sections.map((section) => section.text).join("\n\n");
  }

  async function remember(model: string, record: SpeedRecord): Promise<void> {
    try {
      const current = await host.store.get("metrics.speed");
      await host.store.set("metrics.speed", withSpeed(current, model, record));
      host.ui.log(
        `speed ${model}: first token ${record.ttftMs ?? "n/a"} ms, ${record.tokensPerSecond?.toFixed(1) ?? "n/a"} tokens/s`,
        { to: "debug" },
      );
    } catch {
      // A metric that cannot be stored never fails the answer.
    }
  }

  // The answer for a failed step: its message as text, then an end of turn. The
  // status line shows the error until a later step succeeds.
  async function* failure(
    e: TurnStepInput,
    name: string,
    error: unknown,
    signal: AbortSignal,
    blocks: number,
  ): AsyncGenerator<TurnStepChunk, TurnStepResult> {
    if (signal.aborted) return { turnId: e.turnId, index: e.index, answer: "", toolUses: [], stopReason: "end_turn", usage: null };
    const routed = toRouted(name, error);
    host.ui.status(errorStatusText(e.model, name, routed.kind));
    yield { kind: "text", index: blocks, text: routed.message };
    yield { kind: "stop", stopReason: "end_turn", usage: null };
    return { turnId: e.turnId, index: e.index, answer: routed.message, toolUses: [], stopReason: "end_turn", usage: null };
  }

  async function* routed(
    e: TurnStepInput,
    signal: AbortSignal,
    plugin: ProviderPlugin,
    progress: Progress,
  ): AsyncGenerator<TurnStepChunk, TurnStepResult> {
    const parsed = parseModelId(e.model);
    if (parsed === undefined) throw new Error("a routed model id names no provider");
    const name = plugin.identity.name;
    if (!catalog.isEnabled(plugin.identity.id)) throw classify(name, { kind: "named", error: "disabled" });

    const listed = catalog.models().find((model) => model.id === e.model);
    const metadata = metadataFor(e.model);
    const resolved: ResolvedWire =
      listed !== undefined
        ? { wire: listed.wire, baseUrl: listed.baseUrl }
        : plugin.wire(parsed.model, metadata?.wire);
    checkRequest({ provider: plugin.identity.id, model: e.model, baseUrl: resolved.baseUrl });

    const auth = await credentialFor(plugin);
    const platform = await services.platform();
    const sessionId = await host.session.id();
    const pluginVersion = (version ??= readPluginVersion(host.fs, host.pluginRoot()));
    const captured = capture.get(e.model);
    const system = captured?.system ?? (await systemFor(e.model));
    const listing = await host.tool.list();
    const messages = await host.session.messages({ agentId: e.agentId });
    if (!Array.isArray(messages)) throw classify(name, { kind: "named", error: "unreadable_context" });
    const turns = normalizeMessages(messages, { id: e.model, vision: listed?.vision ?? metadata?.vision ?? false });

    const offered = offeredTools(captured?.toolNames ?? listing.map((tool) => tool.name), listing);
    if (offered.skipped.length > 0) {
      host.ui.log(`routed request left out tools without a schema: ${offered.skipped.join(", ")}`, { to: "debug" });
    }

    const supported = listed?.reasoningEfforts ?? metadata?.reasoningEfforts;
    const effort = clamp(toEffort(e.effort), supported ?? []);
    const mapper: ReasoningMapper | undefined = metadata?.reasoningTransport;
    const maxOutput = listed?.maxOutput ?? metadata?.maxOutput;
    const request: RoutedRequest = {
      model: parsed.model,
      system,
      turns,
      tools: offered.tools,
      ...(effort === undefined ? {} : { reasoning: { effort, ...(mapper === undefined ? {} : { mapper }) } }),
      ...(maxOutput === undefined ? {} : { maxOutput }),
    };

    const adapter = WIRE_ADAPTERS[resolved.wire];
    const context: AdapterContext = {
      baseUrl: resolved.baseUrl,
      headers:
        plugin.identity.headers?.({ platform, accountId: auth?.accountId, version: await pluginVersion, sessionId }) ?? {},
      token: auth?.token,
      sessionId,
    };
    const spec = adapter.encode(request, context);
    if (new URL(spec.url).host !== new URL(resolved.baseUrl).host) {
      throw new Error("a routed request named a host other than the provider's");
    }

    const transport = await transportFor();
    const sentAt = Date.now();
    const response: TransportResponse = await transport.send(spec, signal);
    if (response.status < 200 || response.status >= 300) {
      let body = "";
      for await (const piece of response.body) body += piece;
      throw classify(name, { kind: "http", status: response.status, headers: response.headers, body });
    }

    const parser: StreamParser = adapter.parser();
    const gate = createGate(name, e.model, e.turnId, e.index);
    const result: Tally = { text: "", toolUses: [], toolNames: new Map(), stop: undefined, blocks: 0 };
    for await (const piece of response.body) {
      if (signal.aborted) return resultOf(e, result);
      for (const event of parser.push(piece)) {
        for (const chunk of gate.accept(event)) {
          tally(result, chunk);
          yield chunk;
          progress.blocks = result.blocks;
        }
      }
    }
    if (signal.aborted) return resultOf(e, result);
    for (const event of parser.end()) {
      for (const chunk of gate.accept(event)) {
        tally(result, chunk);
        yield chunk;
        progress.blocks = result.blocks;
      }
    }
    gate.finish();

    host.ui.status(statusText(e.model, thinkingOf(supported, effort)));
    await remember(
      e.model,
      speedOf({ sentAt, firstAt: gate.firstAt, endedAt: Date.now(), outputTokens: result.stop?.usage?.output_tokens }),
    );
    return resultOf(e, result);
  }

  return {
    async isRouted(model) {
      return (await providerOf(model)) !== undefined;
    },

    async *answer(e, signal) {
      const progress: Progress = { name: parseModelId(e.model)?.provider ?? e.model, blocks: 0 };
      const key = stepKey(e);
      steps.delete(key);
      steps.set(key, progress);
      for (const old of steps.keys()) {
        if (steps.size <= KEPT_STEPS) break;
        steps.delete(old);
      }
      // A chunk the engine refuses ends this generator at its yield, so the entry
      // is left for the `.catch` answer; every other ending removes it.
      let answered: TurnStepResult;
      try {
        const plugin = await providerOf(e.model);
        if (plugin === undefined) throw new Error("a routed step found no provider");
        progress.name = plugin.identity.name;
        answered = yield* routed(e, signal, plugin, progress);
      } catch (error) {
        answered = yield* failure(e, progress.name, error, signal, progress.blocks);
      }
      steps.delete(key);
      return answered;
    },

    async *fail(e, error) {
      const key = stepKey(e);
      const progress = steps.get(key);
      steps.delete(key);
      const name = await providerOf(e.model)
        .then((plugin) => plugin?.identity.name)
        .catch(() => undefined);
      return yield* failure(
        e,
        name ?? parseModelId(e.model)?.provider ?? e.model,
        error,
        new AbortController().signal,
        progress?.blocks ?? 0,
      );
    },
  };
}

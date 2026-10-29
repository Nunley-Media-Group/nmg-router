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
import { createRoutedView, type RoutedView } from "../compaction/routed-view.ts";
import { offeredToolNames, offeredTools } from "../tools/offered-tools.ts";
import { WIRE_ADAPTERS } from "../translate/adapters/index.ts";
import { createChunkMapper } from "../translate/chunks.ts";
import { normalizeMessages, type ApiMessageInput } from "../translate/messages.ts";
import { clamp, toEffort, type ReasoningMapper } from "../translate/reasoning.ts";
import type { AdapterContext, RoutedRequest, StreamEvent, StreamParser } from "../translate/types.ts";
import { createTransportSelector } from "../transport/select.ts";
import { TransportFailure, type TransportResponse } from "../transport/types.ts";
import { readPluginVersion } from "../version.ts";
import type { ComposeCapture } from "./compose-capture.ts";
import { MAIN_LOOP, createSessionTracker, type SessionTracker } from "./session-tracker.ts";
import { speedOf, withSpeed, type SpeedRecord } from "./metrics.ts";
import { renderStatus, thinkingOf, type RoutedStatus, type Thinking } from "./status.ts";
import { createUsageMonitor, type UsageMonitor } from "../usage/monitor.ts";
import type { StatusSnapshotWriter } from "../usage/status-snapshot.ts";

// Answers a routed model's turn step through the provider's wire. It sends one
// request, streams the reply back as engine chunks, and answers any failure with
// its message. It never calls `next`, so no step reaches Claude. `complete` sends
// the same guarded request outside a turn and returns the reply's text. A routed
// main-loop step sends the in-place summary's view of the transcript.

// The host calls the router makes. Each one is written literally in hooks/register.ts.
export type RouterHost = HostPort & {
  readonly ui: HostPort["ui"] & {
    status(text: string | undefined): void;
    ask(question: string, options: { readonly header: string; readonly options: readonly string[] }): Promise<string>;
  };
  readonly process: HostPort["process"] & {
    spawn(request: ProcessSpawnRequest): HookStream<ProcessSpawnChunk, ProcessSpawnResult>;
  };
  readonly session: {
    id(): Promise<string>;
    messages(args: { readonly agentId?: string }): Promise<ApiMessageInput[] | { readonly deny: string }>;
    // The model the session has selected, and its working directory.
    model(): Promise<string>;
    cwd(): Promise<string>;
    // Resolves an opaque handle or null. The mod reads only whether it is null.
    authorize(): Promise<unknown>;
  };
  readonly model: { classify(text: string, labels: readonly string[]): Promise<string | undefined> };
  readonly config: { list(): Promise<readonly { readonly key: string; readonly value: unknown }[]> };
  readonly clock: { after(ms: number, fn: () => void): unknown };
  readonly prompt: { compose(args: { readonly model: string }): Promise<PromptComposeResult> };
  readonly tool: { list(): Promise<ToolInfo[]> };
  readonly pluginRoot: () => string;
};

// What the router knows about a routed model for the hooks around a turn.
export type RoutedModelInfo = {
  readonly provider: string;
  readonly contextWindow: number | undefined;
  readonly maxOutput: number | undefined;
};

export type Router = {
  // True when the model's provider is in the catalog. A Claude model or alias never is,
  // and asking costs no call.
  isRouted(model: string): Promise<boolean>;
  // Notes the step's model for its loop. Called for every step, Claude's too.
  observe(e: TurnStepInput): void;
  // Called before a Claude step passes to `next`. A main-loop step clears the status line a routed step set.
  claudeStep(e: TurnStepInput): void;
  answer(e: TurnStepInput, signal: AbortSignal): AsyncGenerator<TurnStepChunk, TurnStepResult>;
  // The `.catch` path: a hook failed on a routed step, so its message is answered.
  fail(e: TurnStepInput, error: unknown): AsyncGenerator<TurnStepChunk, TurnStepResult>;
  // One request outside a turn. Resolves the reply's text and yields nothing to the engine. Throws a RoutedError.
  complete(model: string, request: RoutedRequest, signal: AbortSignal): Promise<string>;
  describe(model: string): Promise<RoutedModelInfo>;
};

type StopChunk = Extract<TurnStepChunk, { kind: "stop" }>;

// How far a routed step got: the provider's name and how many blocks the engine
// took. A failure answers in the next block, so its text never lands in a block
// already streamed.
type Progress = { name: string; blocks: number };

// Progress is kept per step until the step ends, so the `.catch` answer for a hook
// the engine failed mid-stream can read it. A few steps are kept, oldest dropped.
const KEPT_STEPS = 16;

// The turn id a summary request carries on its stream. A summary is not a turn.
const SUMMARY_TURN = "compaction";

function stepKey(e: TurnStepInput): string {
  return `${e.agentId ?? ""}:${e.turnId}:${e.index}`;
}

// The status snapshot never changes a step: a writer that throws is ignored.
function quietly(write: () => void): void {
  try {
    write();
  } catch {
    // The snapshot is best effort.
  }
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

// What a send needs from the host besides the request. Read after the request is checked.
type SendContext = {
  readonly auth: Auth | undefined;
  // The active account the auth belongs to. Undefined for a provider with no login.
  readonly account: string | undefined;
  readonly platform: string;
  readonly sessionId: string;
  readonly pluginVersion: string;
};

// The reply of one send: its tally, the send's start and first-token times, and
// whether the signal ended it early.
type Reply = {
  readonly tally: Tally;
  readonly aborted: boolean;
  readonly sentAt: number;
  readonly firstAt: number | undefined;
  // The response's headers, lowercase. A usage report may come from them.
  readonly headers: Readonly<Record<string, string>>;
};

export function createRouter(
  host: RouterHost,
  capture: ComposeCapture,
  tracker: SessionTracker = createSessionTracker(),
  view: RoutedView = createRoutedView(),
  monitor: UsageMonitor = createUsageMonitor(),
  snapshot?: StatusSnapshotWriter,
): Router {
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
  // What the status line shows: a routed step's state, until a Claude main-loop step clears it.
  let shown: RoutedStatus | undefined;
  // The session the shown state belongs to, for its snapshot. Undefined when the session id could not be read.
  let shownSessionId: string | undefined;

  async function providerOf(model: string): Promise<ProviderPlugin | undefined> {
    const parsed = parseModelId(model);
    if (parsed === undefined) return undefined;
    loaded ??= catalog.load();
    await loaded;
    return catalog.providers().find((plugin) => plugin.identity.id === parsed.provider);
  }

  // The active account's credential and the account it belongs to. A login-free provider has neither.
  async function credentialFor(
    plugin: ProviderPlugin,
  ): Promise<{ readonly auth: Auth | undefined; readonly account: string | undefined }> {
    if (plugin.login.kind === "none") return { auth: undefined, account: undefined };
    const account = await catalog.activeAccount(plugin.identity.id);
    if (account === undefined) throw classify(plugin.identity.name, { kind: "named", error: "not_logged_in" });
    const auth = await resolveCredential({ http: host.http, credentials }, plugin, account);
    if (auth === undefined) throw classify(plugin.identity.name, { kind: "named", error: "not_logged_in" });
    return { auth, account };
  }

  // The wire and base URL a model's requests use: the catalog's, else the provider's default.
  function wireOf(plugin: ProviderPlugin, model: string, providerModel: string) {
    const listed = catalog.models().find((entry) => entry.id === model);
    const metadata = metadataFor(model);
    const resolved: ResolvedWire =
      listed !== undefined
        ? { wire: listed.wire, baseUrl: listed.baseUrl }
        : plugin.wire(providerModel, metadata?.wire);
    return { listed, metadata, resolved };
  }

  // Checks the request, then reads what the send needs, in that order.
  async function contextFor(plugin: ProviderPlugin, model: string, resolved: ResolvedWire): Promise<SendContext> {
    checkRequest({ provider: plugin.identity.id, model, baseUrl: resolved.baseUrl });
    const { auth, account } = await credentialFor(plugin);
    const platform = await services.platform();
    const sessionId = await host.session.id();
    const pluginVersion = await (version ??= readPluginVersion(host.fs, host.pluginRoot()));
    return { auth, account, platform, sessionId, pluginVersion };
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

  // Encodes, sends and reads one reply, yielding each chunk once it passes the guard.
  // A routed step and a summary both send through here.
  async function* send(
    plugin: ProviderPlugin,
    model: string,
    request: RoutedRequest,
    resolved: ResolvedWire,
    context: SendContext,
    signal: AbortSignal,
    where: { readonly turnId: string; readonly index: number; readonly progress?: Progress },
  ): AsyncGenerator<TurnStepChunk, Reply> {
    const name = plugin.identity.name;
    const adapter = WIRE_ADAPTERS[resolved.wire];
    const adapterContext: AdapterContext = {
      baseUrl: resolved.baseUrl,
      headers:
        plugin.identity.headers?.({
          platform: context.platform,
          accountId: context.auth?.accountId,
          version: context.pluginVersion,
          sessionId: context.sessionId,
        }) ?? {},
      token: context.auth?.token,
      sessionId: context.sessionId,
    };
    const requested = plugin.requestModel?.(request.model) ?? request.model;
    const spec = adapter.encode({ ...request, model: requested }, adapterContext);
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
    const gate = createGate(name, model, where.turnId, where.index);
    const tallied: Tally = { text: "", toolUses: [], toolNames: new Map(), stop: undefined, blocks: 0 };
    const take = (chunk: TurnStepChunk): void => {
      tally(tallied, chunk);
      if (chunk.kind === "tool") tracker.recordToolId(chunk.id);
    };
    for await (const piece of response.body) {
      if (signal.aborted) return { tally: tallied, aborted: true, sentAt, firstAt: gate.firstAt, headers: response.headers };
      for (const event of parser.push(piece)) {
        for (const chunk of gate.accept(event)) {
          take(chunk);
          yield chunk;
          if (where.progress !== undefined) where.progress.blocks = tallied.blocks;
        }
      }
    }
    if (signal.aborted) return { tally: tallied, aborted: true, sentAt, firstAt: gate.firstAt, headers: response.headers };
    for (const event of parser.end()) {
      for (const chunk of gate.accept(event)) {
        take(chunk);
        yield chunk;
        if (where.progress !== undefined) where.progress.blocks = tallied.blocks;
      }
    }
    gate.finish();
    return { tally: tallied, aborted: false, sentAt, firstAt: gate.firstAt, headers: response.headers };
  }

  // The session's id for its snapshot. A host that cannot give it leaves the snapshot out, and the status line still shows.
  async function sessionOrUndefined(): Promise<string | undefined> {
    try {
      return await host.session.id();
    } catch {
      return undefined;
    }
  }

  // Sets the status line to a state, draws it, and publishes the state for a custom status-line command.
  function show(state: RoutedStatus, sessionId: string | undefined): void {
    shown = state;
    shownSessionId = sessionId;
    host.ui.status(renderStatus(state));
    if (sessionId !== undefined) quietly(() => snapshot?.show(sessionId, state.provider.id, state.model, state.usage));
  }

  // Shows a routed main-loop step's answer. Its usage is the step's own headers when they carry it, else the provider's
  // latest good report. A step whose headers carry none starts a reading in the background, which never holds the answer.
  function showStep(
    plugin: ProviderPlugin,
    model: string,
    thinking: Thinking,
    context: SendContext,
    headers: Readonly<Record<string, string>>,
  ): void {
    const id = plugin.identity.id;
    const { account } = context;
    const source = plugin.usage;
    const fromHeaders = source?.fromHeaders?.(headers);
    if (fromHeaders !== undefined) monitor.record(id, account, fromHeaders);
    show(
      { provider: { id, name: plugin.identity.name }, account, model, thinking, usage: monitor.latest(id, account) },
      context.sessionId,
    );
    if (source === undefined || fromHeaders !== undefined) return;
    void monitor
      .read(id, account, () => source.read(host, { platform: context.platform, auth: context.auth }))
      .then((outcome) => {
        if (outcome.kind !== "ok") host.ui.log(`${plugin.identity.name} usage unavailable: ${outcome.kind}`, { to: "debug" });
        redraw(id, account);
      })
      .catch(() => undefined);
  }

  // A reading that settles redraws the line only while it still shows the same provider and account, with no error,
  // and only when its good report changed. A failed reading leaves the line as it is.
  function redraw(provider: string, account: string | undefined): void {
    if (shown === undefined || shown.error !== undefined || shown.provider.id !== provider || shown.account !== account) return;
    const usage = monitor.latest(provider, account);
    if (usage === shown.usage) return;
    show({ ...shown, usage }, shownSessionId);
  }

  // The answer for a failed step: its message as text, then an end of turn. The
  // status line shows the error until a later routed step succeeds or a Claude
  // main-loop step clears it. A subagent's failure leaves the status line as it is.
  async function* failure(
    e: TurnStepInput,
    name: string,
    error: unknown,
    signal: AbortSignal,
    blocks: number,
  ): AsyncGenerator<TurnStepChunk, TurnStepResult> {
    if (signal.aborted) return { turnId: e.turnId, index: e.index, answer: "", toolUses: [], stopReason: "end_turn", usage: null };
    const routed = toRouted(name, error);
    if (e.agentId === undefined) {
      const provider = { id: parseModelId(e.model)?.provider ?? e.model, name };
      const sessionId = await sessionOrUndefined();
      show({ provider, account: undefined, model: e.model, error: routed.kind }, sessionId);
    }
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

    const { listed, metadata, resolved } = wireOf(plugin, e.model, parsed.model);
    const context = await contextFor(plugin, e.model, resolved);
    const captured = capture.get(e.model);
    const system = captured?.system ?? (await systemFor(e.model));
    const listing = await host.tool.list();
    // Never waits for a running summary: the wait would count against the turn.step hook's 10-second budget.
    const transcript = await host.session.messages({ agentId: e.agentId });
    if (!Array.isArray(transcript)) throw classify(name, { kind: "named", error: "unreadable_context" });
    const messages = e.agentId === undefined ? view.apply(MAIN_LOOP, transcript) : transcript;
    const turns = normalizeMessages(messages, { id: e.model, vision: listed?.vision ?? metadata?.vision ?? false });

    const names = offeredToolNames(captured?.toolNames ?? listing.map((tool) => tool.name), transcript, e.agentId);
    const offered = offeredTools(names, listing);
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

    const reply = yield* send(plugin, e.model, request, resolved, context, signal, {
      turnId: e.turnId,
      index: e.index,
      progress,
    });
    if (reply.aborted) return resultOf(e, reply.tally);

    // Only the main loop moves the status line; a subagent's steps leave it as it is.
    if (e.agentId === undefined) showStep(plugin, e.model, thinkingOf(supported, effort), context, reply.headers);
    const usage = reply.tally.stop?.usage;
    if (usage) tracker.recordUsage(e.agentId ?? MAIN_LOOP, usage);
    await remember(
      e.model,
      speedOf({ sentAt: reply.sentAt, firstAt: reply.firstAt, endedAt: Date.now(), outputTokens: usage?.output_tokens }),
    );
    return resultOf(e, reply.tally);
  }

  return {
    async isRouted(model) {
      return (await providerOf(model)) !== undefined;
    },

    observe(e) {
      tracker.recordStep(e.agentId ?? MAIN_LOOP, e.model);
    },

    claudeStep(e) {
      if (e.agentId !== undefined || shown === undefined) return;
      const sessionId = shownSessionId;
      shown = undefined;
      shownSessionId = undefined;
      host.ui.status(undefined);
      if (sessionId !== undefined) quietly(() => snapshot?.clear(sessionId));
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

    async complete(model, request, signal) {
      const plugin = await providerOf(model);
      if (plugin === undefined) throw classify(model, { kind: "named", error: "internal" });
      const name = plugin.identity.name;
      try {
        if (!catalog.isEnabled(plugin.identity.id)) throw classify(name, { kind: "named", error: "disabled" });
        const providerModel = parseModelId(model)?.model ?? model;
        const { resolved } = wireOf(plugin, model, providerModel);
        const context = await contextFor(plugin, model, resolved);
        const stream = send(plugin, model, request, resolved, context, signal, { turnId: SUMMARY_TURN, index: 0 });
        let text = "";
        for (;;) {
          const item = await stream.next();
          if (item.done === true) return text;
          if (item.value.kind === "text") text += item.value.text;
        }
      } catch (error) {
        throw toRouted(name, error);
      }
    },

    async describe(model) {
      const plugin = await providerOf(model);
      const listed = catalog.models().find((entry) => entry.id === model);
      const metadata = metadataFor(model);
      return {
        provider: plugin?.identity.name ?? parseModelId(model)?.provider ?? model,
        contextWindow: listed?.contextWindow ?? metadata?.contextWindow,
        maxOutput: listed?.maxOutput ?? metadata?.maxOutput,
      };
    },
  };
}

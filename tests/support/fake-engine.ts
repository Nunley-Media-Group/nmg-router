import type {
  CommandRunArgs,
  EngineInterface,
  HookStream,
  ProcessRunInit,
  ProcessRunResult,
  ProcessSpawnChunk,
  ProcessSpawnRequest,
  ProcessSpawnResult,
  PromptComposeResult,
  SessionCompactArgs,
  ToolInfo,
} from "claude-code";
import type { ApiMessageInput } from "../../src/translate/messages.ts";

export type FakePlatform = "macos" | "windows" | "linux" | "other";

export type FakeOptions = {
  readonly platform: FakePlatform;
  // An undefined value unsets a variable the platform defaults would set.
  readonly env?: Record<string, string | undefined>;
  readonly files?: Record<string, string>;
  // Return a result to override a command, or undefined to use the default.
  readonly run?: (argv: readonly string[]) => ProcessRunResult | undefined;
  // Answers a request by URL and method. Returning undefined means no route,
  // and the request fails as an unreachable host would.
  readonly http?: FakeHttpResponder;
  // The terminal's width, for the host's pane placement rule. Wide by default.
  readonly columns?: number;
  // The child a `process.spawn` call runs. Undefined means curl is absent.
  readonly spawn?: (request: ProcessSpawnRequest) => ScriptedChild | undefined;
  // `agents` holds each subagent's transcript, read by `messages({ agentId })`.
  readonly session?: { readonly id?: string; readonly messages?: ApiMessageInput[] | "deny"; readonly agents?: Record<string, ApiMessageInput[]> };
  // The model the session has selected, and its working directory.
  readonly selectedModel?: string;
  readonly cwd?: string;
  // What `$.session.authorize()` answers: a handle, or null for no first-party login.
  readonly authorize?: { readonly handle: string; readonly kind: "bearer" | "api-key" } | null;
  // What `$.model.classify` answers: a label, undefined for no label, or an Error it rejects with.
  readonly classify?: string | undefined | Error;
  // The rows `$.config.list()` answers, as the menu would draw them.
  readonly config?: readonly { readonly key: string; readonly value: unknown }[];
  // What `$.session.compact()` answers. Undefined means `{ messages: [] }`.
  readonly compact?: unknown;
  readonly compose?: PromptComposeResult;
  readonly tools?: readonly ToolInfo[];
  // The plugin's directory. Its manifest is read from `files`.
  readonly pluginRoot?: string;
};

// A scripted child: stdout pieces in order, then an exit code. `hang` keeps it
// running after its pieces, until `return()` ends it.
export type ScriptedChild = {
  readonly pieces: readonly string[];
  readonly code?: number;
  readonly hang?: boolean;
};

export type FakeHttpRequest = {
  readonly url: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string | undefined;
};

export type FakeHttpReply = {
  readonly status: number;
  readonly body?: unknown;
  readonly text?: string;
  // Lowercase header names, as the host returns them.
  readonly headers?: Record<string, string>;
};

export type FakeHttpResponder = (request: FakeHttpRequest) => FakeHttpReply | undefined;

export type FakePaneOpen = { readonly id: string; readonly title?: string; readonly focus?: boolean };

export type RecordedProcess = {
  readonly argv: string[];
  readonly env: Record<string, string> | undefined;
  readonly stdin: string | undefined;
};

export type Recorded = {
  readonly http: FakeHttpRequest[];
  readonly processes: RecordedProcess[];
  readonly fsWrites: { path: string; text: string }[];
  readonly storeWrites: { key: string; value: unknown }[];
  readonly settingsWrites: unknown[];
  readonly ui: string[];
  readonly panes: FakePaneOpen[];
  readonly paneCloses: string[];
  // Each element key the mod moved a pane's focus ring onto.
  readonly focus: string[];
  readonly telemetry: string[];
  readonly status: string[];
  readonly debug: string[];
  readonly commands: CommandRunArgs[];
  // Every process run and file write, in the order the code made them.
  readonly events: string[];
  // Each `$.session.compact` call's arguments, the `$.model.classify` calls and their
  // text and labels, the delays `$.clock.after` was given, and each `$.session.authorize` call.
  readonly compacts: (SessionCompactArgs | undefined)[];
  readonly classifications: { readonly text: string; readonly labels: readonly string[] }[];
  readonly timers: number[];
  authorizes: number;
};

export type FakeEngine = Pick<
  EngineInterface,
  "command" | "env" | "fs" | "http" | "process" | "session" | "settings" | "store" | "telemetry" | "ui"
> & {
  readonly recorded: Recorded;
  readonly model: { classify(text: string, labels: readonly string[]): Promise<string | undefined> };
  readonly config: { list(): Promise<readonly { readonly key: string; readonly value: unknown }[]> };
  readonly clock: { after(ms: number, fn: () => void): { cancel(): void } };
  // Runs a hook as the engine runs one for the person's command: a pane opened
  // before it settles is asked, and is placed at any width.
  asking<T>(run: () => T | Promise<T>): Promise<T>;
  // The pane id holding the keyboard, or undefined while the prompt has it.
  keyboard(): string | undefined;
  // Hands the keyboard back to the prompt, as the host does when a pane holds
  // nothing focusable or the person clicks the prompt.
  dropKeys(): void;
};

const HOME: Record<FakePlatform, string> = {
  macos: "/Users/tester",
  windows: "C:\\Users\\tester",
  linux: "/home/tester",
  other: "/home/tester",
};

function defaultEnv(platform: FakePlatform): Record<string, string> {
  if (platform === "windows") {
    return { OS: "Windows_NT", LOCALAPPDATA: "C:\\Users\\tester\\AppData\\Local", HOME: HOME.windows };
  }
  return { HOME: HOME[platform] };
}

function stdoutResult(stdout: string): ProcessRunResult {
  return { exitCode: 0, stdout, stderr: "", isStdoutTruncated: false, isStderrTruncated: false };
}

// Recording fakes for every noun the mod's storage code uses. Nothing here
// touches the real host: no network, no process, no disk.
export function fakeEngine(options: FakeOptions): FakeEngine {
  const recorded: Recorded = {
    http: [],
    processes: [],
    fsWrites: [],
    storeWrites: [],
    settingsWrites: [],
    ui: [],
    panes: [],
    paneCloses: [],
    focus: [],
    telemetry: [],
    status: [],
    debug: [],
    commands: [],
    events: [],
    compacts: [],
    classifications: [],
    timers: [],
    authorizes: 0,
  };
  const env: Record<string, string | undefined> = { ...defaultEnv(options.platform), ...options.env };
  const files = new Map<string, string>(Object.entries(options.files ?? {}));
  const kv = new Map<string, unknown>();
  const columns = options.columns ?? 200;
  let askingDepth = 0;
  const askedPanes = new Set<string>();
  let keysWith: string | undefined;
  const placedPanes = new Set<string>();

  function uname(): ProcessRunResult {
    const name = { macos: "Darwin", linux: "Linux", windows: "Windows_NT", other: "FreeBSD" }[options.platform];
    return stdoutResult(`${name}\n`);
  }

  async function run(argv: readonly string[], init?: ProcessRunInit): Promise<ProcessRunResult> {
    recorded.processes.push({ argv: [...argv], env: init?.env, stdin: init?.stdin });
    recorded.events.push(`process:${argv.join(" ")}`);
    const override = options.run?.(argv);
    if (override !== undefined) return override;
    if (argv[0] === "uname") return uname();
    if (argv[0] === "mkdir" || argv[0] === "chmod") return stdoutResult("");
    // Any other command is treated as absent, as a machine without that tool would report.
    throw new Error(`spawn ${argv[0]} ENOENT`);
  }

  // A child the script describes: its pieces arrive one at a time, and `return()`
  // ends it, as an abort does on the host.
  function spawnChild(script: ScriptedChild): HookStream<ProcessSpawnChunk, ProcessSpawnResult> {
    let index = 0;
    let finished = false;
    let wake: ((step: IteratorResult<ProcessSpawnChunk, ProcessSpawnResult>) => void) | undefined;
    const killed: IteratorResult<ProcessSpawnChunk, ProcessSpawnResult> = { done: true, value: { code: null, signal: "SIGTERM" } };
    const stream = {
      async next(): Promise<IteratorResult<ProcessSpawnChunk, ProcessSpawnResult>> {
        if (finished) return { done: true, value: { code: null, signal: null } };
        if (index < script.pieces.length) {
          const text = script.pieces[index] ?? "";
          index += 1;
          recorded.events.push(`child:piece:${index}`);
          return { done: false, value: { stream: "stdout", text } };
        }
        if (script.hang === true) return new Promise((resolve) => (wake = resolve));
        finished = true;
        recorded.events.push("child:exit");
        return { done: true, value: { code: script.code ?? 0, signal: null } };
      },
      async return(): Promise<IteratorResult<ProcessSpawnChunk, ProcessSpawnResult>> {
        recorded.events.push("child:killed");
        finished = true;
        wake?.(killed);
        return killed;
      },
      [Symbol.asyncIterator]() {
        return stream;
      },
    };
    return stream as unknown as HookStream<ProcessSpawnChunk, ProcessSpawnResult>;
  }

  const engine = {
    recorded,
    asking: async <T>(run: () => T | Promise<T>): Promise<T> => {
      askingDepth += 1;
      try {
        return await run();
      } finally {
        askingDepth -= 1;
      }
    },
    keyboard: () => keysWith,
    dropKeys: () => {
      keysWith = undefined;
    },
    command: {
      run: async (input: CommandRunArgs) => {
        recorded.commands.push(input);
        return {};
      },
    },
    env: {
      get: async (name: string) => env[name],
      set: async () => ({}),
    },
    fs: {
      exists: async (path: string) => files.has(path),
      read: async (path: string) => {
        const text = files.get(path);
        if (text === undefined) throw new Error(`ENOENT: ${path}`);
        return text;
      },
      write: async (path: string, text: string) => {
        files.set(path, text);
        recorded.fsWrites.push({ path, text });
        recorded.events.push(`write:${path}`);
      },
    },
    process: {
      run,
      spawn: (request: ProcessSpawnRequest) => {
        recorded.processes.push({ argv: [...request.argv], env: request.env, stdin: request.input });
        recorded.events.push(`process:${request.argv.join(" ")}`);
        const script = options.spawn?.(request);
        if (script === undefined) throw new Error(`spawn ${request.argv[0]} ENOENT`);
        return spawnChild(script);
      },
    },
    http: {
      fetch: async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
        const request: FakeHttpRequest = {
          url,
          method: init?.method ?? "GET",
          headers: { ...init?.headers },
          body: init?.body,
        };
        recorded.http.push(request);
        const reply = options.http?.(request);
        if (reply === undefined) throw new Error("fake engine: no network");
        const text = reply.text ?? (reply.body === undefined ? "" : JSON.stringify(reply.body));
        return { status: reply.status, ok: reply.status >= 200 && reply.status < 300, headers: { ...reply.headers }, text };
      },
    },
    store: {
      get: async (key: string) => kv.get(key),
      set: async (key: string, value: unknown) => {
        const copy: unknown = JSON.parse(JSON.stringify(value));
        kv.set(key, copy);
        recorded.storeWrites.push({ key, value: copy });
      },
      delete: async (key: string) => {
        kv.delete(key);
      },
      keys: async () => [...kv.keys()],
    },
    settings: {
      read: async () => ({}),
    },
    session: {
      id: async () => options.session?.id ?? "session-test",
      messages: async (args?: { agentId?: string }) =>
        args?.agentId === undefined ? (options.session?.messages ?? []) : (options.session?.agents?.[args.agentId] ?? []),
      model: async () => options.selectedModel ?? "claude-sonnet-5-5",
      cwd: async () => options.cwd ?? "/work/project",
      // Counted, and answered as the host does: the handle, or null with no login.
      authorize: async () => {
        recorded.authorizes += 1;
        return options.authorize ?? null;
      },
      compact: async (input?: SessionCompactArgs) => {
        recorded.compacts.push(input);
        return options.compact ?? { messages: [] };
      },
    },
    model: {
      classify: async (text: string, labels: readonly string[]) => {
        recorded.classifications.push({ text, labels: [...labels] });
        if (options.classify instanceof Error) throw options.classify;
        return options.classify;
      },
    },
    config: { list: async () => [...(options.config ?? [])] },
    // A timer runs its callback on the next macrotask, which the tests wait for.
    clock: {
      after: (ms: number, fn: () => void) => {
        recorded.timers.push(ms);
        const timer = setTimeout(fn, 0);
        return { cancel: () => clearTimeout(timer) };
      },
    },
    plugin: { name: "nmg-router", root: options.pluginRoot ?? "/plugin" },
    prompt: {
      compose: async () => options.compose ?? { sections: [] },
    },
    tool: {
      list: async () => [...(options.tools ?? [])],
    },
    ui: {
      log: (text: string, logOptions?: { readonly to: "debug" | "transcript" }) => {
        if (logOptions?.to === "debug") recorded.debug.push(text);
        else recorded.ui.push(text);
      },
      status: (text: string | undefined) => {
        recorded.status.push(text ?? "");
      },
      toast: (text: string) => {
        recorded.ui.push(text);
      },
      // The host's rule: an open answering the person is placed at any width; one
      // the plugin makes on its own waits below 144 columns, 110 once asked for.
      // Opening a pane that is already placed only retitles it.
      open: async (pane: FakePaneOpen) => {
        recorded.panes.push(pane);
        if (askingDepth > 0) askedPanes.add(pane.id);
        const floor = askedPanes.has(pane.id) ? 110 : 144;
        if (askingDepth > 0 || columns >= floor || placedPanes.has(pane.id)) {
          placedPanes.add(pane.id);
          // `focus` is granted here: the fake prompt is always idle and empty.
          if (pane.focus === true) keysWith = pane.id;
          return { isPlaced: true };
        }
        return { isPlaced: false, reason: `unasked below ${floor} columns (${columns} now)` };
      },
      close: async (pane: { id: string }) => {
        recorded.paneCloses.push(pane.id);
        placedPanes.delete(pane.id);
        if (keysWith === pane.id) keysWith = undefined;
      },
      // As the host: only a site holding the keyboard moves its ring.
      focus: async (args: { requestId: string; key: string }) => {
        if (keysWith !== args.requestId) return { deny: "the site holds no keyboard" };
        recorded.focus.push(args.key);
        return {};
      },
      invalidate: () => undefined,
    },
    telemetry: {
      log: async (entry: unknown) => {
        recorded.telemetry.push(JSON.stringify(entry));
      },
      mark: async (entry: unknown) => {
        recorded.telemetry.push(JSON.stringify(entry));
      },
    },
  };

  return engine as unknown as FakeEngine;
}

// The files a test has written, by path, for asserting what landed on disk.
export function writtenText(engine: FakeEngine, path: string): string | undefined {
  return engine.recorded.fsWrites.filter((write) => write.path === path).at(-1)?.text;
}

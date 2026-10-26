import type { CommandRunArgs, EngineInterface, ProcessRunInit, ProcessRunResult } from "claude-code";

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
  readonly commands: CommandRunArgs[];
  // Every process run and file write, in the order the code made them.
  readonly events: string[];
};

export type FakeEngine = Pick<
  EngineInterface,
  "command" | "env" | "fs" | "http" | "process" | "session" | "settings" | "store" | "telemetry" | "ui"
> & {
  readonly recorded: Recorded;
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
    commands: [],
    events: [],
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
      spawn: () => {
        throw new Error("fake engine: process.spawn is not modelled");
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
        return { status: reply.status, ok: reply.status >= 200 && reply.status < 300, headers: {}, text };
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
    session: {},
    ui: {
      log: (text: string) => {
        recorded.ui.push(text);
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

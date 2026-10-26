import type { EngineInterface, ProcessRunInit, ProcessRunResult } from "claude-code";

export type FakePlatform = "macos" | "windows" | "linux" | "other";

export type FakeOptions = {
  readonly platform: FakePlatform;
  // An undefined value unsets a variable the platform defaults would set.
  readonly env?: Record<string, string | undefined>;
  readonly files?: Record<string, string>;
  // Return a result to override a command, or undefined to use the default.
  readonly run?: (argv: readonly string[]) => ProcessRunResult | undefined;
};

export type RecordedProcess = {
  readonly argv: string[];
  readonly env: Record<string, string> | undefined;
  readonly stdin: string | undefined;
};

export type Recorded = {
  readonly http: { url: string }[];
  readonly processes: RecordedProcess[];
  readonly fsWrites: { path: string; text: string }[];
  readonly storeWrites: { key: string; value: unknown }[];
  readonly settingsWrites: unknown[];
  readonly ui: string[];
  readonly telemetry: string[];
  // Every process run and file write, in the order the code made them.
  readonly events: string[];
};

export type FakeEngine = Pick<
  EngineInterface,
  "env" | "fs" | "http" | "process" | "session" | "settings" | "store" | "telemetry" | "ui"
> & { readonly recorded: Recorded };

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
    telemetry: [],
    events: [],
  };
  const env: Record<string, string | undefined> = { ...defaultEnv(options.platform), ...options.env };
  const files = new Map<string, string>(Object.entries(options.files ?? {}));
  const kv = new Map<string, unknown>();

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
      fetch: async (url: string) => {
        recorded.http.push({ url });
        throw new Error("fake engine: no network");
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

import type { EngineInterface, ProcessRunInit, ProcessRunResult } from "claude-code";

export type FakePlatform = "macos" | "windows" | "linux" | "other";

// `working` answers as a healthy keyring. `absent` has no keyring tool at all,
// so the tool cannot start. `locked` and `failing` are the two refusals.
export type KeyringState = "working" | "locked" | "failing" | "absent";

export type FakeOptions = {
  readonly platform: FakePlatform;
  readonly keyring?: KeyringState;
  // An undefined value unsets a variable the platform defaults would set.
  readonly env?: Record<string, string | undefined>;
  readonly files?: Record<string, string>;
  // Return a result to override a command, or undefined to use the default.
  readonly run?: (argv: readonly string[]) => ProcessRunResult | undefined;
  // Answers a request by URL and method. Returning undefined means no route,
  // and the request fails as an unreachable host would.
  readonly http?: FakeHttpResponder;
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
  const env: Record<string, string> = { HOME: HOME[platform] };
  if (platform === "linux") env.DBUS_SESSION_BUS_ADDRESS = "unix:path=/run/user/501/bus";
  return env;
}

function stdoutResult(stdout: string): ProcessRunResult {
  return { exitCode: 0, stdout, stderr: "", isStdoutTruncated: false, isStderrTruncated: false };
}

function failure(exitCode: number, stderr = ""): ProcessRunResult {
  return { exitCode, stdout: "", stderr, isStdoutTruncated: false, isStderrTruncated: false };
}

function hexDecode(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return new TextDecoder().decode(bytes);
}

function argAfter(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

// One simulated keyring per fake engine, keyed by account (macOS and Linux) or
// by target (Windows). Each platform's tool is answered as the real one would be.
function keyringRun(
  platform: FakePlatform,
  state: KeyringState,
  store: Map<string, string>,
  argv: readonly string[],
  stdin: string | undefined,
): ProcessRunResult {
  if (state === "absent") throw new Error(`spawn ${argv[0]} ENOENT`);
  if (platform === "macos" && argv[0] === "security") {
    if (state === "locked") return failure(36, "User interaction is not allowed.");
    if (state === "failing") return failure(1, "SecKeychain internal failure");
    if (argv[1] === "-i") {
      const match = /^add-generic-password -U -s \S+ -a (\S+) -X ([0-9a-f]+)\s*$/m.exec(stdin ?? "");
      if (!match) return failure(1, "unparsed command");
      store.set(match[1] ?? "", hexDecode(match[2] ?? ""));
      return stdoutResult("");
    }
    const account = argAfter(argv, "-a") ?? "";
    if (argv[1] === "find-generic-password") {
      const secret = store.get(account);
      return secret === undefined ? failure(44) : stdoutResult(`${secret}\n`);
    }
    if (argv[1] === "delete-generic-password") {
      if (!store.has(account)) return failure(44);
      store.delete(account);
      return stdoutResult("");
    }
  }
  if (platform === "linux" && argv[0] === "secret-tool") {
    if (state === "locked") return failure(1, "Cannot unlock: the keyring was dismissed");
    if (state === "failing") return failure(3, "secret-tool: unexpected failure");
    const account = argAfter(argv, "account") ?? "";
    if (argv[1] === "store") {
      store.set(account, stdin ?? "");
      return stdoutResult("");
    }
    if (argv[1] === "lookup") {
      const secret = store.get(account);
      return secret === undefined ? failure(1) : stdoutResult(secret);
    }
    if (argv[1] === "clear") {
      store.delete(account);
      return stdoutResult("");
    }
  }
  if (platform === "windows" && argv[0] === "powershell.exe") {
    if (state === "locked" || state === "failing") return failure(1, "credential manager failure");
    const mode = /\$mode = '(\w+)'/.exec(stdin ?? "")?.[1];
    const target = /\$target = '([^']*)'/.exec(stdin ?? "")?.[1] ?? "";
    const blob = /\$blob = '([^']*)'/.exec(stdin ?? "")?.[1] ?? "";
    if (mode === "write") {
      store.set(target, blob);
      return stdoutResult("");
    }
    if (mode === "read") {
      const stored = store.get(target);
      return stored === undefined ? failure(2) : stdoutResult(stored);
    }
    if (mode === "delete") {
      if (!store.has(target)) return failure(2);
      store.delete(target);
      return stdoutResult("");
    }
  }
  throw new Error(`spawn ${argv[0]} ENOENT`);
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
    telemetry: [],
    events: [],
  };
  const env: Record<string, string | undefined> = { ...defaultEnv(options.platform), ...options.env };
  const files = new Map<string, string>(Object.entries(options.files ?? {}));
  const kv = new Map<string, unknown>();
  const keyrings = new Map<string, string>();
  const keyringState = options.keyring ?? "working";

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
    return keyringRun(options.platform, keyringState, keyrings, argv, init?.stdin);
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
      open: async (pane: FakePaneOpen) => {
        recorded.panes.push(pane);
        return { isPlaced: true };
      },
      close: async (pane: { id: string }) => {
        recorded.paneCloses.push(pane.id);
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

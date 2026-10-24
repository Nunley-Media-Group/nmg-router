import type { ProcessRunInit, ProcessRunResult } from "claude-code";

export type FakeOs = "macos" | "windows" | "linux" | "freebsd";
export type FakeKeyring = "working" | "locked" | "failing" | "absent";

export interface FakeEngineOptions {
  os?: FakeOs;
  keyring?: FakeKeyring;
  env?: Record<string, string>;
}

export interface FakeEngine {
  process: { run(argv: readonly string[], init?: ProcessRunInit): Promise<ProcessRunResult> };
  env: { get(name: string): Promise<string | undefined>; set(name: string, value: string | undefined): Promise<object> };
  fs: {
    read(path: string): Promise<string>;
    write(path: string, text: string): Promise<void>;
    exists(path: string): Promise<boolean>;
  };
  store: { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void> };
  ui: { log(text: string): void; notice(id: string, text: string | undefined): void; status(text: string | undefined): void };
  telemetry: { log(entry: unknown): Promise<void>; mark(entry: unknown): Promise<void> };
  session: { messages(): Promise<readonly unknown[]> };
  http: { fetch(url: string): Promise<never> };
  /** Recorded `$.process.run` calls: argv and env only; stdin is kept apart on purpose. */
  calls: { argv: readonly string[]; env: Record<string, string> | undefined }[];
  /** Stdin of each `$.process.run` call; a secret may travel here and nowhere else. */
  stdins: string[];
  /** Ordered record of process runs and file writes, for ordering assertions. */
  timeline: string[];
  /** Text the host would show or record: UI and telemetry output. */
  texts: string[];
  /** The fake keyring's contents, keyed by `<provider>/<account>`. */
  keyring: Map<string, string>;
  files: Map<string, string>;
  values: Map<string, unknown>;
  httpCalls: string[];
}

const DEFAULT_ENV: Record<FakeOs, Record<string, string>> = {
  macos: { HOME: "/Users/tester" },
  windows: { OS: "Windows_NT", LOCALAPPDATA: "C:\\Users\\tester\\AppData\\Local" },
  linux: { HOME: "/home/tester", DBUS_SESSION_BUS_ADDRESS: "unix:path=/run/user/1000/bus" },
  freebsd: { HOME: "/home/tester" },
};

const UNAME: Record<FakeOs, string> = { macos: "Darwin", windows: "", linux: "Linux", freebsd: "FreeBSD" };
const LOCKED_STDERR = "User interaction is not allowed.";
const FAILING_STDERR = "keychain exploded: STDERR-MARKER";

function result(exitCode: number, stdout = "", stderr = ""): ProcessRunResult {
  return { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false };
}

function accountAfter(argv: readonly string[], flag: string): string {
  const index = argv.indexOf(flag);
  return index === -1 ? "" : (argv[index + 1] ?? "");
}

export function fakeEngine(options: FakeEngineOptions = {}): FakeEngine {
  const os = options.os ?? "macos";
  const mode = options.keyring ?? "working";
  const env: Record<string, string> = { ...DEFAULT_ENV[os], ...options.env };
  const engine: FakeEngine = {
    calls: [],
    stdins: [],
    timeline: [],
    texts: [],
    keyring: new Map(),
    files: new Map(),
    values: new Map(),
    httpCalls: [],
    process: {
      async run(argv, init) {
        engine.calls.push({ argv: [...argv], env: init?.env });
        engine.stdins.push(init?.stdin ?? "");
        engine.timeline.push(`run:${argv.join(" ")}`);
        const [tool] = argv;
        if (tool === "uname") {
          return result(0, `${UNAME[os]}\n`);
        }
        if (tool === "mkdir" || tool === "chmod") {
          return result(0);
        }
        if (tool === "security" || tool === "powershell.exe" || tool === "secret-tool") {
          if (mode === "absent") {
            throw new Error(`spawn ${tool} ENOENT`);
          }
          return keyringTool(argv, init?.stdin ?? "");
        }
        throw new Error(`not faked: ${tool}`);
      },
    },
    env: {
      async get(name) {
        return env[name];
      },
      async set(name, value) {
        if (value === undefined) {
          delete env[name];
        } else {
          env[name] = value;
        }
        return {};
      },
    },
    fs: {
      async read(path) {
        const text = engine.files.get(path);
        if (text === undefined) {
          throw new Error(`ENOENT: ${path}`);
        }
        return text;
      },
      async write(path, text) {
        engine.timeline.push(`write:${path}`);
        engine.files.set(path, text);
      },
      async exists(path) {
        return engine.files.has(path);
      },
    },
    store: {
      async get(key) {
        return engine.values.has(key) ? JSON.parse(JSON.stringify(engine.values.get(key))) : undefined;
      },
      async set(key, value) {
        engine.values.set(key, JSON.parse(JSON.stringify(value)));
      },
    },
    ui: {
      log(text) {
        engine.texts.push(text);
      },
      notice(id, text) {
        engine.texts.push(`${id} ${text ?? ""}`);
      },
      status(text) {
        engine.texts.push(text ?? "");
      },
    },
    telemetry: {
      async log(entry) {
        engine.texts.push(JSON.stringify(entry));
      },
      async mark(entry) {
        engine.texts.push(JSON.stringify(entry));
      },
    },
    session: {
      async messages() {
        return [];
      },
    },
    http: {
      async fetch(url) {
        engine.httpCalls.push(url);
        throw new Error("fake http: no network");
      },
    },
  };

  // Simulates the keyring tool named by argv: the real command lines the backends build.
  function keyringTool(argv: readonly string[], stdin: string): ProcessRunResult {
    const [tool, verb] = argv;
    if (tool === "security") {
      if (verb === "list-keychains") {
        return result(0);
      }
      if (mode === "locked") {
        return result(36, "", LOCKED_STDERR);
      }
      if (mode === "failing") {
        return result(1, "", FAILING_STDERR);
      }
      if (verb === "-i") {
        const match = /-a (\S+) -X ([0-9a-f]+)/.exec(stdin);
        engine.keyring.set(match?.[1] ?? "", Buffer.from(match?.[2] ?? "", "hex").toString("utf8"));
        return result(0);
      }
      const account = accountAfter(argv, "-a");
      const secret = engine.keyring.get(account);
      if (verb === "find-generic-password") {
        return secret === undefined ? result(44) : result(0, `${secret}\n`);
      }
      const existed = engine.keyring.delete(account);
      return existed ? result(0) : result(44);
    }
    if (tool === "secret-tool") {
      if (verb === "lookup" && accountAfter(argv, "account").endsWith("/probe")) {
        return result(1);
      }
      if (mode === "locked") {
        return result(1, "", "Cannot unlock: the keyring is locked");
      }
      if (mode === "failing") {
        return result(2, "", FAILING_STDERR);
      }
      const account = accountAfter(argv, "account");
      if (verb === "store") {
        engine.keyring.set(account, stdin);
        return result(0);
      }
      if (verb === "lookup") {
        const secret = engine.keyring.get(account);
        return secret === undefined ? result(1) : result(0, secret);
      }
      engine.keyring.delete(account);
      return result(0);
    }
    // powershell.exe: the script names its operation by the native call it makes.
    if (mode === "locked" || mode === "failing") {
      return result(3, "", FAILING_STDERR);
    }
    const target = /\$target = '([^']+)'/.exec(stdin)?.[1];
    if (target === undefined) {
      return result(0);
    }
    const account = target.replace(/^nmg-router:/, "");
    if (stdin.includes("CredWrite([ref]")) {
      const encoded = /FromBase64String\('([^']+)'\)/.exec(stdin)?.[1] ?? "";
      engine.keyring.set(account, Buffer.from(encoded, "base64").toString("utf8"));
      return result(0);
    }
    const secret = engine.keyring.get(account);
    if (stdin.includes("CredRead($target")) {
      return secret === undefined ? result(2) : result(0, Buffer.from(secret, "utf8").toString("base64"));
    }
    if (secret === undefined) {
      return result(2);
    }
    engine.keyring.delete(account);
    return result(0);
  }

  return engine;
}

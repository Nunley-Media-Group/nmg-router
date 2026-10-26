import type { HttpResponse, PaneCloseArgs, PaneOpenArgs, ProcessRunInit, ProcessRunResult, UiOpenResult } from "claude-code";

// The host calls the mod makes, as plain functions. The hooks module builds one
// port per command, and each function calls the host at its call site, so the
// host never sees one of its nouns passed as a value. The engine's own nouns
// satisfy this shape structurally, so tests pass a fake engine directly.

export type HostPort = {
  readonly env: {
    get(name: string): Promise<string | undefined>;
  };
  readonly fs: {
    exists(path: string): Promise<boolean>;
    read(path: string): Promise<string>;
    write(path: string, text: string): Promise<void>;
  };
  readonly http: {
    fetch(url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<HttpResponse>;
  };
  readonly process: {
    run(argv: readonly string[], init?: ProcessRunInit): Promise<ProcessRunResult>;
  };
  readonly store: {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
    delete(key: string): Promise<void>;
  };
  readonly ui: {
    log(text: string): void;
    open(args: PaneOpenArgs): Promise<UiOpenResult>;
    close(args: PaneCloseArgs): Promise<void>;
    invalidate(event: "ui.render"): void;
  };
};

import type { EngineInterface, ProcessRunResult } from "claude-code";
import { CredentialError } from "../errors/errors.ts";

export type Platform = "macos" | "windows" | "linux" | "other";

export const SERVICE = "nmg-router";

export interface CredentialHost {
  process: Pick<EngineInterface["process"], "run">;
  env: Pick<EngineInterface["env"], "get">;
  fs: Pick<EngineInterface["fs"], "exists" | "write"> & { read(path: string): Promise<string> };
  store: Pick<EngineInterface["store"], "get" | "set">;
}

export interface CredentialBackend {
  save(provider: string, account: string, secret: string): Promise<void>;
  read(provider: string, account: string): Promise<string | undefined>;
  delete(provider: string, account: string): Promise<void>;
}

export interface KeyringBackend extends CredentialBackend {
  available(): Promise<boolean>;
}

export async function detectPlatform(host: Pick<CredentialHost, "process" | "env">): Promise<Platform> {
  if ((await host.env.get("OS")) === "Windows_NT") {
    return "windows";
  }
  let uname: ProcessRunResult;
  try {
    uname = await host.process.run(["uname", "-s"]);
  } catch {
    return "other";
  }
  const name = uname.stdout.trim();
  if (uname.exitCode === 0 && name === "Darwin") {
    return "macos";
  }
  if (uname.exitCode === 0 && name === "Linux") {
    return "linux";
  }
  return "other";
}

// Resolves to undefined when the tool cannot start: no keyring on this host.
export async function probeTool(
  host: Pick<CredentialHost, "process">,
  argv: readonly string[],
  stdin?: string,
): Promise<ProcessRunResult | undefined> {
  try {
    return await host.process.run(argv, stdin === undefined ? undefined : { stdin });
  } catch {
    return undefined;
  }
}

// A keyring tool that was found but cannot run is a failure, never a fallback to the vault.
export async function runKeyring(
  host: Pick<CredentialHost, "process">,
  platform: Platform,
  provider: string,
  argv: readonly string[],
  stdin?: string,
): Promise<ProcessRunResult> {
  const result = await probeTool(host, argv, stdin);
  if (result === undefined) {
    throw new CredentialError("keyring_failed", provider, platform);
  }
  return result;
}

export function assertKeyringOk(
  result: ProcessRunResult,
  platform: Platform,
  provider: string,
  isLocked: (result: ProcessRunResult) => boolean,
): void {
  if (result.exitCode === 0) {
    return;
  }
  if (isLocked(result)) {
    throw new CredentialError("keyring_locked", provider, platform);
  }
  throw new CredentialError("keyring_failed", provider, platform, result.exitCode);
}

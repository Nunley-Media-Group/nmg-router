import type { ProcessRunResult } from "claude-code";
import { CredentialError, NoKeyringError } from "../errors/errors.ts";
import type { HostPort } from "../host.ts";

export type Platform = "macos" | "windows" | "linux" | "other";

export type ProcessDeps = Pick<HostPort, "process">;
export type PlatformDeps = Pick<HostPort, "env" | "process">;

// One backend per storage location. Each call receives the provider and the
// account separately; the secret is only ever handed over on stdin.
export type CredentialBackend = {
  save(provider: string, account: string, secret: string): Promise<void>;
  read(provider: string, account: string): Promise<string | undefined>;
  delete(provider: string, account: string): Promise<void>;
};

export const KEYRING_SERVICE = "nmg-router";

export function accountKey(provider: string, account: string): string {
  return `${provider}/${account}`;
}

export async function detectPlatform(deps: PlatformDeps): Promise<Platform> {
  if ((await deps.env.get("OS")) === "Windows_NT") return "windows";
  try {
    const { exitCode, stdout } = await deps.process.run(["uname", "-s"]);
    const name = stdout.trim();
    if (exitCode === 0 && name === "Darwin") return "macos";
    if (exitCode === 0 && name === "Linux") return "linux";
  } catch {
    // uname did not start, so the platform is unknown and the vault is used.
  }
  return "other";
}

// `$.process.run` rejects when a command cannot start, and when it runs past
// its timeout. Only a command that never started means "no keyring". A hung
// keyring is a failing keyring, and it must never fall back to the vault.
function isMissingTool(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return /ENOENT|cannot start|no such file/i.test(text);
}

export async function runKeyringTool(
  deps: ProcessDeps,
  platform: string,
  provider: string,
  argv: readonly string[],
  stdin?: string,
): Promise<ProcessRunResult> {
  try {
    return await deps.process.run(argv, stdin === undefined ? undefined : { stdin });
  } catch (error) {
    if (isMissingTool(error)) throw new NoKeyringError(platform);
    throw new CredentialError("keyring_failed", { platform, provider });
  }
}

// Stderr is never copied into the error: it can echo the secret or the account.
export function keyringError(
  platform: string,
  provider: string,
  result: ProcessRunResult,
  locked: boolean,
): CredentialError {
  return new CredentialError(locked ? "keyring_locked" : "keyring_failed", {
    platform,
    provider,
    exitCode: result.exitCode,
  });
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

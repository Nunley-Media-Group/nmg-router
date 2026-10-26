import type { HostPort } from "../host.ts";

export type Platform = "macos" | "windows" | "linux" | "other";

export type PlatformDeps = Pick<HostPort, "env" | "process">;

// One backend per storage location. Each call receives the provider and the
// account separately.
export type CredentialBackend = {
  save(provider: string, account: string, secret: string): Promise<void>;
  read(provider: string, account: string): Promise<string | undefined>;
  delete(provider: string, account: string): Promise<void>;
};

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

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

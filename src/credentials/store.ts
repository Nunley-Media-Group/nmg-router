import type { EngineInterface } from "claude-code";
import { isAnthropicProvider } from "../gateway/anthropic.ts";
import { CredentialError, NoKeyringError } from "../errors/errors.ts";
import { createLinuxKeyring } from "./keyring-linux.ts";
import { createMacosKeyring } from "./keyring-macos.ts";
import { createWindowsKeyring } from "./keyring-windows.ts";
import { detectPlatform, type CredentialBackend, type Platform } from "./platform.ts";
import { createVault } from "./vault.ts";

export type CredentialStoreDeps = Pick<EngineInterface, "env" | "fs" | "process" | "store">;

export type StoredCredential = { readonly provider: string; readonly account: string };

export type CredentialStore = {
  save(provider: string, account: string, secret: string): Promise<void>;
  read(provider: string, account: string): Promise<string | undefined>;
  delete(provider: string, account: string): Promise<void>;
  list(provider?: string): Promise<StoredCredential[]>;
};

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const INDEX_KEY = "credentials.index";

function assertIds(provider: string, account: string): void {
  if (!ID_PATTERN.test(provider) || !ID_PATTERN.test(account)) {
    throw new CredentialError("invalid_id");
  }
}

function refuseAnthropic(provider: string): void {
  if (isAnthropicProvider(provider)) throw new CredentialError("anthropic_refused");
}

function keyringFor(platform: Platform, deps: CredentialStoreDeps): CredentialBackend | undefined {
  switch (platform) {
    case "macos":
      return createMacosKeyring(deps);
    case "windows":
      return createWindowsKeyring(deps);
    case "linux":
      return createLinuxKeyring(deps);
    case "other":
      return undefined;
  }
}

// Uses the keyring when the platform has one. A keyring that reports no service
// moves the store to the vault for the rest of its life. A locked or failing
// keyring raises its error and never reaches the vault.
function routeThrough(keyring: CredentialBackend | undefined, vault: CredentialBackend): CredentialBackend {
  let useVault = keyring === undefined;

  async function call<T>(operation: (backend: CredentialBackend) => Promise<T>): Promise<T> {
    if (!useVault && keyring !== undefined) {
      try {
        return await operation(keyring);
      } catch (error) {
        if (!(error instanceof NoKeyringError)) throw error;
        useVault = true;
      }
    }
    return operation(vault);
  }

  return {
    save: (provider, account, secret) => call((backend) => backend.save(provider, account, secret)),
    read: (provider, account) => call((backend) => backend.read(provider, account)),
    delete: (provider, account) => call((backend) => backend.delete(provider, account)),
  };
}

function isStoredCredential(value: unknown): value is StoredCredential {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { provider?: unknown }).provider === "string" &&
    typeof (value as { account?: unknown }).account === "string"
  );
}

export function createCredentialStore(deps: CredentialStoreDeps): CredentialStore {
  // The backend is chosen once per store, on first use.
  let backend: Promise<CredentialBackend> | undefined;
  const resolve = (): Promise<CredentialBackend> => {
    backend ??= detectPlatform(deps).then((platform) =>
      routeThrough(keyringFor(platform, deps), createVault(deps, platform)),
    );
    return backend;
  };

  async function readIndex(): Promise<StoredCredential[]> {
    const raw = await deps.store.get(INDEX_KEY);
    return Array.isArray(raw) ? raw.filter(isStoredCredential) : [];
  }

  const sameCredential = (a: StoredCredential, provider: string, account: string) =>
    a.provider === provider && a.account === account;

  // Each operation validates its ids and refuses Anthropic before the platform
  // is probed or any backend runs.
  function guard(provider: string, account: string): void {
    assertIds(provider, account);
    refuseAnthropic(provider);
  }

  return {
    async save(provider, account, secret) {
      guard(provider, account);
      await (await resolve()).save(provider, account, secret);
      const index = await readIndex();
      if (!index.some((entry) => sameCredential(entry, provider, account))) {
        await deps.store.set(INDEX_KEY, [...index, { provider, account }]);
      }
    },
    async read(provider, account) {
      guard(provider, account);
      return (await resolve()).read(provider, account);
    },
    async delete(provider, account) {
      guard(provider, account);
      await (await resolve()).delete(provider, account);
      const index = await readIndex();
      const next = index.filter((entry) => !sameCredential(entry, provider, account));
      if (next.length !== index.length) await deps.store.set(INDEX_KEY, next);
    },
    async list(provider) {
      const index = await readIndex();
      return provider === undefined ? index : index.filter((entry) => entry.provider === provider);
    },
  };
}

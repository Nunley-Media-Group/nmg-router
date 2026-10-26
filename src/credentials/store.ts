import type { EngineInterface } from "claude-code";
import { isAnthropicProvider } from "../gateway/anthropic.ts";
import { CredentialError } from "../errors/errors.ts";
import { detectPlatform, type CredentialBackend } from "./platform.ts";
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
    backend ??= detectPlatform(deps).then((platform) => createVault(deps, platform));
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

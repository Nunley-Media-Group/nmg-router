import { CredentialError } from "../errors/errors.ts";
import { isAnthropicProvider } from "../gateway/anthropic.ts";
import { createLinuxKeyring } from "./keyring-linux.ts";
import { createMacosKeyring } from "./keyring-macos.ts";
import { createWindowsKeyring } from "./keyring-windows.ts";
import {
  detectPlatform,
  type CredentialBackend,
  type CredentialHost,
  type KeyringBackend,
  type Platform,
} from "./platform.ts";
import { createVault } from "./vault.ts";

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const INDEX_KEY = "credentials.index";

export interface CredentialRef {
  provider: string;
  account: string;
}

export interface CredentialStore {
  save(provider: string, account: string, secret: string): Promise<void>;
  read(provider: string, account: string): Promise<string | undefined>;
  delete(provider: string, account: string): Promise<void>;
  list(provider?: string): Promise<CredentialRef[]>;
}

function assertIds(provider: string, account: string): void {
  if (isAnthropicProvider(provider)) {
    throw new CredentialError("anthropic_refused", provider);
  }
  if (!ID_PATTERN.test(provider) || !ID_PATTERN.test(account)) {
    throw new CredentialError("invalid_id", provider);
  }
}

function keyringFor(host: CredentialHost, platform: Platform): KeyringBackend | undefined {
  if (platform === "macos") {
    return createMacosKeyring(host);
  }
  if (platform === "windows") {
    return createWindowsKeyring(host);
  }
  if (platform === "linux") {
    return createLinuxKeyring(host);
  }
  return undefined;
}

export function createCredentialStore(host: CredentialHost): CredentialStore {
  let backend: Promise<CredentialBackend> | undefined;

  // The backend is resolved once. The vault serves only when no keyring is found;
  // a keyring that is present but locked or failing is an error, never a fallback.
  function resolveBackend(): Promise<CredentialBackend> {
    backend ??= (async () => {
      const platform = await detectPlatform(host);
      const keyring = keyringFor(host, platform);
      if (keyring !== undefined && (await keyring.available())) {
        return keyring;
      }
      return createVault(host, platform);
    })();
    return backend;
  }

  async function readIndex(): Promise<CredentialRef[]> {
    const value = await host.store.get(INDEX_KEY);
    return Array.isArray(value) ? (value as CredentialRef[]) : [];
  }

  async function updateIndex(provider: string, account: string, present: boolean): Promise<void> {
    const others = (await readIndex()).filter((ref) => !(ref.provider === provider && ref.account === account));
    await host.store.set(INDEX_KEY, present ? [...others, { provider, account }] : others);
  }

  return {
    async save(provider, account, secret) {
      assertIds(provider, account);
      await (await resolveBackend()).save(provider, account, secret);
      await updateIndex(provider, account, true);
    },

    async read(provider, account) {
      assertIds(provider, account);
      return (await resolveBackend()).read(provider, account);
    },

    async delete(provider, account) {
      assertIds(provider, account);
      await (await resolveBackend()).delete(provider, account);
      await updateIndex(provider, account, false);
    },

    async list(provider) {
      const index = await readIndex();
      return provider === undefined ? index : index.filter((ref) => ref.provider === provider);
    },
  };
}

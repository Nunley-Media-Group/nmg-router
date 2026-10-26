import type { HostPort } from "../host.ts";

// Account secrets live in the keyring; the index that says which account is
// active, and the labels people see, live in $.store. Nothing here holds a
// secret outside the secret encoding that the keyring receives.

export type StoreDeps = Pick<HostPort, "store">;

export type ApiKeySecret = { readonly type: "api-key"; readonly key: string };
export type OAuthSecret = {
  readonly type: "oauth";
  readonly access: string;
  readonly refresh: string;
  readonly expires: number;
  readonly accountId: string;
};
export type Secret = ApiKeySecret | OAuthSecret;

export const DEFAULT_ACCOUNT = "default";

const ACTIVE_KEY = "accounts.active";
const LABELS_KEY = "accounts.labels";

export function encodeSecret(secret: Secret): string {
  return JSON.stringify(secret);
}

export function decodeSecret(text: string): Secret | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (record.type === "api-key" && typeof record.key === "string" && record.key !== "") {
    return { type: "api-key", key: record.key };
  }
  if (
    record.type === "oauth" &&
    typeof record.access === "string" &&
    typeof record.refresh === "string" &&
    typeof record.expires === "number" &&
    Number.isFinite(record.expires) &&
    typeof record.accountId === "string"
  ) {
    return {
      type: "oauth",
      access: record.access,
      refresh: record.refresh,
      expires: record.expires,
      accountId: record.accountId,
    };
  }
  return undefined;
}

// Turns a provider's account id into a keyring account name: lowercase, every
// character outside [a-z0-9._-] becomes a dash, cut to 64 characters, and a
// leading character that is not alphanumeric becomes `a`.
export function accountIdFor(raw: string): string {
  const id = raw.toLowerCase().replace(/[^a-z0-9._-]/g, "-").slice(0, 64);
  if (id === "") return "a";
  return /^[a-z0-9]/.test(id) ? id : `a${id.slice(1)}`;
}

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function readActiveIndex(deps: StoreDeps): Promise<Record<string, string>> {
  const index = recordOf(await deps.store.get(ACTIVE_KEY));
  return Object.fromEntries(
    Object.entries(index).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

async function readLabelIndex(deps: StoreDeps): Promise<Record<string, Record<string, string>>> {
  const index = recordOf(await deps.store.get(LABELS_KEY));
  return Object.fromEntries(
    Object.entries(index).map(([provider, labels]) => [
      provider,
      Object.fromEntries(
        Object.entries(recordOf(labels)).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
      ),
    ]),
  );
}

export async function readActiveAccount(deps: StoreDeps, provider: string): Promise<string | undefined> {
  return (await readActiveIndex(deps))[provider];
}

export async function writeActiveAccount(deps: StoreDeps, provider: string, account: string | undefined): Promise<void> {
  const index = await readActiveIndex(deps);
  if (account === undefined) {
    delete index[provider];
  } else {
    index[provider] = account;
  }
  if (Object.keys(index).length === 0) {
    await deps.store.delete(ACTIVE_KEY);
  } else {
    await deps.store.set(ACTIVE_KEY, index);
  }
}

export async function readLabel(deps: StoreDeps, provider: string, account: string): Promise<string | undefined> {
  return (await readLabelIndex(deps))[provider]?.[account];
}

export async function writeLabel(
  deps: StoreDeps,
  provider: string,
  account: string,
  label: string | undefined,
): Promise<void> {
  const index = await readLabelIndex(deps);
  const labels = { ...index[provider] };
  if (label === undefined) {
    delete labels[account];
  } else {
    labels[account] = label;
  }
  const next = { ...index, [provider]: labels };
  if (Object.keys(labels).length === 0) delete next[provider];
  if (Object.keys(next).length === 0) {
    await deps.store.delete(LABELS_KEY);
  } else {
    await deps.store.set(LABELS_KEY, next);
  }
}

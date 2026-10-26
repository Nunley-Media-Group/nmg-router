import type { HostPort } from "../host.ts";
import { CredentialError } from "../errors/errors.ts";
import { accountKey, fromBase64, toBase64, type CredentialBackend } from "./platform.ts";
import { gcm } from "../vendor/noble-ciphers/aes.js";

export type VaultDeps = Pick<HostPort, "env" | "fs" | "process">;

const VAULT_VERSION = 1;
const KEY_BYTES = 32;
const IV_BYTES = 12;

type VaultEntry = { iv: string; ct: string };
type VaultFile = { version: number; entries: Record<string, VaultEntry> };

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEntry(value: unknown): value is VaultEntry {
  return isRecord(value) && typeof value.iv === "string" && typeof value.ct === "string";
}

// The directory for each OS. Windows keeps the vault under the user's local
// application data; POSIX systems use the XDG data home.
async function vaultDirectory(deps: VaultDeps, platform: string): Promise<string> {
  if (platform === "macos") {
    const home = await deps.env.get("HOME");
    if (!home) throw new Error("HOME is unset");
    return `${home}/Library/Application Support/nmg-router`;
  }
  if (platform === "windows") {
    const local = await deps.env.get("LOCALAPPDATA");
    if (!local) throw new Error("LOCALAPPDATA is unset");
    return `${local}\\nmg-router`;
  }
  const dataHome = await deps.env.get("XDG_DATA_HOME");
  if (dataHome) return `${dataHome}/nmg-router`;
  const home = await deps.env.get("HOME");
  if (!home) throw new Error("HOME is unset");
  return `${home}/.local/share/nmg-router`;
}

function filesIn(platform: string, dir: string): { keyPath: string; vaultPath: string } {
  const sep = platform === "windows" ? "\\" : "/";
  return { keyPath: `${dir}${sep}vault.key`, vaultPath: `${dir}${sep}vault.json` };
}

async function mustRun(deps: VaultDeps, argv: readonly string[]): Promise<void> {
  const result = await deps.process.run(argv);
  if (result.exitCode !== 0) throw new Error(`${argv[0]} failed`);
}

// Creates the owner-only directory before any write. Windows needs no step: the
// host's fs.write creates folders itself, and the user profile is already private.
async function prepareDirectory(deps: VaultDeps, platform: string, dir: string): Promise<void> {
  if (platform === "windows") return;
  await mustRun(deps, ["mkdir", "-p", "-m", "700", dir]);
  await mustRun(deps, ["chmod", "700", dir]);
}

async function writeFile(deps: VaultDeps, platform: string, path: string, text: string): Promise<void> {
  await deps.fs.write(path, text);
  if (platform !== "windows") await mustRun(deps, ["chmod", "600", path]);
}

async function loadKey(deps: VaultDeps, keyPath: string): Promise<Uint8Array | undefined> {
  if (!(await deps.fs.exists(keyPath))) return undefined;
  const key = fromBase64((await deps.fs.read(keyPath)).trim());
  if (key.length !== KEY_BYTES) throw new Error("vault key is malformed");
  return key;
}

async function loadVault(deps: VaultDeps, vaultPath: string): Promise<VaultFile | undefined> {
  if (!(await deps.fs.exists(vaultPath))) return undefined;
  const parsed: unknown = JSON.parse(await deps.fs.read(vaultPath));
  if (!isRecord(parsed) || parsed.version !== VAULT_VERSION || !isRecord(parsed.entries)) {
    throw new Error("vault file is malformed");
  }
  return { version: VAULT_VERSION, entries: parsed.entries as Record<string, VaultEntry> };
}

// AES-256-GCM from the vendored @noble/ciphers: the host's crypto.subtle offers
// digest only. The output matches WebCrypto's, with the 128-bit tag after the ciphertext.
function seal(key: Uint8Array, aad: string, plaintext: string): VaultEntry {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = gcm(key, iv, encode(aad)).encrypt(encode(plaintext));
  return { iv: toBase64(iv), ct: toBase64(cipher) };
}

function open(key: Uint8Array, aad: string, entry: VaultEntry): string {
  const plain = gcm(key, fromBase64(entry.iv), encode(aad)).decrypt(fromBase64(entry.ct));
  return new TextDecoder().decode(plain);
}

// Every failure in the vault reads the same to a caller: vault_failed, with no
// plaintext, path or underlying error text.
async function withVault<T>(platform: string, provider: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof CredentialError) throw error;
    throw new CredentialError("vault_failed", { platform, provider });
  }
}

export function createVault(deps: VaultDeps, platform: string): CredentialBackend {
  return {
    save(provider, account, secret) {
      return withVault(platform, provider, async () => {
        const id = accountKey(provider, account);
        const dir = await vaultDirectory(deps, platform);
        const { keyPath, vaultPath } = filesIn(platform, dir);
        const existing = await loadVault(deps, vaultPath);
        let key = await loadKey(deps, keyPath);
        // A missing key with entries present would orphan them, so never regenerate it then.
        if (key === undefined && existing !== undefined && Object.keys(existing.entries).length > 0) {
          throw new Error("vault key is missing for existing entries");
        }
        await prepareDirectory(deps, platform, dir);
        if (key === undefined) {
          key = crypto.getRandomValues(new Uint8Array(KEY_BYTES));
          await writeFile(deps, platform, keyPath, toBase64(key));
        }
        const doc: VaultFile = existing ?? { version: VAULT_VERSION, entries: {} };
        doc.entries[id] = seal(key, `nmg-router:${id}`, secret);
        await writeFile(deps, platform, vaultPath, JSON.stringify(doc));
      });
    },
    read(provider, account) {
      return withVault(platform, provider, async () => {
        const id = accountKey(provider, account);
        const { keyPath, vaultPath } = filesIn(platform, await vaultDirectory(deps, platform));
        const doc = await loadVault(deps, vaultPath);
        if (doc === undefined || !Object.hasOwn(doc.entries, id)) return undefined;
        const entry = doc.entries[id];
        if (!isEntry(entry)) throw new Error("vault entry is malformed");
        const key = await loadKey(deps, keyPath);
        if (key === undefined) throw new Error("vault key is missing");
        return open(key, `nmg-router:${id}`, entry);
      });
    },
    delete(provider, account) {
      return withVault(platform, provider, async () => {
        const id = accountKey(provider, account);
        const dir = await vaultDirectory(deps, platform);
        const { vaultPath } = filesIn(platform, dir);
        const doc = await loadVault(deps, vaultPath);
        if (doc === undefined || !Object.hasOwn(doc.entries, id)) return;
        delete doc.entries[id];
        await prepareDirectory(deps, platform, dir);
        await writeFile(deps, platform, vaultPath, JSON.stringify(doc));
      });
    },
  };
}

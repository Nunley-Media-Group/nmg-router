import { webcrypto } from "node:crypto";
import { CredentialError } from "../errors/errors.ts";
import { probeTool, SERVICE, type CredentialBackend, type CredentialHost, type Platform } from "./platform.ts";

const KEY_BYTES = 32;
const IV_BYTES = 12;
const KEY_FILE = "vault.key";
const DATA_FILE = "vault.json";

interface VaultEntry {
  iv: string;
  ct: string;
}

interface VaultDocument {
  version: 1;
  entries: Record<string, VaultEntry>;
}

export type VaultHost = Pick<CredentialHost, "process" | "env" | "fs">;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function fromBase64(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, "base64"));
}

async function directoryFor(host: Pick<VaultHost, "env">, platform: Platform): Promise<string> {
  if (platform === "windows") {
    const local = await host.env.get("LOCALAPPDATA");
    if (!local) {
      throw new Error("LOCALAPPDATA is unset");
    }
    return `${local}\\nmg-router`;
  }
  const home = await host.env.get("HOME");
  if (!home) {
    throw new Error("HOME is unset");
  }
  if (platform === "macos") {
    return `${home}/Library/Application Support/nmg-router`;
  }
  const dataHome = await host.env.get("XDG_DATA_HOME");
  return `${dataHome || `${home}/.local/share`}/nmg-router`;
}

async function runOrThrow(host: Pick<VaultHost, "process">, argv: readonly string[]): Promise<void> {
  const result = await probeTool(host, argv);
  if (result?.exitCode !== 0) {
    throw new Error(`${argv[0]} failed`);
  }
}

async function writeOwnerOnly(host: VaultHost, platform: Platform, file: string, text: string): Promise<void> {
  await host.fs.write(file, text);
  if (platform !== "windows") {
    await runOrThrow(host, ["chmod", "600", file]);
  }
}

async function loadKey(host: VaultHost, keyFile: string): Promise<Uint8Array | undefined> {
  if (!(await host.fs.exists(keyFile))) {
    return undefined;
  }
  const text = (await host.fs.read(keyFile)).trim();
  const bytes = fromBase64(text);
  if (bytes.length !== KEY_BYTES || toBase64(bytes) !== text) {
    throw new Error("vault key is malformed");
  }
  return bytes;
}

async function readDocument(host: VaultHost, dataFile: string): Promise<VaultDocument | undefined> {
  if (!(await host.fs.exists(dataFile))) {
    return undefined;
  }
  const document = JSON.parse(await host.fs.read(dataFile)) as Partial<VaultDocument>;
  if (document.version !== 1 || typeof document.entries !== "object" || document.entries === null) {
    throw new Error("vault document is malformed");
  }
  return document as VaultDocument;
}

async function importKey(keyBytes: Uint8Array): Promise<webcrypto.CryptoKey> {
  return webcrypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function additionalData(key: string): Uint8Array {
  return encoder.encode(`${SERVICE}:${key}`);
}

async function seal(keyBytes: Uint8Array, key: string, secret: string): Promise<VaultEntry> {
  const iv = new Uint8Array(IV_BYTES);
  webcrypto.getRandomValues(iv);
  const cipherKey = await importKey(keyBytes);
  const ct = await webcrypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: additionalData(key) },
    cipherKey,
    encoder.encode(secret),
  );
  return { iv: toBase64(iv), ct: toBase64(new Uint8Array(ct)) };
}

async function open(keyBytes: Uint8Array, key: string, entry: VaultEntry): Promise<string> {
  const cipherKey = await importKey(keyBytes);
  const plaintext = await webcrypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(entry.iv), additionalData: additionalData(key) },
    cipherKey,
    fromBase64(entry.ct),
  );
  return decoder.decode(plaintext);
}

export function createVault(host: VaultHost, platform: Platform): CredentialBackend {
  async function attempt<T>(provider: string, work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof CredentialError) {
        throw error;
      }
      throw new CredentialError("vault_failed", provider, platform);
    }
  }

  async function files(): Promise<{ dir: string; keyFile: string; dataFile: string }> {
    const dir = await directoryFor(host, platform);
    const separator = platform === "windows" ? "\\" : "/";
    return { dir, keyFile: `${dir}${separator}${KEY_FILE}`, dataFile: `${dir}${separator}${DATA_FILE}` };
  }

  return {
    save(provider, account, secret) {
      const key = `${provider}/${account}`;
      return attempt(provider, async () => {
        const { dir, keyFile, dataFile } = await files();
        if (platform !== "windows") {
          await runOrThrow(host, ["mkdir", "-p", "-m", "700", dir]);
          await runOrThrow(host, ["chmod", "700", dir]);
        }
        const document = (await readDocument(host, dataFile)) ?? { version: 1 as const, entries: {} };
        let keyBytes = await loadKey(host, keyFile);
        if (keyBytes === undefined) {
          if (Object.keys(document.entries).length > 0) {
            throw new Error("vault key is missing for existing entries");
          }
          keyBytes = new Uint8Array(KEY_BYTES);
          webcrypto.getRandomValues(keyBytes);
          await writeOwnerOnly(host, platform, keyFile, toBase64(keyBytes));
        }
        document.entries[key] = await seal(keyBytes, key, secret);
        await writeOwnerOnly(host, platform, dataFile, JSON.stringify(document));
      });
    },

    read(provider, account) {
      const key = `${provider}/${account}`;
      return attempt(provider, async () => {
        const { keyFile, dataFile } = await files();
        const entry = (await readDocument(host, dataFile))?.entries[key];
        if (entry === undefined) {
          return undefined;
        }
        const keyBytes = await loadKey(host, keyFile);
        if (keyBytes === undefined) {
          throw new Error("vault key is missing");
        }
        return open(keyBytes, key, entry);
      });
    },

    delete(provider, account) {
      const key = `${provider}/${account}`;
      return attempt(provider, async () => {
        const { dataFile } = await files();
        const document = await readDocument(host, dataFile);
        if (document === undefined || !(key in document.entries)) {
          return;
        }
        delete document.entries[key];
        await writeOwnerOnly(host, platform, dataFile, JSON.stringify(document));
      });
    },
  };
}

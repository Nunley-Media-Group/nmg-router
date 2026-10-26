import type { HostPort } from "../host.ts";
import { detectPlatform } from "../credentials/platform.ts";
import { ConfigProblem } from "../errors/errors.ts";
import { isAnthropicHost, isAnthropicProvider } from "../gateway/anthropic.ts";

// The user's config.json. It holds custom providers and filters, and never a
// credential: an entry that looks like one is refused, and its value is never
// echoed.

export type ConfigDeps = Pick<HostPort, "env" | "fs" | "process">;

export type RawProviderEntry = Readonly<Record<string, unknown>>;

export type UserConfig = {
  readonly providers: Readonly<Record<string, RawProviderEntry>>;
  readonly disabledProviders: readonly string[];
  readonly enabledModels: readonly string[];
};

export type ConfigLoad = {
  readonly config: UserConfig;
  readonly problems: readonly ConfigProblem[];
};

export const EMPTY_CONFIG: UserConfig = { providers: {}, disabledProviders: [], enabledModels: [] };

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const CREDENTIAL_KEY = /^(api[-_]?key|token|access[-_]?token|refresh[-_]?token|secret|password|credentials?)$/i;
const CREDENTIAL_HEADER = /^(authorization|proxy-authorization|x-api-key|api-key|cookie)$/i;
const CREDENTIAL_VALUE = /^(bearer|basic) /i;

export async function configPath(deps: ConfigDeps): Promise<string | undefined> {
  const platform = await detectPlatform(deps);
  if (platform === "windows") {
    const appData = await deps.env.get("APPDATA");
    return appData === undefined || appData === "" ? undefined : `${appData}\\nmg-router\\config.json`;
  }
  const home = await deps.env.get("HOME");
  if (platform === "macos") {
    return home === undefined || home === "" ? undefined : `${home}/Library/Application Support/nmg-router/config.json`;
  }
  const xdg = await deps.env.get("XDG_CONFIG_HOME");
  const base = xdg !== undefined && xdg !== "" ? xdg : home === undefined || home === "" ? undefined : `${home}/.config`;
  return base === undefined ? undefined : `${base}/nmg-router/config.json`;
}

// The path of the first key or header in an entry that holds a credential, or
// undefined. Keys are checked at any depth; headers are checked by name and by a
// Bearer or Basic value.
export function findCredentialPath(value: unknown, path: string): string | undefined {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const found = findCredentialPath(item, `${path}[${index}]`);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (typeof value !== "object" || value === null) return undefined;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (CREDENTIAL_KEY.test(key)) return childPath;
    if (key.toLowerCase() === "headers" && typeof child === "object" && child !== null) {
      for (const [name, headerValue] of Object.entries(child)) {
        if (CREDENTIAL_HEADER.test(name) || (typeof headerValue === "string" && CREDENTIAL_VALUE.test(headerValue))) {
          return `${childPath}.${name}`;
        }
      }
    }
    const found = findCredentialPath(child, childPath);
    if (found !== undefined) return found;
  }
  return undefined;
}

function stringsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Reads config.json. A missing file is an empty config; malformed JSON is one
// problem and an empty config. `reservedIds` are the built-in provider ids.
export async function loadUserConfig(deps: ConfigDeps, reservedIds: readonly string[]): Promise<ConfigLoad> {
  const path = await configPath(deps);
  if (path === undefined || !(await deps.fs.exists(path))) return { config: EMPTY_CONFIG, problems: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(await deps.fs.read(path));
  } catch {
    return { config: EMPTY_CONFIG, problems: [new ConfigProblem("malformed_file", path)] };
  }
  if (!isRecord(parsed)) return { config: EMPTY_CONFIG, problems: [new ConfigProblem("malformed_file", path)] };

  const problems: ConfigProblem[] = [];
  const providers: Record<string, RawProviderEntry> = {};
  const declared = isRecord(parsed.providers) ? parsed.providers : {};
  for (const [id, entry] of Object.entries(declared)) {
    const entryPath = `providers.${id}`;
    if (!ID_PATTERN.test(id)) {
      problems.push(new ConfigProblem("invalid_id", entryPath));
      continue;
    }
    if (reservedIds.includes(id)) {
      problems.push(new ConfigProblem("builtin_id", entryPath, id));
      continue;
    }
    if (isAnthropicProvider(id)) {
      problems.push(new ConfigProblem("anthropic_entry", entryPath, id));
      continue;
    }
    if (!isRecord(entry)) {
      problems.push(new ConfigProblem("invalid_entry", entryPath));
      continue;
    }
    const credentialPath = findCredentialPath(entry, entryPath);
    if (credentialPath !== undefined) {
      problems.push(new ConfigProblem("credential", credentialPath, id));
      continue;
    }
    if (typeof entry.baseUrl === "string" && isAnthropicHost(entry.baseUrl)) {
      problems.push(new ConfigProblem("anthropic_entry", entryPath, id));
      continue;
    }
    providers[id] = entry;
  }

  return {
    config: {
      providers,
      disabledProviders: stringsOf(parsed.disabledProviders),
      enabledModels: stringsOf(parsed.enabledModels),
    },
    problems,
  };
}

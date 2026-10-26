import type { HostPort } from "../host.ts";
import { readActiveAccount } from "../auth/accounts.ts";
import { resolveCredential } from "../auth/access-token.ts";
import { detectPlatform } from "../credentials/platform.ts";
import type { CredentialStore } from "../credentials/store.ts";
import { ConfigProblem, LoginError, ProviderRejected } from "../errors/errors.ts";
import { isAnthropicModel } from "../gateway/anthropic.ts";
import { EMPTY_CONFIG, loadUserConfig, type UserConfig } from "../config/user-config.ts";
import { BUILTIN_PROVIDERS } from "../providers/builtin/index.ts";
import { customProvider } from "../providers/custom.ts";
import { createProviderRegistry } from "../providers/registry.ts";
import { metadataFor } from "../providers/metadata.ts";
import type { Auth, CatalogModel, ProviderPlugin, RawModel } from "../providers/types.ts";
import { parseModelId, toModelId } from "../models/model-id.ts";
import { modelEnabled } from "../models/patterns.ts";
import { EMPTY_CACHE, readCache, writeCache, type CatalogCache, type CatalogStatus } from "./cache.ts";

// The catalog reads the cache and the config with no network call. A refresh
// asks each enabled provider for its models, and a failure keeps what was cached,
// marked as cached. Nothing here holds a credential.

export type CatalogDeps = Pick<HostPort, "env" | "fs" | "http" | "process" | "store" | "ui"> & {
  readonly credentials: CredentialStore;
};

export type Catalog = {
  // Reads the config and the cache. Config problems are logged once per call.
  load(): Promise<void>;
  // Refreshes every enabled provider, or only the one named.
  refresh(providerId?: string): Promise<void>;
  // Cached models of the enabled providers, after the enabledModels filter.
  models(): CatalogModel[];
  status(providerId: string): CatalogStatus | "never";
  // Every provider, including disabled ones, so /logout can reach them.
  providers(): ProviderPlugin[];
  enabledProviders(): ProviderPlugin[];
  isEnabled(providerId: string): boolean;
  // The account a request would use: the active one when it still exists.
  activeAccount(providerId: string): Promise<string | undefined>;
  // Drops a provider's cached models and status, once it has no account left.
  forget(providerId: string): Promise<void>;
};

export function createCatalog(deps: CatalogDeps, builtins: readonly ProviderPlugin[] = BUILTIN_PROVIDERS): Catalog {
  let plugins: ProviderPlugin[] = [];
  let config: UserConfig = EMPTY_CONFIG;
  let cache: CatalogCache = EMPTY_CACHE;
  let loaded: Promise<void> | undefined;
  let hostPlatform: Promise<string> | undefined;
  const reservedIds = builtins.map((plugin) => plugin.identity.id);

  const platform = (): Promise<string> => (hostPlatform ??= detectPlatform(deps));
  const isEnabled = (providerId: string): boolean => !config.disabledProviders.includes(providerId);
  const enabledProviders = (): ProviderPlugin[] => plugins.filter((plugin) => isEnabled(plugin.identity.id));

  async function activeAccount(providerId: string): Promise<string | undefined> {
    const stored = await deps.credentials.list(providerId);
    if (stored.length === 0) return undefined;
    const active = await readActiveAccount(deps, providerId);
    if (active !== undefined && stored.some((entry) => entry.account === active)) return active;
    return stored[0]?.account;
  }

  function record(providerId: string, status: CatalogStatus, models: readonly CatalogModel[], now: number): void {
    cache = { version: 1, providers: { ...cache.providers, [providerId]: { fetchedAt: now, status, models } } };
  }

  function keptModels(providerId: string): readonly CatalogModel[] {
    return cache.providers[providerId]?.models ?? [];
  }

  function buildModels(plugin: ProviderPlugin, raws: readonly RawModel[]): CatalogModel[] {
    const providerId = plugin.identity.id;
    const models = new Map<string, CatalogModel>();
    for (const raw of raws) {
      const id = toModelId(providerId, raw.id);
      if (isAnthropicModel(id) || models.has(id)) continue;
      const model = parseModelId(id)?.model ?? raw.id;
      const metadata = metadataFor(id);
      const resolved = plugin.wire(model, raw.wire ?? metadata?.wire);
      models.set(id, {
        id,
        provider: providerId,
        model,
        name: raw.name ?? metadata?.name ?? model,
        wire: resolved.wire,
        baseUrl: resolved.baseUrl,
        contextWindow: raw.contextWindow ?? metadata?.contextWindow,
        maxOutput: raw.maxOutput ?? metadata?.maxOutput,
        reasoningEfforts: raw.reasoningEfforts ?? metadata?.reasoningEfforts,
        vision: raw.vision ?? metadata?.vision,
        price: raw.price ?? metadata?.price,
      });
    }
    return [...models.values()];
  }

  async function refreshOne(plugin: ProviderPlugin, now: number): Promise<void> {
    const providerId = plugin.identity.id;
    let auth: Auth | undefined;
    if (plugin.login.kind !== "none") {
      const account = await activeAccount(providerId);
      if (account === undefined) {
        record(providerId, "not-logged-in", [], now);
        return;
      }
      try {
        auth = await resolveCredential(deps, plugin, account, now);
      } catch (error) {
        const offline = error instanceof LoginError && error.code === "offline";
        record(providerId, offline ? "offline" : "unauthenticated", keptModels(providerId), now);
        return;
      }
      if (auth === undefined) {
        record(providerId, "unauthenticated", keptModels(providerId), now);
        return;
      }
    }

    const outcome = await plugin.models.list(deps, { platform: await platform(), auth });
    if (outcome.kind !== "ok") {
      record(providerId, outcome.kind, keptModels(providerId), now);
      return;
    }
    record(providerId, "ok", buildModels(plugin, outcome.models), now);
  }

  async function loadState(): Promise<void> {
    const loadedConfig = await loadUserConfig(deps, reservedIds);
    config = loadedConfig.config;
    const problems: string[] = loadedConfig.problems.map((problem) => problem.message);

    const registry = createProviderRegistry();
    const accepted: ProviderPlugin[] = [];
    const register = (plugin: ProviderPlugin): void => {
      try {
        registry.register(plugin);
        accepted.push(plugin);
      } catch (error) {
        if (!(error instanceof ProviderRejected)) throw error;
        problems.push(error.message);
      }
    };
    for (const plugin of builtins) register(plugin);
    for (const [providerId, entry] of Object.entries(config.providers)) {
      const result = customProvider(providerId, entry);
      if (result instanceof ConfigProblem) {
        problems.push(result.message);
      } else {
        register(result);
      }
    }

    plugins = accepted;
    for (const message of problems) deps.ui.log(message);
    cache = await readCache(deps);
  }

  function ensure(): Promise<void> {
    loaded ??= loadState();
    return loaded;
  }

  return {
    load() {
      loaded = loadState();
      return loaded;
    },
    async refresh(providerId) {
      await ensure();
      const now = Date.now();
      for (const plugin of enabledProviders()) {
        if (providerId !== undefined && plugin.identity.id !== providerId) continue;
        await refreshOne(plugin, now);
      }
      await writeCache(deps, cache);
    },
    models() {
      return enabledProviders().flatMap((plugin) => {
        const entry = cache.providers[plugin.identity.id];
        if (entry === undefined) return [];
        const cached = entry.status !== "ok";
        return entry.models
          .filter((model) => modelEnabled(config.enabledModels, model.provider, model.model))
          .map((model) => ({ ...model, cached }));
      });
    },
    status(providerId) {
      return cache.providers[providerId]?.status ?? "never";
    },
    providers: () => [...plugins],
    enabledProviders,
    isEnabled,
    activeAccount,
    async forget(providerId) {
      await ensure();
      const { [providerId]: _dropped, ...kept } = cache.providers;
      cache = { version: 1, providers: kept };
      await writeCache(deps, cache);
    },
  };
}

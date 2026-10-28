import { vi } from "vitest";
import { createHubController, type HubController, type HubHost } from "../../src/hub/hub-controller.ts";
import type { CatalogStatus } from "../../src/catalog/cache.ts";
import type { PaneController } from "../../src/login/pane.ts";
import type { Services } from "../../src/services.ts";
import type { CatalogModel, ProviderPlugin } from "../../src/providers/types.ts";
import { drawnElements, fakeEngine, type FakeEngine, type FakeOptions } from "./fake-engine.ts";

// A hub over stubbed services: a catalog with fixed models and providers, stored logins
// by provider id, and a pane whose answers are scripted. No network and no vault.

export type Node = { readonly type?: string; readonly props: Record<string, any> };

export const KIMI: CatalogModel = {
  id: "opencode-go/kimi-k3.1-pro",
  provider: "opencode-go",
  model: "kimi-k3.1-pro",
  name: "Kimi K3.1 Pro",
  wire: "openai-completions",
  baseUrl: "https://example.test",
  contextWindow: 128000,
  maxOutput: 32768,
  reasoningEfforts: ["low", "high"],
  vision: false,
  price: { input: 0.6, output: 2.4 },
};

export const GLM: CatalogModel = {
  id: "opencode-go/glm-5.1",
  provider: "opencode-go",
  model: "glm-5.1",
  name: "GLM-5.1",
  wire: "openai-completions",
  baseUrl: "https://example.test",
  contextWindow: 202752,
  price: { input: 0, output: 0 },
};

export const MINI: CatalogModel = {
  id: "openai-codex/kimi-k3-mini",
  provider: "openai-codex",
  model: "kimi-k3-mini",
  name: "Kimi K3 Mini",
  wire: "openai-completions",
  baseUrl: "https://example.test",
  contextWindow: 400000,
  price: { input: 1.25, output: 10 },
};

export const ALL_MODELS: readonly CatalogModel[] = [KIMI, GLM, MINI];

// A provider that needs a stored login, as xAI and OpenCode Go do.
export function apiKeyPlugin(id: string, name: string): ProviderPlugin {
  return {
    identity: { id, name, baseUrl: "https://example.test" },
    login: { kind: "api-key", validate: async () => ({ kind: "ok" }) },
    models: { list: async () => ({ kind: "ok", models: [] }) },
    wire: () => ({ wire: "openai-completions", baseUrl: "https://example.test" }),
  };
}

// A provider that needs no login, so the hub lists it whatever is stored.
export function freePlugin(id: string, name: string): ProviderPlugin {
  return { ...apiKeyPlugin(id, name), login: { kind: "none" } };
}

export const PROVIDER_PLUGINS: readonly ProviderPlugin[] = [
  apiKeyPlugin("opencode-go", "OpenCode Go"),
  apiKeyPlugin("openai-codex", "Codex"),
  apiKeyPlugin("xai", "xAI"),
];

export function idlePane(): PaneController {
  return {
    begin: async (host) => ({ isPlaced: true, hold: { host, closed: false } }),
    end: async () => undefined,
    open: async () => ({ kind: "cancelled" }),
    draw: () => undefined as never,
    closedByHost() {
      // Nothing is drawn by a stub.
    },
    isOpen: () => false,
  };
}

export type StubOptions = {
  readonly logins?: readonly string[];
  readonly models?: readonly CatalogModel[];
  readonly providers?: readonly ProviderPlugin[];
  readonly statuses?: Readonly<Record<string, CatalogStatus>>;
  readonly pane?: PaneController;
};

// `logins` holds the providers with a stored login, and a test may change it between opens.
export type StubServices = Services & { readonly refresh: ReturnType<typeof vi.fn>; readonly logins: Set<string> };

// The services the hub reads: `refresh` is a spy, and each provider's login is answered by `logins`.
export function stubServices(options: StubOptions = {}): StubServices {
  const logins = new Set(options.logins ?? ["opencode-go", "openai-codex"]);
  const models = [...(options.models ?? ALL_MODELS)];
  const providers = [...(options.providers ?? PROVIDER_PLUGINS)];
  const refresh = vi.fn(async (_providerId: string) => undefined);
  const catalog = {
    load: async () => undefined,
    refresh,
    models: () => models,
    enabledProviders: () => [...providers],
    providers: () => [...providers],
    status: (providerId: string) => options.statuses?.[providerId] ?? "ok",
    isEnabled: () => true,
    activeAccount: async () => undefined,
    forget: async () => undefined,
    onChange: () => () => undefined,
  };
  const credentials = {
    list: async (provider?: string) => (provider !== undefined && logins.has(provider) ? [{ account: "default" }] : []),
  };
  return {
    deps: {} as never,
    credentials,
    catalog,
    pane: options.pane ?? idlePane(),
    platform: async () => "linux",
    refresh,
    logins,
  } as unknown as StubServices;
}

export type HubHarness = {
  readonly engine: FakeEngine;
  readonly host: HubHost;
  readonly hub: HubController;
  readonly services: StubServices;
};

// A hub with its engine. `speeds` seeds the measured speeds the rows show.
export async function hubHarness(
  options: Partial<FakeOptions> &
    StubOptions & { readonly speeds?: Record<string, { tokensPerSecond: number; at: number }> } = {},
): Promise<HubHarness> {
  const engine = fakeEngine({ columns: 200, ...options, platform: "linux" });
  if (options.speeds !== undefined) await engine.store.set("metrics.speed", options.speeds);
  const services = stubServices(options);
  return {
    engine,
    host: engine as unknown as HubHost,
    hub: createHubController(services),
    services,
  };
}

// The elements a fake pane draws with, for `hub.draw`.
export const elements = drawnElements as never;

// Every node of a type in the drawn tree, depth first.
export function nodesOf(tree: unknown, type: string): Node[] {
  const found: Node[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (typeof value !== "object" || value === null) return;
    const node = value as Node;
    if (node.type === type) found.push(node);
    visit(node.props?.children);
  };
  visit(tree);
  return found;
}

// The node keyed `key` in the drawn tree, or undefined.
export function keyed(tree: unknown, key: string): Node | undefined {
  return nodesOf(tree, "Button")
    .concat(nodesOf(tree, "Input"), nodesOf(tree, "Select"))
    .find((node) => node.props.key === key);
}

// The values of a Select's options, in the order drawn.
export function optionValues(tree: unknown, key: string): string[] {
  return (keyed(tree, key)?.props.options ?? []).map((option: { value: string }) => option.value);
}

// The person's pick in the providers Select.
export function chooseScope(tree: unknown, id: string): void {
  keyed(tree, "scopes")?.props.onSelect?.(id);
}

// The person's pick in the models Select, by the row's `/model` argument.
export function chooseModel(tree: unknown, switchArg: string): void {
  keyed(tree, "models")?.props.onSelect?.(`row:${switchArg}`);
}

// The text a subtree draws: its string children, and its Text nodes', joined in order.
export function textOf(tree: unknown): string {
  if (typeof tree === "string") return tree;
  if (Array.isArray(tree)) return tree.map(textOf).join("");
  if (typeof tree !== "object" || tree === null) return "";
  const node = tree as Node;
  const children = node.props?.children;
  const own =
    node.type === "Select"
      ? node.props.options.map((option: { label: string }) => option.label).join("\n")
      : node.props?.label !== undefined
        ? String(node.props.label)
        : "";
  return own + textOf(children);
}

// Lets the hub's background refresh and the picks' awaited work settle.
export async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

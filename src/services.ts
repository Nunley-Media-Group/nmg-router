import type { HostPort } from "./host.ts";
import { detectPlatform } from "./credentials/platform.ts";
import { createCredentialStore, type CredentialStore } from "./credentials/store.ts";
import { createCatalog, type Catalog, type CatalogDeps } from "./catalog/catalog.ts";
import { createPaneController, type PaneController } from "./login/pane.ts";

// The services the login hooks share. Built once per engine, from its host
// surfaces, so the hooks themselves hold no logic.

export type Services = {
  readonly deps: CatalogDeps;
  readonly credentials: CredentialStore;
  readonly catalog: Catalog;
  readonly pane: PaneController;
  platform(): Promise<string>;
};

// `pane` replaces the drawn pane in tests that script the picker's answers.
export function createServices(
  host: HostPort,
  overrides: { readonly pane?: PaneController } = {},
): Services {
  const credentials = createCredentialStore(host);
  const deps: CatalogDeps = {
    env: host.env,
    fs: host.fs,
    http: host.http,
    process: host.process,
    store: host.store,
    ui: host.ui,
    credentials,
  };
  let platform: Promise<string> | undefined;
  return {
    deps,
    credentials,
    catalog: createCatalog(deps),
    pane: overrides.pane ?? createPaneController(),
    platform: () => (platform ??= detectPlatform(deps)),
  };
}

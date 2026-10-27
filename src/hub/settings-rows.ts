import type { Catalog } from "../catalog/catalog.ts";
import type { HostPort } from "../host.ts";
import { parseModelId } from "../models/model-id.ts";
import type { CatalogModel } from "../providers/types.ts";
import { formatPrice, formatTokens } from "./format.ts";

// Claude Code only discovers model ids that contain "claude", so each enabled routed
// model is also a `modelPicker.options` row in the user's settings file. The mod
// keeps the user's own rows and every other key, and rewrites only its rows.

export type SettingsHost = Pick<HostPort, "clock" | "env" | "fs" | "settings" | "ui">;

export type ModelPickerRow = { readonly model: string; readonly label: string; readonly description?: string };

// `$CLAUDE_CONFIG_DIR/settings.json`, else `$HOME/.claude/settings.json`, or
// `%USERPROFILE%\.claude\settings.json` on Windows.
export async function settingsPath(host: Pick<HostPort, "env">, platform: string): Promise<string | undefined> {
  const separator = platform === "windows" ? "\\" : "/";
  const configDir = await host.env.get("CLAUDE_CONFIG_DIR");
  if (configDir !== undefined && configDir !== "") return `${configDir}${separator}settings.json`;
  const home = await host.env.get(platform === "windows" ? "USERPROFILE" : "HOME");
  if (home === undefined || home === "") return undefined;
  return `${home}${separator}.claude${separator}settings.json`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(part: string | undefined): part is string {
  return part !== undefined;
}

function rowFor(model: CatalogModel, providerName: string): ModelPickerRow {
  const description = [
    model.contextWindow === undefined ? undefined : `${formatTokens(model.contextWindow)} ctx`,
    formatPrice(model.price),
  ]
    .filter(isText)
    .join(" · ");
  return {
    model: model.id,
    label: `${providerName} · ${model.name}`,
    ...(description === "" ? {} : { description }),
  };
}

export type SettingsRowsOptions = {
  readonly platform: () => Promise<string>;
  readonly catalog: Pick<Catalog, "models" | "providers">;
};

export type SettingsRows = {
  sync(): Promise<void>;
  // True once Claude Code has loaded the mod's rows, or only `model`'s row when one is
  // named; an id with no mod row is not the mod's to wait for. False when it never does.
  loaded(model?: string): Promise<boolean>;
};

// Claude Code reloads the settings file when its watcher sees a change, but a write
// before the watcher starts, or one folded into the echo of the host's own write, is
// never seen, and core's /model then refuses the routed ids for the whole session. A
// rewrite is a fresh change the watcher sees, so an unloaded row is written again. The
// watcher takes about a second to load a change, so a write is given SETTLE_MS first.
const POLL_MS = 250;
const SETTLE_MS = 2_000;
const REWRITES = 2;

function loadedIds(user: unknown): ReadonlySet<string> {
  const picker = isRecord(user) ? user.modelPicker : undefined;
  const options = isRecord(picker) && Array.isArray(picker.options) ? picker.options : [];
  return new Set(options.flatMap((row) => (isRecord(row) && typeof row.model === "string" ? [row.model.trim()] : [])));
}

// Writes the file only when the merged text differs from what it holds. A file that
// is not a JSON object is left alone, and the mod says so once per session.
export function createSettingsRows(host: SettingsHost, options: SettingsRowsOptions): SettingsRows {
  let warned = false;
  // The mod's row ids in the file as the last sync left it.
  let synced: readonly string[] | undefined;
  // True from a write until a check has given the watcher its time to load it.
  let unsettled = false;
  // The check of every row that follows a sync, which a switch waits for first.
  let confirming: Promise<boolean> | undefined;
  const warn = (text: string): void => {
    if (warned) return;
    warned = true;
    host.ui.log(text);
  };
  const sleep = (ms: number): Promise<void> => new Promise((resolve) => host.clock.after(ms, resolve));

  async function writeRows(force: boolean): Promise<void> {
    const path = await settingsPath(host, await options.platform());
    if (path === undefined) return;
    const current = (await host.fs.exists(path)) ? await host.fs.read(path) : undefined;

    let doc: Record<string, unknown> = {};
    if (current !== undefined) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(current);
      } catch {
        parsed = undefined;
      }
      if (!isRecord(parsed)) {
        warn("nmg-router left settings.json unchanged: it is not valid JSON.");
        return;
      }
      doc = parsed;
    }

    const picker = doc.modelPicker === undefined ? {} : doc.modelPicker;
    if (!isRecord(picker)) {
      warn("nmg-router left settings.json unchanged: modelPicker is not an object.");
      return;
    }

    const providers = options.catalog.providers();
    const names = new Map(providers.map((provider) => [provider.identity.id, provider.identity.name]));
    const managed = (row: unknown): boolean =>
      isRecord(row) && typeof row.model === "string" && names.has(parseModelId(row.model)?.provider ?? "");
    const userRows = Array.isArray(picker.options) ? picker.options.filter((row) => !managed(row)) : [];
    const modelRows = options.catalog
      .models()
      .map((model) => rowFor(model, names.get(model.provider) ?? model.provider));

    const next = { ...doc, modelPicker: { ...picker, options: [...userRows, ...modelRows] } };
    const text = `${JSON.stringify(next, null, 2)}\n`;
    synced = modelRows.map((row) => row.model);
    if (text === current && !force) return;
    await host.fs.write(path, text);
    unsettled = true;
  }

  // Whether Claude Code has loaded every id; one it cannot be asked about counts as loaded.
  async function hostHas(ids: readonly string[]): Promise<boolean> {
    try {
      const loaded = loadedIds(await host.settings.read({ source: "user" }));
      return ids.every((id) => loaded.has(id));
    } catch {
      return true;
    }
  }

  async function settles(ids: readonly string[]): Promise<boolean> {
    unsettled = false;
    for (let waited = 0; waited < SETTLE_MS; waited += POLL_MS) {
      await sleep(POLL_MS);
      if (await hostHas(ids)) return true;
    }
    return false;
  }

  async function confirm(ids: readonly string[]): Promise<boolean> {
    if (ids.length === 0 || (await hostHas(ids))) return true;
    if (unsettled && (await settles(ids))) return true;
    for (let rewrite = 0; rewrite < REWRITES; rewrite += 1) {
      await writeRows(true);
      if (await settles(ids)) return true;
    }
    return false;
  }

  return {
    sync: () => writeRows(false),
    async loaded(model) {
      if (synced === undefined) await writeRows(false);
      if (synced === undefined) return false;
      if (model === undefined) {
        confirming ??= confirm(synced).finally(() => (confirming = undefined));
        return confirming;
      }
      const wanted = synced.filter((id) => id === model.trim());
      if (wanted.length === 0) return true;
      if (confirming !== undefined && !(await confirming)) return false;
      return confirm(wanted);
    },
  };
}

export type ModelPickerRowsWatch = {
  // Syncs from the cached catalog, with no network call; the session start runs it.
  start(): Promise<void>;
  // Resolves once Claude Code can switch to `model`, writing its row again if needed.
  loaded(model: string): Promise<boolean>;
};

// Syncs the rows each time the catalog refreshes or logs out. Claude Code's own /model
// accepts a routed id only once its row is in the settings it has loaded, so each sync
// then checks the host loaded the rows, in the background, so no hook waits on it.
export function watchModelPickerRows(
  catalog: Catalog,
  host: SettingsHost,
  platform: () => Promise<string>,
): ModelPickerRowsWatch {
  const rows = createSettingsRows(host, { platform, catalog });
  const confirm = (): void =>
    void rows.loaded().then(
      (loaded) => {
        if (!loaded) host.ui.log("nmg-router: Claude Code has not loaded the model picker rows.", { to: "debug" });
      },
      () => undefined,
    );
  const sync = (): Promise<void> =>
    rows.sync().then(confirm, () => host.ui.log("nmg-router could not update the model picker in settings.json."));
  catalog.onChange(() => void sync());
  return {
    start: () => catalog.load().then(sync, () => host.ui.log("nmg-router could not read the model catalog.")),
    loaded: (model) => rows.loaded(model).catch(() => false),
  };
}

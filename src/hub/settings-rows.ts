import type { Catalog } from "../catalog/catalog.ts";
import type { HostPort } from "../host.ts";
import { parseModelId } from "../models/model-id.ts";
import type { CatalogModel } from "../providers/types.ts";
import { formatPrice, formatTokens } from "./format.ts";

// Claude Code only discovers model ids that contain "claude", so each enabled routed
// model is also a `modelPicker.options` row in the user's settings file. The mod
// keeps the user's own rows and every other key, and rewrites only its rows.

export type SettingsHost = Pick<HostPort, "env" | "fs" | "ui">;

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

export type SettingsRows = { sync(): Promise<void> };

// Writes the file only when the merged text differs from what it holds. A file that
// is not a JSON object is left alone, and the mod says so once per session.
export function createSettingsRows(host: SettingsHost, options: SettingsRowsOptions): SettingsRows {
  let warned = false;
  const warn = (text: string): void => {
    if (warned) return;
    warned = true;
    host.ui.log(text);
  };

  return {
    async sync() {
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
      if (text === current) return;
      await host.fs.write(path, text);
    },
  };
}

// Syncs the rows each time the catalog refreshes or logs out. Claude Code's own /model
// accepts a routed id only once its row is in the settings it has loaded, so the
// returned function syncs from the cached catalog too, with no network call; the
// session start runs it, before the person can pick a model.
export function watchModelPickerRows(
  catalog: Catalog,
  host: SettingsHost,
  platform: () => Promise<string>,
): () => Promise<void> {
  const rows = createSettingsRows(host, { platform, catalog });
  const sync = (): Promise<void> =>
    rows.sync().catch(() => host.ui.log("nmg-router could not update the model picker in settings.json."));
  catalog.onChange(() => void sync());
  return () => catalog.load().then(sync, () => host.ui.log("nmg-router could not read the model catalog."));
}

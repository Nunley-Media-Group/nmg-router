import { describe, expect, it, vi } from "vitest";
import { writeCache } from "../../src/catalog/cache.ts";
import { createCatalog } from "../../src/catalog/catalog.ts";
import { createSettingsRows, settingsPath, watchModelPickerRows } from "../../src/hub/settings-rows.ts";
import type { CredentialStore } from "../../src/credentials/store.ts";
import type { CatalogModel, ProviderPlugin } from "../../src/providers/types.ts";
import { fakeEngine, writtenText } from "../support/fake-engine.ts";
import { ALL_MODELS, KIMI, PROVIDER_PLUGINS } from "../support/hub-harness.ts";

// The model picker rows in the user's settings file: the user's own rows and keys stay,
// and only the mod's rows are rewritten, and only when the text changes.

const PATH = "/home/tester/.claude/settings.json";

const catalog = {
  models: () => [...ALL_MODELS],
  providers: () => [...PROVIDER_PLUGINS],
};

function settingsWith(text: string) {
  return fakeEngine({ platform: "linux", files: { [PATH]: text } });
}

describe("settings rows", () => {
  it("keeps the user's rows first, then one provider-labeled row per routed model, and the other keys", async () => {
    const engine = settingsWith(
      JSON.stringify({ theme: "dark", modelPicker: { keep: true, options: [{ model: "sonnet", label: "My sonnet" }] } }),
    );
    await createSettingsRows(engine, { platform: async () => "linux", catalog }).sync();
    const doc = JSON.parse(writtenText(engine, PATH) ?? "");
    expect(doc.theme).toBe("dark");
    expect(doc.modelPicker.keep).toBe(true);
    expect(doc.modelPicker.replaceBuiltInOptions).toBeUndefined();
    expect(doc.modelPicker.options).toEqual([
      { model: "sonnet", label: "My sonnet" },
      { model: "opencode-go/kimi-k3.1-pro", label: "OpenCode Go · Kimi K3.1 Pro", description: "128k ctx · $0.6/2.4" },
      { model: "opencode-go/glm-5.1", label: "OpenCode Go · GLM-5.1", description: "203k ctx · free" },
      { model: "openai-codex/kimi-k3-mini", label: "Codex · Kimi K3 Mini", description: "400k ctx · $1.25/10" },
    ]);
  });

  it("replaces the mod's rows from an earlier sync, and keeps a row for a provider the mod does not know", async () => {
    const engine = settingsWith(
      JSON.stringify({
        modelPicker: {
          options: [
            { model: "opencode-go/retired", label: "OpenCode Go · Retired" },
            { model: "elsewhere/model", label: "Elsewhere" },
          ],
        },
      }),
    );
    await createSettingsRows(engine, { platform: async () => "linux", catalog }).sync();
    const options = JSON.parse(writtenText(engine, PATH) ?? "").modelPicker.options as { model: string }[];
    expect(options.map((row) => row.model)).toEqual([
      "elsewhere/model",
      "opencode-go/kimi-k3.1-pro",
      "opencode-go/glm-5.1",
      "openai-codex/kimi-k3-mini",
    ]);
  });

  it("writes nothing on a second identical sync", async () => {
    const engine = settingsWith("{}");
    const rows = createSettingsRows(engine, { platform: async () => "linux", catalog });
    await rows.sync();
    const writes = engine.recorded.fsWrites.length;
    await rows.sync();
    expect(engine.recorded.fsWrites.length).toBe(writes);
  });

  it("leaves a file that is not valid JSON untouched, and says so once", async () => {
    const engine = settingsWith("{ not json");
    const rows = createSettingsRows(engine, { platform: async () => "linux", catalog });
    await rows.sync();
    await rows.sync();
    expect(engine.recorded.fsWrites).toEqual([]);
    expect(engine.recorded.ui.filter((text) => text.includes("not valid JSON"))).toEqual([
      "nmg-router left settings.json unchanged: it is not valid JSON.",
    ]);
  });

  it("writes a missing file with just the model picker rows", async () => {
    const engine = fakeEngine({ platform: "linux" });
    await createSettingsRows(engine, { platform: async () => "linux", catalog }).sync();
    expect(JSON.parse(writtenText(engine, PATH) ?? "").modelPicker.options).toHaveLength(3);
  });

  it("writes only the label, the model and the description for each row", async () => {
    const engine = fakeEngine({ platform: "linux" });
    await createSettingsRows(engine, { platform: async () => "linux", catalog }).sync();
    const options = JSON.parse(writtenText(engine, PATH) ?? "").modelPicker.options as Record<string, unknown>[];
    for (const row of options) expect(Object.keys(row).sort()).toEqual(["description", "label", "model"]);
  });

  it("writes no credential from a catalog entry's own fields, so a key on a model stays out of the file", async () => {
    const engine = fakeEngine({ platform: "linux" });
    const leaky = { ...KIMI, apiKey: "sk-test-not-for-settings" } as CatalogModel;
    const leakyCatalog = { models: () => [leaky], providers: () => [...PROVIDER_PLUGINS] };
    await createSettingsRows(engine, { platform: async () => "linux", catalog: leakyCatalog }).sync();
    expect(writtenText(engine, PATH)).toBeDefined();
    expect(writtenText(engine, PATH)).not.toContain("sk-test-not-for-settings");
  });

  // A provider with no login has no catalog models, so the hub's hidden provider gets no picker row either.
  it("writes no row for a provider whose catalog entry has no models, such as one with no login", async () => {
    const engine = fakeEngine({ platform: "linux" });
    await createSettingsRows(engine, { platform: async () => "linux", catalog }).sync();
    expect(PROVIDER_PLUGINS.map((provider) => provider.identity.id)).toContain("xai");
    const models = (JSON.parse(writtenText(engine, PATH) ?? "").modelPicker.options as { model: string }[]).map(
      (row) => row.model,
    );
    expect(models.filter((model) => model.startsWith("xai/"))).toEqual([]);
  });
});

// Claude Code's watcher can miss a write: one before it starts, or one folded into the
// echo of the host's own write. Core's /model reads only what the host has loaded.
describe("rows Claude Code has loaded", () => {
  const KIMI_ID = "opencode-go/kimi-k3.1-pro";
  const loadedModels = async (engine: ReturnType<typeof fakeEngine>): Promise<string[]> => {
    const user = (await engine.settings.read({ source: "user" })) as { modelPicker?: { options?: { model: string }[] } };
    return (user.modelPicker?.options ?? []).map((row) => row.model);
  };

  it("writes the file again when the host missed the write, until the host has loaded the rows", async () => {
    const engine = fakeEngine({ platform: "linux", missedSettingsWrites: 1 });
    const rows = createSettingsRows(engine, { platform: async () => "linux", catalog });
    await rows.sync();
    expect(await loadedModels(engine)).toEqual([]);

    expect(await rows.loaded(KIMI_ID)).toBe(true);
    expect(engine.recorded.fsWrites).toHaveLength(2);
    expect(engine.recorded.fsWrites[1]?.text).toBe(engine.recorded.fsWrites[0]?.text);
    expect(await loadedModels(engine)).toContain(KIMI_ID);
  });

  it("writes nothing more when the host has loaded the rows, or for an id with no mod row", async () => {
    const engine = fakeEngine({ platform: "linux" });
    const rows = createSettingsRows(engine, { platform: async () => "linux", catalog });
    await rows.sync();
    expect(await rows.loaded()).toBe(true);
    expect(await rows.loaded(KIMI_ID)).toBe(true);
    expect(await rows.loaded("opus")).toBe(true);
    expect(engine.recorded.fsWrites).toHaveLength(1);
  });

  it("stops after two rewrites the host never loads, and says the row is not loaded", async () => {
    const engine = fakeEngine({ platform: "linux", missedSettingsWrites: 10 });
    const rows = createSettingsRows(engine, { platform: async () => "linux", catalog });
    await rows.sync();
    expect(await rows.loaded(KIMI_ID)).toBe(false);
    expect(engine.recorded.fsWrites).toHaveLength(3);
  });

  it("keeps a change the user made to the file since the sync when it writes the rows again", async () => {
    // The host misses both the sync's write and the user's edit.
    const engine = fakeEngine({ platform: "linux", missedSettingsWrites: 2 });
    const rows = createSettingsRows(engine, { platform: async () => "linux", catalog });
    await rows.sync();
    const synced = JSON.parse(writtenText(engine, PATH) ?? "") as Record<string, unknown>;
    await engine.fs.write(PATH, JSON.stringify({ ...synced, theme: "light" }));

    expect(await rows.loaded(KIMI_ID)).toBe(true);
    expect(engine.recorded.fsWrites).toHaveLength(3);
    const doc = JSON.parse(writtenText(engine, PATH) ?? "");
    expect(doc.theme).toBe("light");
    expect(doc.modelPicker.options.map((row: { model: string }) => row.model)).toContain(KIMI_ID);
  });
});

describe("settings path", () => {
  it("honours CLAUDE_CONFIG_DIR, then HOME, and uses USERPROFILE on Windows", async () => {
    expect(await settingsPath(fakeEngine({ platform: "linux", env: { CLAUDE_CONFIG_DIR: "/cfg" } }), "linux")).toBe(
      "/cfg/settings.json",
    );
    expect(await settingsPath(fakeEngine({ platform: "linux" }), "linux")).toBe("/home/tester/.claude/settings.json");
    const windows = fakeEngine({ platform: "windows", env: { USERPROFILE: "C:\\Users\\tester" } });
    expect(await settingsPath(windows, "windows")).toBe("C:\\Users\\tester\\.claude\\settings.json");
  });
});

describe("catalog listener", () => {
  const plugin: ProviderPlugin = {
    identity: { id: "stub", name: "Stub", baseUrl: "https://example.test" },
    login: { kind: "none" },
    models: { list: async () => ({ kind: "ok", models: [{ id: "m1", name: "M1" }] }) },
    wire: () => ({ wire: "openai-completions", baseUrl: "https://example.test" }),
  };

  it("notifies on each refresh and each logout, and a refresh writes the rows", async () => {
    const engine = fakeEngine({ platform: "linux" });
    const stub = createCatalog({ ...engine, credentials: { list: async () => [] } as unknown as CredentialStore }, [plugin]);
    const listener = vi.fn();
    stub.onChange(listener);
    watchModelPickerRows(stub, engine, async () => "linux");

    await stub.refresh();
    expect(listener).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(writtenText(engine, PATH)).toContain("stub/m1"));

    await stub.forget("stub");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  // Claude Code's /model takes a routed id only once its row is in the loaded settings,
  // so the rows cannot wait for a refresh.
  it("writes the rows from the cached catalog when started, with no refresh and no network call", async () => {
    const engine = fakeEngine({ platform: "linux" });
    await writeCache(engine, {
      version: 1,
      providers: {
        stub: {
          fetchedAt: 1,
          status: "ok",
          models: [{ id: "stub/m1", provider: "stub", model: "m1", name: "M1", wire: "openai-completions", baseUrl: "https://example.test" }],
        },
      },
    });
    const stub = createCatalog({ ...engine, credentials: { list: async () => [] } as unknown as CredentialStore }, [plugin]);
    const listener = vi.fn();
    stub.onChange(listener);

    await watchModelPickerRows(stub, engine, async () => "linux").start();

    expect(listener).not.toHaveBeenCalled();
    expect(engine.recorded.http).toEqual([]);
    expect(JSON.parse(writtenText(engine, PATH) ?? "").modelPicker.options).toEqual([
      { model: "stub/m1", label: "Stub · M1" },
    ]);
  });
});

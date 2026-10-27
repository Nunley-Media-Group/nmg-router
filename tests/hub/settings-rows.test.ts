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

    await watchModelPickerRows(stub, engine, async () => "linux")();

    expect(listener).not.toHaveBeenCalled();
    expect(engine.recorded.http).toEqual([]);
    expect(JSON.parse(writtenText(engine, PATH) ?? "").modelPicker.options).toEqual([
      { model: "stub/m1", label: "Stub · M1" },
    ]);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createModeReader, PERMISSION_MODES } from "../../src/permissions/mode.ts";

const root = join(import.meta.dirname, "..", "..");
const manifest = JSON.parse(readFileSync(join(root, ".claude-plugin", "plugin.json"), "utf8"));
const rows = Object.entries(manifest.userConfig ?? {}) as [string, Record<string, unknown>][];

describe("plugin.json userConfig", () => {
  // Claude Code refuses to load the hooks module when a required row has no value.
  it("lets the hooks module load with every row unset", () => {
    const blocking = rows.filter(([, row]) => row.required === true && !("default" in row)).map(([key]) => key);
    expect(blocking).toEqual([]);
  });

  // `claude plugin validate` rejects a row with options unless it has a default or is required.
  it("gives every row with options a default among them", () => {
    const invalid = rows
      .filter(([, row]) => Array.isArray(row.options) && !(row.options as unknown[]).includes(row.default))
      .map(([key]) => key);
    expect(invalid).toEqual([]);
  });

  // The row stays a free string with no default, so unset falls back to login presence (AC4).
  it("declares routedAutoPermissions with no default, naming both modes", () => {
    const row = manifest.userConfig.routedAutoPermissions;
    expect(row).not.toHaveProperty("default");
    expect(row).not.toHaveProperty("required");
    for (const mode of PERMISSION_MODES) expect(row.description).toContain(mode);
  });

  it("treats a value outside the two modes as unset", async () => {
    const read = createModeReader({ routedAutoPermissions: "allow-everything" });
    const host = { config: { list: async () => [] }, session: { authorize: async () => null } };
    expect(await read(host)).toBe("server-classifier-off");
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const readme = readFileSync(join(import.meta.dirname, "..", "..", "README.md"), "utf8");

const HEADINGS = [
  "Requirements",
  "Installation",
  "Logging in to providers",
  "Choosing a model",
  "Thinking levels",
  "Auto-mode permissions",
  "Custom providers and filters",
  "Known limits",
  "Credential boundary",
  "Credential security",
  "Contributing",
];

function section(heading: string): string {
  const start = readme.indexOf(`\n## ${heading}\n`);
  if (start === -1) return "";
  const end = readme.indexOf("\n## ", start + 1);
  return readme.slice(start + 1, end === -1 ? undefined : end);
}

describe("README sections", () => {
  it("has the level-2 headings in order", () => {
    expect(readme.match(/^## .+$/gm)?.map((line) => line.slice(3))).toEqual(HEADINGS);
  });

  it.each([
    ["Installation", "/plugin marketplace add Nunley-Media-Group/nmg-plugins"],
    ["Installation", "/plugin install nmg-router@nmg-plugins"],
    ["Requirements", "2.1.310"],
    ["Requirements", "Nothing else needs installing"],
    ["Logging in to providers", "/login"],
    ["Logging in to providers", "/logout"],
    ["Logging in to providers", "Claude Code's own login"],
    ["Choosing a model", "/model"],
    ["Choosing a model", "provider/model"],
    ["Thinking levels", "clamped to what the routed model supports"],
    ["Auto-mode permissions", "Routed auto-mode permissions"],
    ["Auto-mode permissions", "claude-classifier"],
    ["Auto-mode permissions", "server-classifier-off"],
    ["Custom providers and filters", "config.json"],
    ["Custom providers and filters", "disabledProviders"],
    ["Custom providers and filters", "enabledModels"],
    ["Custom providers and filters", "never holds a key"],
    ["Credential boundary", "Claude credentials stay with Claude Code"],
    ["Credential boundary", "Provider credentials stay in the encrypted vault"],
  ])("%s names %s", (heading, term) => {
    expect(section(heading)).toContain(term);
  });
});

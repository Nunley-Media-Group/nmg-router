import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("manifest versions", () => {
  const version = read("VERSION").trim();

  it("mirrors VERSION in package.json and the plugin manifest", () => {
    expect(JSON.parse(read("package.json")).version).toBe(version);
    expect(JSON.parse(read(".claude-plugin/plugin.json")).version).toBe(version);
  });

  it("lists the register module in hooks.json", () => {
    expect(JSON.parse(read("hooks/hooks.json")).modules).toContain("./register.ts");
  });

  it("ignores the generated mod types folder", () => {
    expect(read(".gitignore").split("\n")).toContain(".claude-plugin/types/");
  });

  it("defines the typecheck, test and types:sync scripts", () => {
    const scripts = JSON.parse(read("package.json")).scripts;
    expect(Object.keys(scripts)).toEqual(expect.arrayContaining(["typecheck", "test", "types:sync"]));
  });
});

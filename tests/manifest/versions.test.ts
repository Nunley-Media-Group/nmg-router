import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("manifests mirror VERSION", () => {
  const version = read("VERSION").trim();

  it("declares the same version in package.json and the plugin manifest", () => {
    expect((JSON.parse(read("package.json")) as { version: string }).version).toBe(version);
    expect((JSON.parse(read(".claude-plugin/plugin.json")) as { version: string }).version).toBe(version);
  });

  it("lists the register module in hooks.json", () => {
    expect((JSON.parse(read("hooks/hooks.json")) as { modules: string[] }).modules).toEqual(["./register.ts"]);
  });

  it("defines the typecheck, test and types:sync scripts", () => {
    const scripts = (JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts;
    expect(Object.keys(scripts)).toEqual(expect.arrayContaining(["typecheck", "test", "types:sync"]));
  });

  it("ignores the generated mod types folder", () => {
    expect(read(".gitignore").split("\n")).toContain(".claude-plugin/types/");
  });
});

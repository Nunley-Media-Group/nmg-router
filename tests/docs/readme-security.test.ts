import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readme = readFileSync(resolve(import.meta.dirname, "../../README.md"), "utf8");
const section = /## Credential security\n([\s\S]*?)(?=\n## |$)/.exec(readme)?.[1] ?? "";

describe("README credential security section", () => {
  it("exists", () => {
    expect(section.length).toBeGreaterThan(0);
  });

  it.each([
    "Keychain",
    "Credential Manager",
    "Secret Service",
    "vault.key",
    "~/Library/Application Support/nmg-router",
    "${XDG_DATA_HOME:-~/.local/share}/nmg-router",
    "%LOCALAPPDATA%\\nmg-router",
    "backups",
    "sync",
    "full-disk encryption",
    "secret-tool",
    "libsecret",
    "delete the vault directory",
  ])("mentions %s", (term) => {
    expect(section).toContain(term);
  });
});

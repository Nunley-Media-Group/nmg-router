import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const readme = readFileSync(join(import.meta.dirname, "..", "..", "README.md"), "utf8");
const start = readme.indexOf("## Credential security");
const end = readme.indexOf("\n## ", start + 1);
const section = start === -1 ? "" : readme.slice(start, end === -1 ? undefined : end);

describe("README credential security section", () => {
  it("exists", () => {
    expect(start).toBeGreaterThanOrEqual(0);
  });

  it.each([
    "Keychain",
    "Credential Manager",
    "Secret Service",
    "vault.key",
    "vault.json",
    "~/Library/Application Support/nmg-router",
    "${XDG_DATA_HOME:-~/.local/share}/nmg-router",
    "%LOCALAPPDATA%\\nmg-router",
    "owner-only",
    "file permissions",
    "backups",
    "sync",
    "full-disk encryption",
    "secret-tool",
    "libsecret",
    "delete the vault directory",
  ])("names %s", (term) => {
    expect(section).toContain(term);
  });
});

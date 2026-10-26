import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Shapes a real token, private key or account id would take. Samples are
// assembled from fragments at run time so this file holds none literally.
const SHAPES: [string, RegExp][] = [
  ["token", /\b(?:sk|pk|ghp|gho|xox[bpas])[-_][A-Za-z0-9_-]{16,}/],
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["account id", /\b(?:acct|account)_[A-Za-z0-9]{8,}\b|\b\d{12}\b/],
];

function shapesIn(text: string): string[] {
  return SHAPES.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

describe("fixture hygiene", () => {
  it("flags token-shaped, key-shaped and account-id-shaped samples", () => {
    const token = ["sk", "live", "x".repeat(20)].join("-");
    const privateKey = ["-----BEGIN", "RSA PRIVATE", "KEY-----"].join(" ");
    const accountId = ["acct", "1234abcd5678"].join("_");
    const twelveDigits = "1".repeat(12);

    expect(shapesIn(token)).toEqual(["token"]);
    expect(shapesIn(privateKey)).toEqual(["private key"]);
    expect(shapesIn(accountId)).toEqual(["account id"]);
    expect(shapesIn(twelveDigits)).toEqual(["account id"]);
  });

  it("finds no credential-shaped value under tests/fixtures", () => {
    const fixtures = join(import.meta.dirname, "..", "fixtures");
    const offenders = filesUnder(fixtures).flatMap((file) => {
      const found = shapesIn(readFileSync(file, "utf8"));
      return found.length > 0 ? [`${file}: ${found.join(", ")}`] : [];
    });

    expect(offenders).toEqual([]);
  });
});

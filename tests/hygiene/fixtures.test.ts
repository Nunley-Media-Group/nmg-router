import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const FIXTURES = resolve(import.meta.dirname, "../fixtures");

const SHAPES: [string, RegExp][] = [
  ["token", /\bsk-[A-Za-z0-9]{20,}\b/],
  ["token", /\bgh[pousr]_[A-Za-z0-9]{20,}\b/],
  ["key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["account id", /\bacct_[A-Za-z0-9]{8,}\b/],
  ["account id", /\b[0-9a-f]{32}\b/],
];

function credentialShapes(text: string): string[] {
  return SHAPES.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe("fixture hygiene", () => {
  it("rejects runtime-built token, key and account-id shaped samples", () => {
    const samples = [
      ["sk", "a".repeat(24)].join("-"),
      ["-----BEGIN", "PRIVATE", "KEY-----"].join(" "),
      ["acct", "a".repeat(10)].join("_"),
    ];
    for (const sample of samples) {
      expect(credentialShapes(sample).length).toBeGreaterThan(0);
    }
  });

  it("finds no credential-shaped value under tests/fixtures", () => {
    const found = filesUnder(FIXTURES).map((path) => [path, credentialShapes(readFileSync(path, "utf8"))] as const);
    expect(found.filter(([, shapes]) => shapes.length > 0)).toEqual([]);
  });
});

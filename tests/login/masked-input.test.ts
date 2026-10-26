import { describe, expect, it } from "vitest";
import { applyInput, BULLET, maskOf } from "../../src/login/masked-input.ts";

describe("masked secret field (AC6)", () => {
  it("draws one bullet per character and nothing else", () => {
    expect(maskOf("sk-test")).toBe(BULLET.repeat(7));
    expect(maskOf("")).toBe("");
  });

  it("appends typed text after the bullets already drawn", () => {
    expect(applyInput("abc", "•••x")).toBe("abcx");
  });

  it("drops characters when the bullets at the end are deleted", () => {
    expect(applyInput("abc", "••")).toBe("ab");
    expect(applyInput("abc", "")).toBe("");
  });

  it("takes a paste at the end as given", () => {
    expect(applyInput("abc", "•••hello")).toBe("abchello");
  });
});

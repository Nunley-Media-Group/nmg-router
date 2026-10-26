import { describe, expect, it } from "vitest";
import { createSseSplitter, type SseRecord } from "../../src/translate/sse.ts";
import { randomPieces } from "../support/wire.ts";

function split(pieces: readonly string[]): SseRecord[] {
  const splitter = createSseSplitter();
  return pieces.flatMap((piece) => splitter.push(piece));
}

describe("SSE splitter", () => {
  const body = 'event: message\ndata: {"a":1}\n\n: a comment\ndata: line one\ndata: line two\n\n';

  it("yields the same records however the text is cut", () => {
    const whole = split([body]);
    expect(whole).toEqual([
      { event: "message", data: '{"a":1}' },
      { event: undefined, data: "line one\nline two" },
    ]);
    for (let seed = 1; seed <= 40; seed++) {
      expect(split(randomPieces(body, seed))).toEqual(whole);
    }
  });

  it("does not split a CRLF that arrives across two pieces", () => {
    const records = split(["data: first\r", "\n\r", "\ndata: second\r\n\r\n"]);
    expect(records.map((record) => record.data)).toEqual(["first", "second"]);
  });

  it("emits nothing for a record whose blank line has not arrived", () => {
    expect(split(['data: {"partial":true}\n'])).toEqual([]);
  });
});

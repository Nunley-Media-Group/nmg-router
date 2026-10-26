import { describe, expect, it } from "vitest";
import { curlArgv, curlConfig, curlTransport, quote, readHead, type Spawn } from "../../src/transport/curl.ts";
import { TransportFailure } from "../../src/transport/types.ts";
import type { HttpRequestSpec } from "../../src/translate/types.ts";
import { fakeEngine, type ScriptedChild } from "../support/fake-engine.ts";

const spec: HttpRequestSpec = {
  url: "https://example.test/v1/chat/completions",
  method: "POST",
  headers: { authorization: "Bearer key-1", "x-title": 'say "hi"' },
  body: '{"text":"line\\nnext"}\n',
};

// A fake engine whose spawned child follows the script, and the spawn the transport uses.
function childFor(script: ScriptedChild) {
  const engine = fakeEngine({ platform: "linux", spawn: () => script });
  return { engine, spawn: engine.process.spawn as unknown as Spawn };
}

describe("curl argv and config", () => {
  it("puts only the URL in argv", () => {
    const argv = curlArgv(spec.url);
    expect(argv.join(" ")).not.toContain("key-1");
    expect(argv.at(-1)).toBe(spec.url);
    expect(argv).toContain("--include");
    expect(argv).toContain("--config");
  });

  it("writes the headers and the body into the config, escaping quotes and newlines", () => {
    const config = curlConfig(spec);
    expect(config).toContain('header = "authorization: Bearer key-1"');
    expect(config).toContain('header = "x-title: say \\"hi\\""');
    expect(config).toContain('data-binary = "{\\"text\\":\\"line\\\\nnext\\"}\\n"');
    expect(config.split("\n")).toHaveLength(5);
  });

  it("escapes backslashes, quotes, CR, LF and tabs", () => {
    expect(quote('a\\b"c\nd\re\tf')).toBe('"a\\\\b\\"c\\nd\\re\\tf"');
  });
});

describe("response head", () => {
  it("skips 100 Continue and returns the final header block with its body", () => {
    const head = readHead("HTTP/1.1 100 Continue\r\n\r\nHTTP/2 200\r\nContent-Type: text/event-stream\r\n\r\ndata: x\n\n");
    expect(head?.status).toBe(200);
    expect(head?.headers["content-type"]).toBe("text/event-stream");
    expect(head?.rest).toBe("data: x\n\n");
  });

  it("waits for the blank line that ends the header block", () => {
    expect(readHead("HTTP/2 200\r\nContent-Type: text/event")).toBeUndefined();
  });
});

describe("streaming through a child curl", () => {
  it("sends the request through the child, secrets on its stdin only, and yields each piece as it arrives", async () => {
    const { engine, spawn } = childFor({
      pieces: ["HTTP/2 200\r\ncontent-type: text/event-stream\r\n\r\n", "data: one\n\n", "data: two\n\n"],
      hang: true,
    });
    const response = await curlTransport(spawn).send(spec, new AbortController().signal);
    expect(response.status).toBe(200);
    const [call] = engine.recorded.processes;
    expect(call?.argv.join(" ")).not.toContain("key-1");
    expect(call?.stdin).toContain("Bearer key-1");
  });

  it("stops the pieces and ends the child when the signal aborts", async () => {
    const { engine, spawn } = childFor({
      pieces: ["HTTP/2 200\r\n\r\n", "data: one\n\n", "data: two\n\n"],
      hang: true,
    });
    const controller = new AbortController();
    const response = await curlTransport(spawn).send(spec, controller.signal);
    const pieces: string[] = [];
    for await (const piece of response.body) {
      pieces.push(piece);
      if (pieces.length === 1) controller.abort();
    }
    expect(pieces).toEqual(["data: one\n\n"]);
    expect(engine.recorded.events).toContain("child:killed");
  });

  it("fails as a transport failure when the child exits before a status", async () => {
    const { spawn } = childFor({ pieces: [], code: 6 });
    await expect(curlTransport(spawn).send(spec, new AbortController().signal)).rejects.toBeInstanceOf(TransportFailure);
  });
});

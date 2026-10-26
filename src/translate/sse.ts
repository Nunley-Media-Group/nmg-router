// Splits a server-sent-events body into complete records as text pieces arrive.
// A record ends at a blank line. A line may be split between pieces anywhere,
// including between a CR and its LF. An incomplete record at the end is dropped,
// as the SSE specification says.

export type SseRecord = { readonly event?: string; readonly data: string };

export type SseSplitter = {
  push(text: string): SseRecord[];
};

export function createSseSplitter(): SseSplitter {
  let line = "";
  let skipLf = false;
  let event: string | undefined;
  let data: string[] = [];

  function field(text: string): void {
    const colon = text.indexOf(":");
    const name = colon === -1 ? text : text.slice(0, colon);
    const value = colon === -1 ? "" : text.slice(colon + 1).replace(/^ /, "");
    if (name === "event") event = value;
    if (name === "data") data.push(value);
  }

  function endLine(out: SseRecord[]): void {
    if (line === "") {
      if (data.length > 0) out.push({ event, data: data.join("\n") });
      event = undefined;
      data = [];
    } else if (!line.startsWith(":")) {
      field(line);
    }
    line = "";
  }

  return {
    push(text) {
      const out: SseRecord[] = [];
      for (const ch of text) {
        if (skipLf) {
          skipLf = false;
          if (ch === "\n") continue;
        }
        if (ch === "\r" || ch === "\n") {
          endLine(out);
          skipLf = ch === "\r";
        } else {
          line += ch;
        }
      }
      return out;
    },
  };
}

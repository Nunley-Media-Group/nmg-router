import { describe, expect, it } from "vitest";
import { createTransportSelector } from "../../src/transport/select.ts";
import { fakeEngine } from "../support/fake-engine.ts";

describe("transport selection", () => {
  it("uses curl when `curl --version` exits 0, and probes once per session", async () => {
    const engine = fakeEngine({
      platform: "linux",
      run: (argv) => (argv[0] === "curl" ? { exitCode: 0, stdout: "curl 8", stderr: "", isStdoutTruncated: false, isStderrTruncated: false } : undefined),
    });
    const select = createTransportSelector({ process: engine.process, http: engine.http, spawn: engine.process.spawn as never });
    expect((await select()).name).toBe("curl");
    expect((await select()).name).toBe("curl");
    expect(engine.recorded.processes.filter((call) => call.argv[0] === "curl")).toHaveLength(1);
  });

  it("uses the whole-response fetch when curl cannot start", async () => {
    const engine = fakeEngine({ platform: "linux" });
    const select = createTransportSelector({ process: engine.process, http: engine.http, spawn: engine.process.spawn as never });
    expect((await select()).name).toBe("fetch");
  });
});

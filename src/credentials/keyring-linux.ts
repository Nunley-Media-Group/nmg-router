import type { ProcessRunResult } from "claude-code";
import { assertKeyringOk, probeTool, runKeyring, SERVICE, type CredentialHost, type KeyringBackend } from "./platform.ts";

const PLATFORM = "linux";
const NOT_FOUND = 1;

function isLocked(result: ProcessRunResult): boolean {
  return /locked|dismissed/i.test(result.stderr);
}

export function createLinuxKeyring(host: Pick<CredentialHost, "process" | "env">): KeyringBackend {
  return {
    async available() {
      if (!(await host.env.get("DBUS_SESSION_BUS_ADDRESS"))) {
        return false;
      }
      const probe = await probeTool(host, ["secret-tool", "lookup", "service", SERVICE, "account", `${SERVICE}/probe`]);
      return probe !== undefined && !/org\.freedesktop\.secrets|autolaunch/i.test(probe.stderr);
    },
    async save(provider, account, secret) {
      const key = `${provider}/${account}`;
      const result = await runKeyring(
        host,
        PLATFORM,
        provider,
        ["secret-tool", "store", "--label", `${SERVICE} ${key}`, "service", SERVICE, "account", key],
        secret,
      );
      assertKeyringOk(result, PLATFORM, provider, isLocked);
    },
    async read(provider, account) {
      const key = `${provider}/${account}`;
      const result = await runKeyring(host, PLATFORM, provider, [
        "secret-tool",
        "lookup",
        "service",
        SERVICE,
        "account",
        key,
      ]);
      if (result.exitCode === NOT_FOUND && result.stdout === "" && !isLocked(result)) {
        return undefined;
      }
      assertKeyringOk(result, PLATFORM, provider, isLocked);
      return result.stdout;
    },
    async delete(provider, account) {
      const key = `${provider}/${account}`;
      const result = await runKeyring(host, PLATFORM, provider, [
        "secret-tool",
        "clear",
        "service",
        SERVICE,
        "account",
        key,
      ]);
      assertKeyringOk(result, PLATFORM, provider, isLocked);
    },
  };
}

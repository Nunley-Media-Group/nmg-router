import type { ProcessRunResult } from "claude-code";
import { assertKeyringOk, probeTool, runKeyring, SERVICE, type CredentialHost, type KeyringBackend } from "./platform.ts";

const PLATFORM = "macos";
const NOT_FOUND = 44;
const LOCKED_CODES = [36, 51];

function isLocked(result: ProcessRunResult): boolean {
  return LOCKED_CODES.includes(result.exitCode) || result.stderr.includes("User interaction is not allowed");
}

export function createMacosKeyring(host: Pick<CredentialHost, "process">): KeyringBackend {
  return {
    async available() {
      return (await probeTool(host, ["security", "list-keychains"])) !== undefined;
    },
    async save(provider, account, secret) {
      const key = `${provider}/${account}`;
      // The secret rides on security's stdin as hex, never in argv.
      const line = `add-generic-password -U -s ${SERVICE} -a ${key} -X ${Buffer.from(secret, "utf8").toString("hex")}\n`;
      const result = await runKeyring(host, PLATFORM, provider, ["security", "-i"], line);
      assertKeyringOk(result, PLATFORM, provider, isLocked);
    },
    async read(provider, account) {
      const key = `${provider}/${account}`;
      const result = await runKeyring(host, PLATFORM, provider, [
        "security",
        "find-generic-password",
        "-s",
        SERVICE,
        "-a",
        key,
        "-w",
      ]);
      if (result.exitCode === NOT_FOUND) {
        return undefined;
      }
      assertKeyringOk(result, PLATFORM, provider, isLocked);
      return result.stdout.replace(/\n$/, "");
    },
    async delete(provider, account) {
      const key = `${provider}/${account}`;
      const result = await runKeyring(host, PLATFORM, provider, [
        "security",
        "delete-generic-password",
        "-s",
        SERVICE,
        "-a",
        key,
      ]);
      if (result.exitCode !== NOT_FOUND) {
        assertKeyringOk(result, PLATFORM, provider, isLocked);
      }
    },
  };
}

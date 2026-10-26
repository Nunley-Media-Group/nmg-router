import type { EngineInterface } from "claude-code";
import { NoKeyringError } from "../errors/errors.ts";
import {
  KEYRING_SERVICE,
  accountKey,
  keyringError,
  runKeyringTool,
  type CredentialBackend,
} from "./platform.ts";

const PLATFORM = "linux";
// `secret-tool lookup` exits 1 with empty stdout when nothing matches.
const NOT_FOUND = 1;
const LOCKED_TEXT = /locked|dismissed/i;
// The Secret Service is not on the bus, or D-Bus could not start it.
const NO_SECRET_SERVICE_TEXT = /org\.freedesktop\.secrets[^\n]*(not provided|ServiceUnknown)|autolaunch/i;

export type LinuxKeyringDeps = Pick<EngineInterface, "env" | "process">;

export function createLinuxKeyring(deps: LinuxKeyringDeps): CredentialBackend {
  // Runs secret-tool. With no session bus there is no Secret Service to reach,
  // and a missing Secret Service means no keyring rather than a failure.
  async function tool(provider: string, argv: readonly string[], stdin?: string) {
    if (!(await deps.env.get("DBUS_SESSION_BUS_ADDRESS"))) {
      throw new NoKeyringError(PLATFORM);
    }
    const result = await runKeyringTool(deps, PLATFORM, provider, argv, stdin);
    if (result.exitCode !== 0 && NO_SECRET_SERVICE_TEXT.test(result.stderr)) {
      throw new NoKeyringError(PLATFORM);
    }
    return result;
  }

  return {
    async save(provider, account, secret) {
      const key = accountKey(provider, account);
      const result = await tool(
        provider,
        ["secret-tool", "store", "--label", `${KEYRING_SERVICE} ${key}`, "service", KEYRING_SERVICE, "account", key],
        secret,
      );
      if (result.exitCode !== 0) {
        throw keyringError(PLATFORM, provider, result, LOCKED_TEXT.test(result.stderr));
      }
    },
    async read(provider, account) {
      const key = accountKey(provider, account);
      const result = await tool(provider, ["secret-tool", "lookup", "service", KEYRING_SERVICE, "account", key]);
      const locked = LOCKED_TEXT.test(result.stderr);
      if (result.exitCode === NOT_FOUND && result.stdout === "" && !locked) return undefined;
      if (result.exitCode !== 0) throw keyringError(PLATFORM, provider, result, locked);
      return result.stdout;
    },
    async delete(provider, account) {
      const key = accountKey(provider, account);
      const result = await tool(provider, ["secret-tool", "clear", "service", KEYRING_SERVICE, "account", key]);
      if (result.exitCode !== 0) {
        throw keyringError(PLATFORM, provider, result, LOCKED_TEXT.test(result.stderr));
      }
    },
  };
}

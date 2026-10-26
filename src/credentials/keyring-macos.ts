import {
  KEYRING_SERVICE,
  accountKey,
  keyringError,
  runKeyringTool,
  type CredentialBackend,
  type ProcessDeps,
} from "./platform.ts";

const PLATFORM = "macos";
// `security` exits 44 when no item matches.
const NOT_FOUND = 44;
// 36 and 51 are the locked-keychain and interaction-denied codes.
const LOCKED_EXIT_CODES = new Set([36, 51]);
const LOCKED_TEXT = /User interaction is not allowed/;

function toHex(text: string): string {
  return Array.from(new TextEncoder().encode(text), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isLocked(exitCode: number, stderr: string): boolean {
  return LOCKED_EXIT_CODES.has(exitCode) || LOCKED_TEXT.test(stderr);
}

export function createMacosKeyring(deps: ProcessDeps): CredentialBackend {
  return {
    async save(provider, account, secret) {
      // `security -i` reads the command from stdin, so the secret never reaches argv.
      const command = `add-generic-password -U -s ${KEYRING_SERVICE} -a ${accountKey(provider, account)} -X ${toHex(secret)}\n`;
      const result = await runKeyringTool(deps, PLATFORM, provider, ["security", "-i"], command);
      if (result.exitCode !== 0) {
        throw keyringError(PLATFORM, provider, result, isLocked(result.exitCode, result.stderr));
      }
    },
    async read(provider, account) {
      const result = await runKeyringTool(deps, PLATFORM, provider, [
        "security",
        "find-generic-password",
        "-s",
        KEYRING_SERVICE,
        "-a",
        accountKey(provider, account),
        "-w",
      ]);
      if (result.exitCode === NOT_FOUND) return undefined;
      if (result.exitCode !== 0) {
        throw keyringError(PLATFORM, provider, result, isLocked(result.exitCode, result.stderr));
      }
      return result.stdout.replace(/\n$/, "");
    },
    async delete(provider, account) {
      const result = await runKeyringTool(deps, PLATFORM, provider, [
        "security",
        "delete-generic-password",
        "-s",
        KEYRING_SERVICE,
        "-a",
        accountKey(provider, account),
      ]);
      if (result.exitCode === NOT_FOUND) return;
      if (result.exitCode !== 0) {
        throw keyringError(PLATFORM, provider, result, isLocked(result.exitCode, result.stderr));
      }
    },
  };
}

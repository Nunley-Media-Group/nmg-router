import { CredentialError } from "../errors/errors.ts";
import {
  KEYRING_SERVICE,
  accountKey,
  fromBase64,
  keyringError,
  runKeyringTool,
  toBase64,
  type CredentialBackend,
  type ProcessDeps,
} from "./platform.ts";

const PLATFORM = "windows";
const POWERSHELL = ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", "-"];
// The script exits 2 when no credential matches.
const NOT_FOUND = 2;

// Credential Manager's generic-credential API, called through P/Invoke.
const NATIVE_SOURCE = `using System;
using System.Runtime.InteropServices;
public static class NmgRouterCredential {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct NativeCredential {
    public uint Flags;
    public uint Type;
    public string TargetName;
    public string Comment;
    public long LastWritten;
    public uint CredentialBlobSize;
    public IntPtr CredentialBlob;
    public uint Persist;
    public uint AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias;
    public string UserName;
  }
  [DllImport("advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CredWrite(ref NativeCredential credential, uint flags);
  [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CredRead(string target, uint type, uint reserved, out IntPtr credential);
  [DllImport("advapi32.dll", EntryPoint = "CredDeleteW", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CredDelete(string target, uint type, uint flags);
  [DllImport("advapi32.dll", SetLastError = true)]
  static extern void CredFree(IntPtr buffer);

  const uint TypeGeneric = 1;
  const uint PersistLocalMachine = 2;

  // Returns 0 on success, otherwise the Win32 error code.
  public static int Write(string target, byte[] secret) {
    IntPtr blob = Marshal.AllocHGlobal(secret.Length);
    try {
      Marshal.Copy(secret, 0, blob, secret.Length);
      NativeCredential credential = new NativeCredential();
      credential.Type = TypeGeneric;
      credential.TargetName = target;
      credential.UserName = target;
      credential.CredentialBlobSize = (uint)secret.Length;
      credential.CredentialBlob = blob;
      credential.Persist = PersistLocalMachine;
      return CredWrite(ref credential, 0) ? 0 : Marshal.GetLastWin32Error();
    } finally {
      Marshal.FreeHGlobal(blob);
    }
  }

  public static int Read(string target, out byte[] secret) {
    secret = null;
    IntPtr found;
    if (!CredRead(target, TypeGeneric, 0, out found)) return Marshal.GetLastWin32Error();
    try {
      NativeCredential credential = (NativeCredential)Marshal.PtrToStructure(found, typeof(NativeCredential));
      secret = new byte[credential.CredentialBlobSize];
      Marshal.Copy(credential.CredentialBlob, secret, 0, secret.Length);
      return 0;
    } finally {
      CredFree(found);
    }
  }

  public static int Delete(string target) {
    return CredDelete(target, TypeGeneric, 0) ? 0 : Marshal.GetLastWin32Error();
  }
}`;

// Only the target, the mode and the base64 secret are written into the script;
// the script arrives on stdin, so the secret is never part of argv.
function script(mode: "write" | "read" | "delete", target: string, secretBase64: string): string {
  return `$ErrorActionPreference = 'Stop'
$mode = '${mode}'
$target = '${target}'
$blob = '${secretBase64}'
Add-Type -TypeDefinition @"
${NATIVE_SOURCE}
"@
if ($mode -eq 'write') {
  $code = [NmgRouterCredential]::Write($target, [Convert]::FromBase64String($blob))
  if ($code -ne 0) { exit 1 }
} elseif ($mode -eq 'read') {
  $bytes = $null
  $code = [NmgRouterCredential]::Read($target, [ref]$bytes)
  if ($code -eq 1168) { exit 2 }
  if ($code -ne 0) { exit 1 }
  [Console]::Out.Write([Convert]::ToBase64String($bytes))
} else {
  $code = [NmgRouterCredential]::Delete($target)
  if ($code -eq 1168) { exit 2 }
  if ($code -ne 0) { exit 1 }
}
`;
}

function targetOf(provider: string, account: string): string {
  return `${KEYRING_SERVICE}:${accountKey(provider, account)}`;
}

export function createWindowsKeyring(deps: ProcessDeps): CredentialBackend {
  return {
    async save(provider, account, secret) {
      const body = script("write", targetOf(provider, account), toBase64(new TextEncoder().encode(secret)));
      const result = await runKeyringTool(deps, PLATFORM, provider, POWERSHELL, body);
      if (result.exitCode !== 0) throw keyringError(PLATFORM, provider, result, false);
    },
    async read(provider, account) {
      const body = script("read", targetOf(provider, account), "");
      const result = await runKeyringTool(deps, PLATFORM, provider, POWERSHELL, body);
      if (result.exitCode === NOT_FOUND) return undefined;
      if (result.exitCode !== 0) throw keyringError(PLATFORM, provider, result, false);
      try {
        return new TextDecoder().decode(fromBase64(result.stdout.trim()));
      } catch {
        throw new CredentialError("keyring_failed", { platform: PLATFORM, provider, exitCode: 0 });
      }
    },
    async delete(provider, account) {
      const body = script("delete", targetOf(provider, account), "");
      const result = await runKeyringTool(deps, PLATFORM, provider, POWERSHELL, body);
      if (result.exitCode === NOT_FOUND) return;
      if (result.exitCode !== 0) throw keyringError(PLATFORM, provider, result, false);
    },
  };
}

import { assertKeyringOk, probeTool, runKeyring, SERVICE, type CredentialHost, type KeyringBackend } from "./platform.ts";

const PLATFORM = "windows";
const POWERSHELL = ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", "-"];
const CRED_TYPE_GENERIC = 1;
const CRED_PERSIST_LOCAL_MACHINE = 2;
const NOT_FOUND = 2;

const NATIVE_TYPES = `Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace NmgRouter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct Credential {
    public int Flags;
    public int Type;
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
  public static class Advapi32 {
    [DllImport("advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredWrite(ref Credential credential, uint flags);
    [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredRead(string target, uint type, uint flags, out IntPtr credential);
    [DllImport("advapi32.dll", EntryPoint = "CredDeleteW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredDelete(string target, uint type, uint flags);
    [DllImport("advapi32.dll")]
    public static extern void CredFree(IntPtr buffer);
  }
}
'@`;

function targetOf(provider: string, account: string): string {
  return `${SERVICE}:${provider}/${account}`;
}

function saveScript(target: string, secretBase64: string): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    NATIVE_TYPES,
    `$target = '${target}'`,
    `$secret = [Convert]::FromBase64String('${secretBase64}')`,
    "$blob = [Runtime.InteropServices.Marshal]::AllocHGlobal($secret.Length)",
    "try {",
    "  [Runtime.InteropServices.Marshal]::Copy($secret, 0, $blob, $secret.Length)",
    "  $credential = New-Object NmgRouter.Credential",
    `  $credential.Type = ${CRED_TYPE_GENERIC}`,
    "  $credential.TargetName = $target",
    "  $credential.CredentialBlobSize = [uint32]$secret.Length",
    "  $credential.CredentialBlob = $blob",
    `  $credential.Persist = ${CRED_PERSIST_LOCAL_MACHINE}`,
    "  if (-not [NmgRouter.Advapi32]::CredWrite([ref]$credential, 0)) { exit 3 }",
    "} finally {",
    "  [Runtime.InteropServices.Marshal]::FreeHGlobal($blob)",
    "}",
  ].join("\n");
}

function readScript(target: string): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    NATIVE_TYPES,
    `$target = '${target}'`,
    "$pointer = [IntPtr]::Zero",
    `if (-not [NmgRouter.Advapi32]::CredRead($target, ${CRED_TYPE_GENERIC}, 0, [ref]$pointer)) {`,
    "  if ([Runtime.InteropServices.Marshal]::GetLastWin32Error() -eq 1168) { exit 2 }",
    "  exit 3",
    "}",
    "try {",
    "  $credential = [Runtime.InteropServices.Marshal]::PtrToStructure($pointer, [Type]'NmgRouter.Credential')",
    "  $bytes = New-Object byte[] $credential.CredentialBlobSize",
    "  [Runtime.InteropServices.Marshal]::Copy($credential.CredentialBlob, $bytes, 0, $credential.CredentialBlobSize)",
    "  [Console]::Out.Write([Convert]::ToBase64String($bytes))",
    "} finally {",
    "  [NmgRouter.Advapi32]::CredFree($pointer)",
    "}",
  ].join("\n");
}

function deleteScript(target: string): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    NATIVE_TYPES,
    `$target = '${target}'`,
    `if (-not [NmgRouter.Advapi32]::CredDelete($target, ${CRED_TYPE_GENERIC}, 0)) {`,
    "  if ([Runtime.InteropServices.Marshal]::GetLastWin32Error() -eq 1168) { exit 2 }",
    "  exit 3",
    "}",
  ].join("\n");
}

// Windows credential calls have no locked state: a failure is always a failure.
const isLocked = () => false;

export function createWindowsKeyring(host: Pick<CredentialHost, "process">): KeyringBackend {
  return {
    async available() {
      return (await probeTool(host, POWERSHELL, "exit 0")) !== undefined;
    },
    async save(provider, account, secret) {
      const script = saveScript(targetOf(provider, account), Buffer.from(secret, "utf8").toString("base64"));
      const result = await runKeyring(host, PLATFORM, provider, POWERSHELL, script);
      assertKeyringOk(result, PLATFORM, provider, isLocked);
    },
    async read(provider, account) {
      const result = await runKeyring(host, PLATFORM, provider, POWERSHELL, readScript(targetOf(provider, account)));
      if (result.exitCode === NOT_FOUND) {
        return undefined;
      }
      assertKeyringOk(result, PLATFORM, provider, isLocked);
      return Buffer.from(result.stdout.trim(), "base64").toString("utf8");
    },
    async delete(provider, account) {
      const result = await runKeyring(host, PLATFORM, provider, POWERSHELL, deleteScript(targetOf(provider, account)));
      if (result.exitCode !== NOT_FOUND) {
        assertKeyringOk(result, PLATFORM, provider, isLocked);
      }
    },
  };
}

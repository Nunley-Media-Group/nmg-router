import type { HostPort } from "./host.ts";

// The mod's version, from its plugin manifest. The OpenCode Go User-Agent carries it.
// It is read from the manifest, never from a copy in source, so it cannot drift.

export async function readPluginVersion(fs: Pick<HostPort["fs"], "exists" | "read">, root: string): Promise<string> {
  for (const path of [`${root}/.claude-plugin/plugin.json`, `${root}/plugin.json`]) {
    if (!(await fs.exists(path))) continue;
    const manifest = JSON.parse(await fs.read(path)) as { version?: unknown };
    if (typeof manifest.version === "string" && manifest.version !== "") return manifest.version;
  }
  throw new Error("nmg-router could not read its version from the plugin manifest");
}

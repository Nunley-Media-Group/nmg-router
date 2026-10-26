// The routed auto-mode permission setting: which decider answers a routed tool call
// that no rule settles. The /config row decides when it is set. When it is unset, the
// default follows whether the session holds a first-party Anthropic login. The login
// is read as present or absent only, and its handle is never kept.

export const PERMISSION_MODES = ["claude-classifier", "server-classifier-off"] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];

export const CONFIG_KEY = "nmg-router.routedAutoPermissions";
const OPTION_NAME = "routedAutoPermissions";

export function isPermissionMode(value: unknown): value is PermissionMode {
  return typeof value === "string" && (PERMISSION_MODES as readonly string[]).includes(value);
}

export function effectiveMode(row: string | undefined, hasLogin: boolean): PermissionMode {
  if (isPermissionMode(row)) return row;
  return hasLogin ? "claude-classifier" : "server-classifier-off";
}

export type ModeHost = {
  readonly config: { list(): Promise<readonly { readonly key: string; readonly value: unknown }[]> };
  readonly session: { authorize(): Promise<unknown> };
};

export type ModeReader = (host: ModeHost) => Promise<PermissionMode>;

// `options` are the plugin's own userConfig values, read when the /config row gives no mode.
export function createModeReader(options: Readonly<Record<string, unknown>>): ModeReader {
  // Evaluated once per session, and only when a set row does not already decide.
  let login: Promise<boolean> | undefined;
  const hasFirstPartyLogin = (host: ModeHost): Promise<boolean> =>
    (login ??= host.session.authorize().then(
      (handle) => handle !== null,
      () => false,
    ));

  return async (host) => {
    const row = await host.config.list().then(
      (rows) => rows.find((entry) => entry.key === CONFIG_KEY)?.value,
      () => undefined,
    );
    const set = [row, options[OPTION_NAME]].find(isPermissionMode);
    if (set !== undefined) return set;
    return effectiveMode(undefined, await hasFirstPartyLogin(host));
  };
}

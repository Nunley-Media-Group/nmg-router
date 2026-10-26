// The session's permission mode, as the classic events report it. Auto mode is the
// one mode the routed check acts in. An event that carries no mode keeps the last one.

export type PermissionModeTracker = {
  observe(event: { readonly permission_mode?: string | undefined }): void;
  isAuto(): boolean;
};

export function createPermissionModeTracker(): PermissionModeTracker {
  let latest: string | undefined;
  return {
    observe(event) {
      if (event.permission_mode !== undefined) latest = event.permission_mode;
    },
    isAuto: () => latest === "auto",
  };
}

import type { CommandRunArgs, RenderElement } from "claude-code";
import type { HostPort } from "../host.ts";
import { loginToProvider } from "../login/login-command.ts";
import { createPaneController, type PaneHold } from "../login/pane.ts";
import type { SpeedMap } from "../routing/metrics.ts";
import type { Services } from "../services.ts";
import { ALL_SCOPE, hubView, isOverContext, withQuery, withScope, type HubState } from "./hub-state.ts";
import { drawHub, focusableKeys, type HubActions, type HubElements } from "./hub-view.ts";
import { recentOf, RECENT_KEY, type RecentMap } from "./recent.ts";
import { hubSources, type HubRow, type HubSource } from "./sources.ts";

// The hub's one pane. Its state lives here; the pane's closures and the hooks change
// it and redraw. A pick the transcript does not fit is refused and the pane stays open;
// any other pick closes the pane and runs `/model <id>` through the command hook.
//
// A locked provider's login runs inside this pane. The host places a pane opened
// after a press's await only from 110 columns, so a separate login pane, or this one
// reopened after the login, would wait undrawn on a narrower terminal.

export const HUB_PANE_ID = "nmg-router-models";
const HUB_TITLE = "Models";
const SPEED_KEY = "metrics.speed";

export type HubHost = Pick<HostPort, "env" | "fs" | "http" | "process" | "store"> & {
  readonly ui: HostPort["ui"] & { toast(text: string): void };
  readonly session: {
    model(): Promise<string>;
    usage(): Promise<{ readonly context: { readonly tokens?: number } }>;
  };
  readonly command: { run(input: CommandRunArgs): Promise<unknown> };
};

export type HubController = {
  // Opens the hub on `scope`, reading the catalog, the credentials and the recent use first.
  open(host: HubHost, scope?: string): Promise<void>;
  draw(elements: HubElements): RenderElement;
  // Called on `ui.focus`: a row button taking the ring shows its detail line.
  focused(element: string | undefined): void;
  // Called on `ui.close`: true when a person's Esc only clears a non-empty search, so the close is refused.
  refusesClose(origin: { readonly kind: string }): boolean;
};

export function createHubController(services: Services): HubController {
  let host: HubHost | undefined;
  let state: HubState | undefined;
  let sources: readonly HubSource[] = [];
  let recent: RecentMap = {};
  // Providers whose list the hub has refreshed this session, so each refreshes once.
  const refreshed = new Set<string>();
  // The key of the element the focus ring rests on, from `ui.focus`.
  let ring: string | undefined;
  // The login steps drawn in the hub's pane, and the hold of the login running there.
  const loginPane = createPaneController({ id: HUB_PANE_ID, lent: true });
  let loginHold: PaneHold | undefined;
  const loggingIn = (): boolean => loginHold !== undefined && !loginHold.closed;

  const redraw = (): void => host?.ui.invalidate("ui.render");

  // The host's ring holds a position, so a redraw that changes the rows or the view
  // would move it onto another element, or off the pane. This puts it back by key: on
  // the login button in the locked view, else where it was, else on the search field.
  function keepRing(): void {
    const current = host;
    // A login drawn in the pane places its own ring.
    if (current === undefined || state === undefined || loggingIn()) return;
    const view = hubView(state, sources, recent);
    const keys = focusableKeys(view);
    const key = view.mode === "locked" ? "login" : ring !== undefined && keys.includes(ring) ? ring : "search";
    current.ui.focus({ requestId: HUB_PANE_ID, key }).catch(() => undefined);
  }

  function patch(changes: Partial<HubState>): void {
    if (state === undefined) return;
    state = { ...state, ...changes };
    redraw();
  }

  async function contextOf(current: HubHost): Promise<number> {
    try {
      return (await current.session.usage()).context.tokens ?? 0;
    } catch {
      return 0;
    }
  }

  // The lists the hub draws: a provider without a stored login is locked.
  async function rebuild(current: HubHost): Promise<void> {
    const providers = services.catalog.enabledProviders();
    const locked = new Set<string>();
    for (const plugin of providers) {
      if (plugin.login.kind === "none") continue;
      if ((await services.credentials.list(plugin.identity.id)).length === 0) locked.add(plugin.identity.id);
    }
    const speeds = (await current.store.get(SPEED_KEY)) as SpeedMap | undefined;
    recent = recentOf(await current.store.get(RECENT_KEY));
    sources = hubSources({
      providers: providers.map((plugin) => ({
        id: plugin.identity.id,
        name: plugin.identity.name,
        locked: locked.has(plugin.identity.id),
      })),
      models: services.catalog.models(),
      speeds: speeds ?? {},
      refresh: (providerId) => services.catalog.refresh(providerId),
    });
  }

  // The first time a provider's entry is the scope in a session, its list refreshes.
  // A failed refresh keeps the cached rows, and the catalog records its status.
  async function refreshScope(scope: string): Promise<void> {
    const current = host;
    if (scope === ALL_SCOPE || current === undefined || refreshed.has(scope)) return;
    refreshed.add(scope);
    patch({ refreshing: new Set([...(state?.refreshing ?? []), scope]) });
    try {
      await sources.find((source) => source.id === scope)?.refresh?.();
      await rebuild(current);
    } catch {
      // The cached rows stay; the catalog's status says what failed.
    } finally {
      if (state !== undefined) patch({ refreshing: new Set([...state.refreshing].filter((id) => id !== scope)) });
      keepRing();
    }
  }

  async function open(current: HubHost, scope: string): Promise<void> {
    host = current;
    try {
      await services.catalog.load();
      await rebuild(current);
      const base: HubState = {
        scope: ALL_SCOPE,
        query: "",
        view: "list",
        refreshing: new Set(),
        currentModel: await current.session.model(),
        contextTokens: await contextOf(current),
      };
      const next = withScope(base, scope, sources);
      const opened = await current.ui.open({
        id: HUB_PANE_ID,
        title: HUB_TITLE,
        focus: true,
        closeOnEscape: true,
      });
      if (!opened.isPlaced) {
        current.ui.log(`The model hub could not be shown: ${opened.reason}`);
        return;
      }
      state = next;
      ring = undefined;
      void refreshScope(next.scope);
    } catch {
      state = undefined;
      current.ui.log("/model could not open the model hub. Nothing was changed.");
    }
  }

  // Runs a pane action's work, reporting a failure in the transcript instead of throwing.
  function settle(work: () => Promise<void>): void {
    work().catch(() => host?.ui.log("The model hub stopped on an unexpected error."));
  }

  async function pick(row: HubRow): Promise<void> {
    const current = host;
    const shown = state;
    if (current === undefined || shown === undefined) return;
    // The mod never starts a compaction (#4): `$.session.compact()` skips the mod's own
    // hook and sends a routed transcript to Anthropic. So a pick the transcript does not
    // fit is refused and the pane stays open.
    if (isOverContext(row, shown.contextTokens)) {
      const notice = `Kept ${shown.currentModel}: this conversation is larger than ${row.switchArg}'s window.`;
      patch({ notice });
      current.ui.toast(notice);
      return;
    }
    await current.ui.close({ id: HUB_PANE_ID });
    await current.command.run({ command: "model", args: row.switchArg });
  }

  // A locked provider's login: its steps draw in the hub's pane, and a saved login
  // returns the hub to that provider's list. The hold is taken before any await, while
  // the press is still the person's.
  async function login(providerId: string): Promise<void> {
    const current = host;
    if (current === undefined || loggingIn()) return;
    const begun = await loginPane.begin(current, HUB_TITLE);
    if (!begun.isPlaced) {
      current.ui.log(`The login could not be shown: ${begun.reason}`);
      return;
    }
    loginHold = begun.hold;
    let outcome;
    try {
      outcome = await loginToProvider(current, providerId, { ...services, pane: loginPane });
    } finally {
      await loginPane.end(begun.hold);
      if (loginHold === begun.hold) loginHold = undefined;
      redraw();
    }
    current.ui.log(outcome.text);
    if (!outcome.ok || state === undefined) return;
    refreshed.add(providerId);
    await rebuild(current);
    state = withScope(state, providerId, sources);
    ring = undefined;
    redraw();
    keepRing();
  }

  const actions: HubActions = {
    selectScope(id) {
      if (state === undefined) return;
      state = withScope(state, id, sources);
      redraw();
      keepRing();
      void refreshScope(state.scope);
    },
    setQuery(text) {
      if (state === undefined) return;
      state = withQuery(state, text, sources, recent);
      redraw();
    },
    pick: (row) => settle(() => pick(row)),
    submit() {
      if (state === undefined) return;
      const highlighted = state.highlighted;
      const rows = hubView(state, sources, recent).rows;
      const target = rows.find((row) => row.key === highlighted) ?? rows[0];
      if (target !== undefined) settle(() => pick(target.row));
    },
    login: (providerId) => settle(() => login(providerId)),
  };

  return {
    open: (current, scope = ALL_SCOPE) => open(current, scope),
    draw(elements) {
      if (loggingIn()) return loginPane.draw(elements);
      if (state === undefined) return elements.Box({ children: [] });
      return drawHub(elements, hubView(state, sources, recent), actions);
    },
    focused(element) {
      ring = element;
      if (state === undefined || element === undefined || !element.startsWith("row:")) return;
      if (state.highlighted !== element) patch({ highlighted: element });
    },
    refusesClose(origin) {
      if (origin.kind === "person" && loggingIn()) {
        // Esc during the login cancels it and returns to the hub.
        loginPane.closedByHost();
        redraw();
        keepRing();
        return true;
      }
      if (state === undefined || origin.kind !== "person" || state.query === "") return false;
      state = withQuery(state, "", sources, recent);
      redraw();
      return true;
    },
  };
}

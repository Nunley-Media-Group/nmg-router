import type { EngineInterface, Register } from "claude-code";
import type { HostPort } from "../src/host.ts";
import { createAutoTrigger, type AutoTrigger, type TriggerDeps } from "../src/compaction/auto-trigger.ts";
import { compactFailure, compactSession, type CompactDeps } from "../src/compaction/compact-hook.ts";
import { createRoutedView } from "../src/compaction/routed-view.ts";
import { createCommandFlows, type FlowHost } from "../src/login/command-flow.ts";
import { handleLogin } from "../src/login/login-command.ts";
import { handleLogout } from "../src/login/logout-command.ts";
import { createPaneController, PANE_ID } from "../src/login/pane.ts";
import { createPersonApproval } from "../src/permissions/person-approval.ts";
import { createPermissionModeTracker } from "../src/permissions/permission-mode.ts";
import { createModeReader, type PermissionMode } from "../src/permissions/mode.ts";
import { checkFailed, checkRoutedTool, type ToolCheckDeps } from "../src/permissions/tool-check.ts";
import { createHubController, HUB_PANE_ID, type HubController, type HubHost } from "../src/hub/hub-controller.ts";
import { handleModelCommand } from "../src/hub/model-command.ts";
import { watchModelPickerRows, type ModelPickerRowsWatch } from "../src/hub/settings-rows.ts";
import { createComposeCapture } from "../src/routing/compose-capture.ts";
import { createRouter, type Router, type RouterHost } from "../src/routing/router.ts";
import { createSessionTracker } from "../src/routing/session-tracker.ts";
import { routeStep, routeStepFailed } from "../src/routing/turn-step.ts";
import { createServices, type Services } from "../src/services.ts";
import { createUsageMonitor } from "../src/usage/monitor.ts";
import { handleUsage, type UsageCommandDeps } from "../src/usage/usage-command.ts";

// Wires /login, /logout, /usage, the login pane, the model hub, the routed turns, routed
// compaction and routed auto-mode permissions to src/. The host reads a name, key or
// path only where it is written literally at a call site, so the port spells out each
// environment name and store key the mod uses. One pane serves the engine: a
// command opens it, and the render and close hooks draw it and settle it. The
// command hook opens the pane, answers, and the flow runs after it (command-flow.ts).
// The hub's pane is drawn by its own hooks, and its picks run after the hook answers.
// The turn hooks answer routed models and pass Claude through. The compaction and
// permission hooks answer routed calls and pass Claude's through.

function unknownName(kind: string, name: string): Error {
  return new Error(`nmg-router does not use the ${kind} "${name}"`);
}

// Every host surface the mod uses, as functions, each called at its own call site.
function hostPort($: EngineInterface): RouterHost {
  return {
    env: {
      get: (name) => {
        switch (name) {
          case "APPDATA":
            return $.env.get("APPDATA");
          case "CLAUDE_CONFIG_DIR":
            return $.env.get("CLAUDE_CONFIG_DIR");
          case "DBUS_SESSION_BUS_ADDRESS":
            return $.env.get("DBUS_SESSION_BUS_ADDRESS");
          case "HOME":
            return $.env.get("HOME");
          case "LOCALAPPDATA":
            return $.env.get("LOCALAPPDATA");
          case "OS":
            return $.env.get("OS");
          case "USERPROFILE":
            return $.env.get("USERPROFILE");
          case "XDG_CONFIG_HOME":
            return $.env.get("XDG_CONFIG_HOME");
          case "XDG_DATA_HOME":
            return $.env.get("XDG_DATA_HOME");
          default:
            throw unknownName("environment variable", name);
        }
      },
    },
    fs: {
      exists: (path) => $.fs.exists(path),
      read: (path) => $.fs.read(path),
      write: (path, text) => $.fs.write(path, text),
    },
    http: { fetch: (url, init) => $.http.fetch(url, init) },
    process: {
      run: (argv, init) => $.process.run(argv, init),
      spawn: (request) => $.process.spawn(request),
    },
    store: {
      get: (key) => {
        switch (key) {
          case "accounts.active":
            return $.store.get("accounts.active");
          case "accounts.labels":
            return $.store.get("accounts.labels");
          case "catalog.cache":
            return $.store.get("catalog.cache");
          case "credentials.index":
            return $.store.get("credentials.index");
          case "metrics.speed":
            return $.store.get("metrics.speed");
          case "models.recent":
            return $.store.get("models.recent");
          default:
            throw unknownName("store key", key);
        }
      },
      set: (key, value) => {
        switch (key) {
          case "accounts.active":
            return $.store.set("accounts.active", value);
          case "accounts.labels":
            return $.store.set("accounts.labels", value);
          case "catalog.cache":
            return $.store.set("catalog.cache", value);
          case "credentials.index":
            return $.store.set("credentials.index", value);
          case "metrics.speed":
            return $.store.set("metrics.speed", value);
          case "models.recent":
            return $.store.set("models.recent", value);
          default:
            throw unknownName("store key", key);
        }
      },
      delete: (key) => {
        switch (key) {
          case "accounts.active":
            return $.store.delete("accounts.active");
          case "accounts.labels":
            return $.store.delete("accounts.labels");
          case "catalog.cache":
            return $.store.delete("catalog.cache");
          case "credentials.index":
            return $.store.delete("credentials.index");
          case "metrics.speed":
            return $.store.delete("metrics.speed");
          case "models.recent":
            return $.store.delete("models.recent");
          default:
            throw unknownName("store key", key);
        }
      },
    },
    ui: {
      log: (text, options) => $.ui.log(text, options),
      open: (args) => $.ui.open(args),
      close: (args) => $.ui.close(args),
      focus: (args) => $.ui.focus(args),
      invalidate: (event) => $.ui.invalidate(event),
      status: (text) => $.ui.status(text),
      ask: (question, options) => $.ui.ask(question, options),
    },
    session: {
      id: () => $.session.id(),
      messages: (args) => $.session.messages({ as: "api", agentId: args.agentId }),
      model: () => $.session.model(),
      cwd: () => $.session.cwd(),
      authorize: () => $.session.authorize(),
    },
    settings: { read: () => $.settings.read({ source: "user" }) },
    model: { classify: (text, labels) => $.model.classify(text, labels) },
    config: { list: () => $.config.list() },
    clock: { after: (ms, fn) => $.clock.after(ms, fn) },
    prompt: { compose: (args) => $.prompt.compose(args) },
    tool: { list: () => $.tool.list() },
    pluginRoot: () => $.plugin.root,
  };
}

// The model hub's port: the host port, plus the toast, the session's usage and
// `/model` runs. Each function calls the engine at its own call site.
function hubHost($: EngineInterface): HubHost {
  const port = hostPort($);
  return {
    env: port.env,
    fs: port.fs,
    http: port.http,
    process: port.process,
    store: port.store,
    settings: port.settings,
    clock: port.clock,
    ui: { ...port.ui, toast: (text) => $.ui.toast(text) },
    session: {
      model: () => $.session.model(),
      usage: () => $.session.usage(),
    },
    command: { run: (input) => $.command.run(input) },
  };
}

export const register: Register = (on, options) => {
  const pane = createPaneController();
  const flows = createCommandFlows();
  const capture = createComposeCapture();
  const tracker = createSessionTracker();
  // The usage readings the routed status line and `/usage` share.
  const usage = createUsageMonitor();
  const permissionMode = createPermissionModeTracker();
  const readMode = createModeReader(options);
  const view = createRoutedView();
  const askPerson = createPersonApproval();
  let router: Router | undefined;
  let trigger: AutoTrigger | undefined;
  let hub: HubController | undefined;

  // One services set per engine, shared by the login hooks and the model hub, so a
  // catalog refresh from either one also syncs the model picker rows in settings.json.
  let shared: Services | undefined;
  let modelPickerRows: ModelPickerRowsWatch | undefined;
  const servicesFor = (host: HostPort): Services => {
    if (shared !== undefined) return shared;
    const services = createServices(host, { pane });
    modelPickerRows = watchModelPickerRows(services.catalog, host, services.platform);
    shared = services;
    return services;
  };
  const hubFor = (host: HubHost): HubController => (hub ??= createHubController(servicesFor(host)));

  // The router and the compaction and permission deps share one host, the first one
  // a hook built, as the router always has. They take a port, never `$`.
  const routerFor = (host: RouterHost): Router => (router ??= createRouter(host, capture, tracker, view, usage));
  const compactDeps = (host: RouterHost): CompactDeps => ({
    router: routerFor(host),
    tracker,
    selectedModel: () => host.session.model(),
    view,
    messages: () => host.session.messages({}),
  });
  const triggerDeps = (host: RouterHost): TriggerDeps => ({
    tracker,
    view,
    describe: (model) => routerFor(host).describe(model),
    complete: (model, request, signal) => routerFor(host).complete(model, request, signal),
    messages: () => host.session.messages({}),
    after: (ms, fn) => host.clock.after(ms, fn),
    log: (text) => host.ui.log(text),
    debug: (text) => host.ui.log(text, { to: "debug" }),
  });
  const toolCheckDeps = (host: RouterHost): ToolCheckDeps => ({
    tracker,
    mode: permissionMode,
    readMode: (): Promise<PermissionMode> => readMode(host),
    host,
    askPerson,
  });
  // The login services the hub shares, and the monitor the router shares.
  const usageDeps = (host: HostPort): UsageCommandDeps => {
    const services = servicesFor(host);
    return {
      catalog: services.catalog,
      credentials: services.credentials,
      http: host.http,
      platform: services.platform,
      monitor: usage,
      now: Date.now,
      log: (text) => host.ui.log(text),
    };
  };

  on("command.run", ($, e, next) => {
    if (e.command !== "login" && e.command !== "logout") return next(e);
    if (flows.isHandoff(e)) return next(e);
    const port = hostPort($);
    const flowHost: FlowHost = {
      ui: port.ui,
      command: {
        run: (input) => {
          switch (input.command) {
            case "login":
              return $.command.run({ command: "login", args: input.args ?? "" });
            case "logout":
              return $.command.run({ command: "logout", args: input.args ?? "" });
            default:
              throw unknownName("command", input.command);
          }
        },
      },
    };
    const services = servicesFor(port);
    return flows.start(flowHost, e, pane, (handoff) =>
      e.command === "login" ? handleLogin(port, e, handoff, services) : handleLogout(port, e, handoff, services),
    );
  }).catch((_, e, next) =>
    // A failed /logout must never fall through to Claude Code's own, which signs the person out of Claude.
    next.called || (e.command !== "login" && e.command !== "logout")
      ? next(e)
      : { text: `/${e.command} could not start. Nothing was changed.` },
  );

  // Keeps the system prompt and offered tools each render sends, for the routed turns.
  on("prompt.compose", async ($, e, next) => {
    const result = await next(e);
    capture.record(e, result);
    return result;
  });

  on("turn.step", async function* ($, e, next) {
    return yield* routeStep(routerFor(hostPort($)), e, next);
  }).catch(async function* ($, e, next) {
    return yield* routeStepFailed(routerFor(hostPort($)), e, next);
  });

  // A routed model summarizes a compaction; a Claude model's passes to core.
  on("session.compact", ($, e, next) => compactSession(compactDeps(hostPort($)), e, next)).catch(($, e) =>
    compactFailure(compactDeps(hostPort($)), e),
  );

  // After a main-loop turn, the mod's own threshold summarizes a routed session in place, for the provider.
  on("turn.complete", async ($, e, next) => {
    if (e.agentId === undefined) {
      const host = hostPort($);
      trigger ??= createAutoTrigger(triggerDeps(host));
      await trigger.onTurnComplete();
    }
    return next(e);
  });

  // A routed call in auto mode is decided by the routed permission policy, or put to the person, unless Claude Code's own check settled it.
  on("tool.check", ($, e, next) => checkRoutedTool(toolCheckDeps(hostPort($)), e, next)).catch((_, e) =>
    checkFailed({ tracker, mode: permissionMode }, e),
  );

  // Records the latest permission mode, which the routed check reads for auto mode.
  on("classic.UserPromptSubmit", (_, e, next) => {
    permissionMode.observe(e);
    return next(e);
  });
  on("classic.PermissionRequest", (_, e, next) => {
    permissionMode.observe(e);
    return next(e);
  });
  on("classic.PostToolUse", (_, e, next) => {
    permissionMode.observe(e);
    return next(e);
  });

  on("ui.render", { component: "Pane", requestId: PANE_ID }, ($, e, next) => {
    if (e.surface !== "terminal") return next(e);
    return pane.draw($.ui.resolve(e));
  });

  on("ui.close", { id: PANE_ID }, (_, e, next) => {
    pane.closedByHost();
    return next(e);
  });

  // The model picker rows are written from the cached catalog as the session starts,
  // so Claude Code's own /model knows each routed id before the first pick; a routed
  // `/model <id>` still waits until Claude Code has loaded that id's row.
  on("session.start", async ($, e, next) => {
    servicesFor(hostPort($));
    await modelPickerRows?.start();
    return next(e);
  });

  // `/model` with no arguments opens the hub; with one, it switches through core's own /model.
  on("command.run", { command: "model" }, ($, e, next) => {
    const host = hubHost($);
    const rowLoaded = (model: string): Promise<boolean> => modelPickerRows?.loaded(model) ?? Promise.resolve(true);
    return handleModelCommand(host, e, next, hubFor(host), rowLoaded);
  });

  // `/usage` shows Claude Code's own view, then transcript rows with one entry per provider the person is logged in to. A failed hook still runs that view.
  // In the catch `next` is replay-safe: after the hook called it (an interrupted panel rejects), `next(e)` passes that
  // settlement on without running `/usage` again; only a hook that failed before calling it runs the built-in view here.
  on("command.run", { command: "usage" }, ($, e, next) => handleUsage(usageDeps(hostPort($)), e, next)).catch((_, e, next) =>
    next(e),
  );

  on("ui.render", { component: "Pane", requestId: HUB_PANE_ID }, ($, e, next) => {
    if (e.surface !== "terminal" || hub === undefined) return next(e);
    return hub.draw($.ui.resolve(e));
  });

  // The ring's element is recorded for redraws; the hub's Esc refuses a close that only clears a search or cancels a login.
  on("ui.focus", { requestId: HUB_PANE_ID }, ($, e, next) => {
    hub?.focused(e.element);
    return next(e);
  });

  on("ui.close", { id: HUB_PANE_ID }, (_, e, next) => {
    if (hub?.refusesClose(e.origin) === true) return { deny: "Esc cleared the search or cancelled the login; the hub stays open." };
    return next(e);
  });
};

import type { EngineInterface, Register } from "claude-code";
import { createAutoTrigger, type AutoTrigger, type TriggerDeps } from "../src/compaction/auto-trigger.ts";
import { compactFailure, compactSession, type CompactDeps } from "../src/compaction/compact-hook.ts";
import { createCommandFlows, type FlowHost } from "../src/login/command-flow.ts";
import { handleLogin } from "../src/login/login-command.ts";
import { handleLogout } from "../src/login/logout-command.ts";
import { createPaneController, PANE_ID } from "../src/login/pane.ts";
import { createPermissionModeTracker } from "../src/permissions/permission-mode.ts";
import { createModeReader, type PermissionMode } from "../src/permissions/mode.ts";
import { checkFailed, checkRoutedTool, type ToolCheckDeps } from "../src/permissions/tool-check.ts";
import { createComposeCapture } from "../src/routing/compose-capture.ts";
import { createRouter, type Router, type RouterHost } from "../src/routing/router.ts";
import { createSessionTracker } from "../src/routing/session-tracker.ts";
import { routeStep, routeStepFailed } from "../src/routing/turn-step.ts";
import { createServices } from "../src/services.ts";

// Wires /login, /logout, the login pane, the routed turns, routed compaction and
// routed auto-mode permissions to src/. The host reads a name, key or path only
// where it is written literally at a call site, so the port spells out each
// environment name and store key the mod uses. One pane serves the engine: a
// command opens it, and the render and close hooks draw it and settle it. The
// command hook opens the pane, answers, and the flow runs after it (command-flow.ts).
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
          case "DBUS_SESSION_BUS_ADDRESS":
            return $.env.get("DBUS_SESSION_BUS_ADDRESS");
          case "HOME":
            return $.env.get("HOME");
          case "LOCALAPPDATA":
            return $.env.get("LOCALAPPDATA");
          case "OS":
            return $.env.get("OS");
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
    },
    session: {
      id: () => $.session.id(),
      messages: (args) => $.session.messages({ as: "api", agentId: args.agentId }),
      model: () => $.session.model(),
      cwd: () => $.session.cwd(),
      authorize: () => $.session.authorize(),
      compact: () => $.session.compact(),
    },
    model: { classify: (text, labels) => $.model.classify(text, labels) },
    config: { list: () => $.config.list() },
    clock: { after: (ms, fn) => $.clock.after(ms, fn) },
    prompt: { compose: (args) => $.prompt.compose(args) },
    tool: { list: () => $.tool.list() },
    pluginRoot: () => $.plugin.root,
  };
}

export const register: Register = (on, options) => {
  const pane = createPaneController();
  const flows = createCommandFlows();
  const capture = createComposeCapture();
  const tracker = createSessionTracker();
  const permissionMode = createPermissionModeTracker();
  const readMode = createModeReader(options);
  let router: Router | undefined;
  let trigger: AutoTrigger | undefined;

  // The router and the compaction and permission deps share one host, the first one
  // a hook built, as the router always has. They take a port, never `$`.
  const routerFor = (host: RouterHost): Router => (router ??= createRouter(host, capture, tracker));
  const compactDeps = (host: RouterHost): CompactDeps => ({
    router: routerFor(host),
    tracker,
    selectedModel: () => host.session.model(),
  });
  const triggerDeps = (host: RouterHost): TriggerDeps => ({
    tracker,
    contextWindow: async (model) => (await routerFor(host).describe(model)).contextWindow,
    after: (ms, fn) => host.clock.after(ms, fn),
    compact: () => host.session.compact(),
    debug: (text) => host.ui.log(text, { to: "debug" }),
  });
  const toolCheckDeps = (host: RouterHost): ToolCheckDeps => ({
    tracker,
    mode: permissionMode,
    readMode: (): Promise<PermissionMode> => readMode(host),
    host,
  });

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
    const services = createServices(port, { pane });
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

  // After a main-loop turn, the mod's own threshold starts compaction of a routed session.
  on("turn.complete", async ($, e, next) => {
    if (e.agentId === undefined) {
      const host = hostPort($);
      trigger ??= createAutoTrigger(triggerDeps(host));
      await trigger.onTurnComplete();
    }
    return next(e);
  });

  // A routed call in auto mode is decided by the routed permission policy, unless Claude Code's own check settled it.
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
};

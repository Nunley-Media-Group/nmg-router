import type { EngineInterface, Register } from "claude-code";
import { createCommandFlows, type FlowHost } from "../src/login/command-flow.ts";
import { handleLogin } from "../src/login/login-command.ts";
import { handleLogout } from "../src/login/logout-command.ts";
import { createPaneController, PANE_ID } from "../src/login/pane.ts";
import { createComposeCapture } from "../src/routing/compose-capture.ts";
import { createRouter, type Router, type RouterHost } from "../src/routing/router.ts";
import { routeStep, routeStepFailed } from "../src/routing/turn-step.ts";
import { createServices } from "../src/services.ts";

// Wires /login, /logout, the login pane and the routed turns to src/. The host
// reads a name, key or path only where it is written literally at a call site, so
// the port spells out each environment name and store key the mod uses. One pane
// serves the engine: a command opens it, and the render and close hooks draw it and
// settle it. The command hook opens the pane, answers, and the flow runs after it
// (command-flow.ts). The turn hooks answer routed models and pass Claude through.

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
    },
    prompt: { compose: (args) => $.prompt.compose(args) },
    tool: { list: () => $.tool.list() },
    pluginRoot: () => $.plugin.root,
  };
}

export const register: Register = (on) => {
  const pane = createPaneController();
  const flows = createCommandFlows();
  const capture = createComposeCapture();
  let router: Router | undefined;

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
    router ??= createRouter(hostPort($), capture);
    return yield* routeStep(router, e, next);
  }).catch(async function* ($, e, next) {
    router ??= createRouter(hostPort($), capture);
    return yield* routeStepFailed(router, e, next);
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

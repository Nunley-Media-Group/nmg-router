import type { RenderElement } from "claude-code";
import { encodeSecret, writeActiveAccount, writeLabel, type OAuthSecret } from "../../src/auth/accounts.ts";
import { createCredentialStore } from "../../src/credentials/store.ts";
import type { PaneController, PaneResult, PaneView } from "../../src/login/pane.ts";
import { createServices, type Services } from "../../src/services.ts";
import { fakeEngine, type FakeEngine, type FakeOptions } from "./fake-engine.ts";

// A pane whose answers are scripted. Each answer is a result, or a function of the
// view it answers, so a test can read the URL the flow showed.
export type ScriptedAnswer = PaneResult | ((view: PaneView) => PaneResult);

export type ScriptedPane = PaneController & { readonly views: PaneView[] };

export function scriptedPane(answers: readonly ScriptedAnswer[]): ScriptedPane {
  const queue = [...answers];
  const views: PaneView[] = [];
  return {
    views,
    begin: async () => ({ isPlaced: true }),
    end: async () => undefined,
    async open(_host, view) {
      views.push(view);
      const answer = queue.shift();
      if (answer === undefined) throw new Error(`no scripted answer for the "${view.kind}" view "${view.title}"`);
      return typeof answer === "function" ? answer(view) : answer;
    },
    draw: () => undefined as unknown as RenderElement,
    closedByHost() {
      // The scripted pane has no window to close.
    },
    isOpen: () => false,
  };
}

export type Harness = {
  readonly engine: FakeEngine;
  readonly services: Services;
  readonly pane: ScriptedPane;
};

// Services over a fake engine. The pane answers from `answers`; nothing is drawn.
export function harness(options: FakeOptions, answers: readonly ScriptedAnswer[] = []): Harness {
  const engine = fakeEngine(options);
  const pane = scriptedPane(answers);
  const services = createServices(engine, { pane });
  return { engine, services, pane };
}

export async function storeApiKey(engine: FakeEngine, provider: string, key: string): Promise<void> {
  await createCredentialStore(engine).save(provider, "default", encodeSecret({ type: "api-key", key }));
  await writeActiveAccount(engine, provider, "default");
}

export async function storeOAuth(
  engine: FakeEngine,
  provider: string,
  account: string,
  secret: OAuthSecret,
  label?: string,
): Promise<void> {
  await createCredentialStore(engine).save(provider, account, encodeSecret(secret));
  if (label !== undefined) await writeLabel(engine, provider, account, label);
}

// An OAuth secret whose access token is still valid for an hour from `now`.
export function freshOAuth(accountId: string, now = Date.now()): OAuthSecret {
  return {
    type: "oauth",
    access: "access-fixture",
    refresh: "refresh-fixture",
    expires: now + 60 * 60 * 1000,
    accountId,
  };
}

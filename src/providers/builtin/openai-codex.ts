import { oauthCodeLogin } from "../../auth/oauth-code-login.ts";
import type { DiscoveryOutcome, Effort, HttpDeps, ModelSource, OAuthCodeConfig, ProviderContext, ProviderPlugin, RawModel } from "../types.ts";
import { getJson, requestHeaders } from "../http.ts";
import { toDiscovery } from "../../models/openai-models-list.ts";
import { visionOf } from "../../models/modalities.ts";
import { epochOf, percentOf, recordOf, windowLabel, type UsageReport, type UsageWindow } from "../../usage/report.ts";
import { endpointUsage } from "../../usage/sources.ts";

// ChatGPT plan access through the Codex backend. Sign-in is OAuth by paste: the
// redirect URL is never listened on.

const BASE_URL = "https://chatgpt.com/backend-api";
const CLIENT_VERSION = "0.159.0";
const DEFAULT_CONTEXT = 272000;
const DEFAULT_MAX_OUTPUT = 128000;
const EFFORTS: readonly Effort[] = ["minimal", "low", "medium", "high", "xhigh", "max"];
const HIDDEN = new Set(["hide", "hidden"]);

export const CODEX_OAUTH: OAuthCodeConfig = {
  clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
  authorizeUrl: "https://auth.openai.com/oauth/authorize",
  tokenUrl: "https://auth.openai.com/oauth/token",
  redirectUri: "http://localhost:1455/auth/callback",
  scope: "openid profile email offline_access",
  extraParams: {
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",
    originator: "codex_cli_rs",
  },
  identity(claims) {
    const auth = claims["https://api.openai.com/auth"];
    const profile = claims["https://api.openai.com/profile"];
    const authRecord = typeof auth === "object" && auth !== null ? (auth as Record<string, unknown>) : {};
    const profileRecord = typeof profile === "object" && profile !== null ? (profile as Record<string, unknown>) : {};
    const accountId = typeof authRecord.chatgpt_account_id === "string" ? authRecord.chatgpt_account_id : undefined;
    const email = typeof profileRecord.email === "string" ? profileRecord.email.toLowerCase() : undefined;
    const plan = typeof authRecord.chatgpt_plan_type === "string" ? authRecord.chatgpt_plan_type : undefined;
    return { accountId, email, plan };
  },
};

function headersFor(accountId: string | undefined): Record<string, string> {
  return {
    ...(accountId === undefined ? {} : { "chatgpt-account-id": accountId }),
    "OpenAI-Beta": "responses=experimental",
    originator: "codex_cli_rs",
    version: CLIENT_VERSION,
  };
}

function effortsOf(value: unknown): Effort[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((level) => (typeof level === "object" && level !== null ? (level as { effort?: unknown }).effort : undefined))
    .filter((effort): effort is Effort => typeof effort === "string" && EFFORTS.includes(effort as Effort));
}

// Accepts `{ models | data: [...] }`. Hidden models are dropped, and the default
// limits apply where the list leaves them out.
export function parseCodexModels(body: unknown): RawModel[] | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const record = body as Record<string, unknown>;
  const entries = Array.isArray(record.models) ? record.models : Array.isArray(record.data) ? record.data : undefined;
  if (entries === undefined) return undefined;

  const models: RawModel[] = [];
  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) continue;
    const item = entry as Record<string, unknown>;
    const id = typeof item.slug === "string" ? item.slug : typeof item.id === "string" ? item.id : undefined;
    if (id === undefined || id.trim() === "") continue;
    if (typeof item.visibility === "string" && HIDDEN.has(item.visibility)) continue;
    models.push({
      id,
      name: typeof item.display_name === "string" ? item.display_name : undefined,
      contextWindow: typeof item.context_window === "number" ? item.context_window : DEFAULT_CONTEXT,
      maxOutput: DEFAULT_MAX_OUTPUT,
      reasoningEfforts: effortsOf(item.supported_reasoning_levels),
      vision: visionOf(item),
    });
  }
  return models;
}

const USAGE_URL = `${BASE_URL}/wham/usage`;

// The usage endpoint's `rate_limit` windows, primary then secondary. A window needs
// its used percent and its length in seconds; one without them is left out.
export function parseCodexUsage(body: unknown): UsageReport | undefined {
  const rateLimit = recordOf(recordOf(body).rate_limit);
  const windows: UsageWindow[] = [];
  for (const [id, key] of [
    ["primary", "primary_window"],
    ["secondary", "secondary_window"],
  ] as const) {
    const window = recordOf(rateLimit[key]);
    const usedPercent = percentOf(window.used_percent);
    const seconds = window.limit_window_seconds;
    if (usedPercent === undefined || typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) continue;
    const resetsAt = epochOf(window.reset_at);
    const label = windowLabel(Math.max(1, Math.round(seconds / 60)));
    windows.push({ id, label, usedPercent, ...(resetsAt === undefined ? {} : { resetsAt }) });
  }
  return windows.length === 0 ? undefined : { windows };
}

// The windows a routed response's `x-codex-*` headers report, primary then secondary.
// A window needs its used percent and its length in minutes. None present answers undefined.
export function parseCodexUsageHeaders(headers: Readonly<Record<string, string>>): UsageReport | undefined {
  const windows: UsageWindow[] = [];
  for (const id of ["primary", "secondary"]) {
    const prefix = `x-codex-${id}-`;
    const usedPercent = percentOf(numberOfText(headers[`${prefix}used-percent`]));
    const minutes = numberOfText(headers[`${prefix}window-minutes`]);
    if (usedPercent === undefined || minutes === undefined || !Number.isInteger(minutes) || minutes <= 0) continue;
    const resetsAt = epochOf(numberOfText(headers[`${prefix}reset-at`]));
    windows.push({ id, label: windowLabel(minutes), usedPercent, ...(resetsAt === undefined ? {} : { resetsAt }) });
  }
  return windows.length === 0 ? undefined : { windows };
}

function numberOfText(text: string | undefined): number | undefined {
  if (text === undefined || text.trim() === "") return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

const models: ModelSource = {
  async list(deps: HttpDeps, context: ProviderContext): Promise<DiscoveryOutcome> {
    const outcome = await getJson(
      deps,
      `${BASE_URL}/codex/models?client_version=${CLIENT_VERSION}`,
      requestHeaders(headersFor(context.auth?.accountId), context.auth?.token),
    );
    return toDiscovery(outcome, parseCodexModels);
  },
};

export const openaiCodex: ProviderPlugin = {
  identity: {
    id: "openai-codex",
    name: "OpenAI Codex",
    baseUrl: BASE_URL,
    headers: ({ accountId }) => headersFor(accountId),
  },
  login: oauthCodeLogin(CODEX_OAUTH),
  models,
  wire: () => ({ wire: "openai-codex-responses", baseUrl: BASE_URL }),
  usage: {
    ...endpointUsage({ url: USAGE_URL, headers: ({ auth }) => headersFor(auth?.accountId), parse: parseCodexUsage }),
    fromHeaders: parseCodexUsageHeaders,
  },
};

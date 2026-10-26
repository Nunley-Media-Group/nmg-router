// Unsigned test JWTs, built at run time, so no token-shaped literal sits in source
// or fixtures. The mod reads only the payload; the signature segment is a marker.
export function makeJwt(claims: Record<string, unknown>, marker = "unsigned"): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return [encode({ alg: "none", typ: "JWT" }), encode(claims), marker].join(".");
}

// The claims an OpenAI Codex access token carries, for a given account and email.
export function codexClaims(accountId: string, email: string, plan = "plus"): Record<string, unknown> {
  return {
    "https://api.openai.com/auth": { chatgpt_account_id: accountId, chatgpt_plan_type: plan },
    "https://api.openai.com/profile": { email },
  };
}

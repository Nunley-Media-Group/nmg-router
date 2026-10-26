// PKCE S256 for the paste-based OAuth flow. Uses Web Crypto only, because a
// hooks module runs without Node.

export type Pkce = { readonly verifier: string; readonly challenge: string };

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function randomState(): string {
  return base64UrlEncode(randomBytes(32));
}

// A 96-byte random verifier, base64url-encoded, and its S256 challenge.
export async function createPkce(): Promise<Pkce> {
  const verifier = base64UrlEncode(randomBytes(96));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64UrlEncode(new Uint8Array(digest)) };
}

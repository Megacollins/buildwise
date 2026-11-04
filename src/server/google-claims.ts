/** Checks on a Google ID token's claims. Pure, so it can be tested without Google. */

export class GoogleSignInError extends Error {
  constructor(public code: "not_configured" | "cancelled" | "expired" | "failed" | "unverified" | "conflict") { super(code); }
}

const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

export function checkGoogleClaims(payload: unknown, expect: { clientId: string; nonce: string; now: number }) {
  const p = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const aud = Array.isArray(p.aud) ? p.aud : [p.aud];
  const exp = typeof p.exp === "number" ? p.exp * 1000 : 0;
  if (!ISSUERS.has(String(p.iss)) || !aud.includes(expect.clientId) || exp <= expect.now || p.nonce !== expect.nonce) {
    throw new GoogleSignInError("failed");
  }
  if (typeof p.sub !== "string" || !p.sub) throw new GoogleSignInError("failed");
  const email = typeof p.email === "string" ? p.email.trim().toLowerCase() : "";
  if (!email || (p.email_verified !== true && p.email_verified !== "true")) throw new GoogleSignInError("unverified");
  const name = (typeof p.name === "string" && p.name.trim()) || email.split("@")[0];
  return { sub: p.sub, email, name: name.slice(0, 80) };
}

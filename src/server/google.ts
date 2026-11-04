import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";
import { createSession } from "./auth";
import { createProject } from "./projects";
import { SAMPLE_PROJECTS } from "@/data/sample-projects";
import { checkGoogleClaims, GoogleSignInError } from "./google-claims";

/**
 * Sign in with Google (OpenID Connect, authorization code flow with PKCE, state and nonce).
 *
 * Google is the only way to sign in. Buildwise keeps its own sessions (bw_session):
 * Google proves who the person is; Buildwise decides what they can do.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FLOW_COOKIE = "bw_oauth";
const FLOW_PATH = "/api/auth/google";

export { GoogleSignInError };

export function googleConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** Where Google sends people back: the public URL in production, this server's origin in development. */
function redirectUri(origin: string) {
  const base = process.env.APP_URL ? process.env.APP_URL.replace(/\/$/, "") : origin;
  return `${base}${FLOW_PATH}/callback`;
}

const b64url = (buf: Buffer) => buf.toString("base64url");
const safeNext = (next: string | null) => (next && next.startsWith("/app") && !next.startsWith("//") ? next : "/app");

/** Step 1: remember state, PKCE verifier and nonce in a short-lived cookie, and send the browser to Google. */
export async function startGoogleSignIn(origin: string, next: string | null) {
  if (!googleConfigured()) throw new GoogleSignInError("not_configured");
  const state = b64url(randomBytes(24));
  const verifier = b64url(randomBytes(32));
  const nonce = b64url(randomBytes(24));
  (await cookies()).set(FLOW_COOKIE, JSON.stringify({ state, verifier, nonce, next: safeNext(next) }), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: FLOW_PATH, maxAge: 600,
  });
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: b64url(createHash("sha256").update(verifier).digest()),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return url.toString();
}

/** Step 2: verify the response, exchange the code, and sign the person in. Returns where to go next. */
export async function finishGoogleSignIn(origin: string, params: URLSearchParams) {
  const jar = await cookies();
  const raw = jar.get(FLOW_COOKIE)?.value;
  jar.delete({ name: FLOW_COOKIE, path: FLOW_PATH });
  if (!googleConfigured()) throw new GoogleSignInError("not_configured");
  if (params.get("error")) throw new GoogleSignInError("cancelled");
  let flow: { state: string; verifier: string; nonce: string; next: string };
  try { flow = JSON.parse(raw ?? ""); } catch { throw new GoogleSignInError("expired"); }
  if (!flow?.state || params.get("state") !== flow.state) throw new GoogleSignInError("expired");
  const code = params.get("code");
  if (!code) throw new GoogleSignInError("failed");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, grant_type: "authorization_code", redirect_uri: redirectUri(origin), code_verifier: flow.verifier,
      client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new GoogleSignInError("failed");
  const { id_token } = (await res.json()) as { id_token?: string };
  // The ID token came straight from Google's token endpoint over TLS, so its claims are checked
  // rather than its signature (OpenID Connect Core §3.1.3.7).
  const payload = JSON.parse(Buffer.from(String(id_token).split(".")[1] ?? "", "base64url").toString("utf8") || "null");
  const who = checkGoogleClaims(payload, { clientId: process.env.GOOGLE_CLIENT_ID!, nonce: flow.nonce, now: Date.now() });

  const userId = await upsertGoogleUser(who);
  await db.session.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } });
  await createSession(userId);
  return flow.next;
}

async function upsertGoogleUser(who: { sub: string; email: string; name: string }) {
  const byGoogle = await db.user.findUnique({ where: { googleId: who.sub }, select: { id: true } });
  if (byGoogle) return byGoogle.id;
  // An account with this (Google-verified) email from before Google sign-in: link it.
  const byEmail = await db.user.findUnique({ where: { email: who.email }, select: { id: true, googleId: true, emailVerifiedAt: true } });
  if (byEmail) {
    if (byEmail.googleId && byEmail.googleId !== who.sub) throw new GoogleSignInError("conflict");
    await db.user.update({ where: { id: byEmail.id }, data: { googleId: who.sub, emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date() } });
    return byEmail.id;
  }
  const user = await db.user.create({ data: { email: who.email, name: who.name, googleId: who.sub, emailVerifiedAt: new Date() } });
  // Every new account starts with its own copy of the sample project so nothing is empty.
  const sample = SAMPLE_PROJECTS[0];
  await createProject({
    userId: user.id, name: sample.name, regionId: sample.regionId, addressLine: sample.addressLine,
    plot: sample.plot, requirements: sample.requirements, budget: sample.budget,
    conceptKey: sample.conceptKey, description: sample.description, isSample: true,
  });
  return user.id;
}

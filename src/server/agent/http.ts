import "server-only";
import { authenticateAgent, AgentAuthError, type AgentContext } from "./keys";
import { AgentError } from "./service";
import { consumeRateLimit } from "../rate-limit";
import { appUrl } from "../email";

const MAX_BODY = 32 * 1024;
const NO_STORE = { "Cache-Control": "no-store" };

const fail = (status: number, code: string, message: string, extra: HeadersInit = {}) =>
  Response.json({ error: { code, message } }, { status, headers: { ...NO_STORE, ...extra } });

/**
 * Wraps an agent API handler: key auth, per-key rate limit, bounded JSON body,
 * and mapping of domain errors to stable JSON errors. Unexpected errors reveal no details.
 */
export function agentRoute<P>(
  handler: (args: { ctx: AgentContext; base: string; body: unknown; params: P }) => Promise<unknown>,
) {
  return async (req: Request, route: { params: Promise<P> }) => {
    let ctx: AgentContext;
    try {
      ctx = await authenticateAgent(req.headers.get("authorization"));
    } catch (e) {
      if (e instanceof AgentAuthError) return fail(401, "unauthorized", e.message);
      throw e;
    }
    const rl = await consumeRateLimit(`agent:${ctx.keyId}`, 120, 60);
    if (!rl.ok) return fail(429, "rate_limited", `Too many requests. Retry in ${rl.retryAfter}s.`, { "Retry-After": String(rl.retryAfter) });

    let body: unknown = undefined;
    if (req.method === "POST") {
      const text = await req.text();
      if (text.length > MAX_BODY) return fail(413, "body_too_large", "Request body is too large.");
      if (text) {
        try { body = JSON.parse(text); } catch { return fail(400, "invalid_json", "Body must be JSON."); }
      }
    }
    try {
      // Links back into Buildwise: the configured public URL, or (in development) wherever this server answered.
      const base = process.env.APP_URL ? appUrl("").replace(/\/$/, "") : new URL(req.url).origin;
      const data = await handler({ ctx, base, body, params: await route.params });
      return Response.json(data, { headers: NO_STORE });
    } catch (e) {
      if (e instanceof AgentError) return fail(e.status, e.code, e.message);
      console.error("[agent-api]", e);
      return fail(500, "internal_error", "Something went wrong on the Buildwise side.");
    }
  };
}

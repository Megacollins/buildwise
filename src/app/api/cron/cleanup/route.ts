import { timingSafeEqual } from "node:crypto";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

/**
 * Daily housekeeping: removes expired sessions, used/expired auth tokens and stale
 * rate-limit counters. Protected by CRON_SECRET (sent as "Authorization: Bearer <secret>",
 * which is what Vercel Cron does automatically; any external scheduler can do the same).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const ok = !!secret && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) return new Response("Unauthorized", { status: 401 });

  const now = new Date();
  const [sessions, tokens, limits] = await db.$transaction([
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.authToken.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] } }),
    db.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 24 * 3600 * 1000) } } }),
  ]);
  return Response.json({ sessions: sessions.count, tokens: tokens.count, rateLimits: limits.count });
}

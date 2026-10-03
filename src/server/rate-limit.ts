import "server-only";
import { headers } from "next/headers";
import { db } from "./db";

/**
 * Fixed-window rate limiting backed by Postgres, so limits hold across
 * multiple server instances. One atomic upsert per call.
 */
export async function consumeRateLimit(key: string, limit: number, windowSeconds: number) {
  const rows = await db.$queryRaw<{ count: number; windowStart: Date }[]>`
    INSERT INTO "RateLimit" ("key", "count", "windowStart") VALUES (${key}, 1, now())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."windowStart" < now() - make_interval(secs => ${windowSeconds}) THEN 1 ELSE "RateLimit"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimit"."windowStart" < now() - make_interval(secs => ${windowSeconds}) THEN now() ELSE "RateLimit"."windowStart" END
    RETURNING "count", "windowStart"`;
  const { count, windowStart } = rows[0];
  const retryAfter = Math.max(0, Math.ceil((windowStart.getTime() + windowSeconds * 1000 - Date.now()) / 1000));
  return { ok: count <= limit, retryAfter };
}

export async function resetRateLimit(key: string) {
  await db.rateLimit.deleteMany({ where: { key } });
}

/**
 * Client IP for rate limiting. Behind a reverse proxy / CDN, make sure it
 * overwrites X-Forwarded-For (Vercel, Cloudflare and most load balancers do);
 * otherwise clients could spoof it.
 */
export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}

export function retryMessage(seconds: number) {
  const minutes = Math.ceil(seconds / 60);
  return `Too many attempts. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

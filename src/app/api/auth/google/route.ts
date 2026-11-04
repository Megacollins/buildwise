import { NextResponse, type NextRequest } from "next/server";
import { googleConfigured, startGoogleSignIn } from "@/server/google";
import { clientIp, consumeRateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

/** Starts "Continue with Google". */
export async function GET(req: NextRequest) {
  const login = (error: string) => NextResponse.redirect(new URL(`/login?error=${error}`, req.url));
  if (!googleConfigured()) return login("not_configured");
  const limit = await consumeRateLimit(`google:start:${await clientIp()}`, 30, 900);
  if (!limit.ok) return login("rate_limited");
  return NextResponse.redirect(await startGoogleSignIn(req.nextUrl.origin, req.nextUrl.searchParams.get("next")));
}

import { NextResponse, type NextRequest } from "next/server";
import { finishGoogleSignIn, GoogleSignInError } from "@/server/google";

export const dynamic = "force-dynamic";

/** Google sends the browser back here after the person chooses an account. */
export async function GET(req: NextRequest) {
  try {
    const next = await finishGoogleSignIn(req.nextUrl.origin, req.nextUrl.searchParams);
    return NextResponse.redirect(new URL(next, req.url));
  } catch (e) {
    const code = e instanceof GoogleSignInError ? e.code : "failed";
    if (!(e instanceof GoogleSignInError)) console.error("[google-sign-in]", e);
    return NextResponse.redirect(new URL(`/login?error=${code}`, req.url));
  }
}

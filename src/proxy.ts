import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic check only: redirect signed-out visitors away from the app.
 * Real authorisation happens on the server for every read and write (src/server).
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has("bw_session")) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/app/:path*"] };

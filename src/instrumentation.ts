import type { Instrumentation } from "next";

/** Runs once when the server starts. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("./server/env");
    validateEnv();
  }
}

/**
 * Structured error log for every server-side request error. Hosting platforms
 * (Vercel, Railway, Fly, Docker log drivers) index JSON lines, so these are
 * searchable. An error-tracking service (e.g. Sentry) can be added here later.
 * Only safe metadata is logged — no request bodies, cookies or headers.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const err = error as Error & { digest?: string };
  console.error(JSON.stringify({
    level: "error",
    time: new Date().toISOString(),
    message: err.message,
    digest: err.digest,
    stack: err.stack?.split("\n").slice(0, 8).join("\n"),
    method: request.method,
    path: request.path.split("?")[0],
    routePath: context.routePath,
    routeType: context.routeType,
  }));
};

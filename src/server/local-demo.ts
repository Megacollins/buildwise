import "server-only";

/**
 * A one-click sign-in to the seeded demo account, ONLY for local development:
 * never in a production build, and only against a database on this machine.
 * It lets people run Buildwise locally without setting up Google sign-in.
 */
export const LOCAL_DEMO_EMAIL = "demo@buildwise.test";

export function localDemoSignInAvailable() {
  if (process.env.NODE_ENV === "production") return false;
  try {
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(process.env.DATABASE_URL ?? "").hostname);
  } catch {
    return false;
  }
}

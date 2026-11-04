import { z } from "zod";

/**
 * Environment validation. Called once at server start (src/instrumentation.ts)
 * so a misconfigured deployment fails immediately with a clear message instead
 * of breaking later (e.g. nobody able to sign in).
 */
const Base = z.object({
  DATABASE_URL: z.string().url("DATABASE_URL must be a postgres:// URL"),
  APP_URL: z.string().url().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
});

const required = (message: string) => z.string({ error: message }).min(1, message);
const Production = Base.extend({
  APP_URL: z.string({ error: "APP_URL is required in production (Google sign-in returns there; agent links use it)" })
    .url("APP_URL must be a full URL").refine((u) => u.startsWith("https://"), "APP_URL must use https"),
  CRON_SECRET: required("CRON_SECRET is required in production").refine((v) => v.length >= 32, "CRON_SECRET must be at least 32 characters"),
  // Google is the only way to sign in.
  GOOGLE_CLIENT_ID: required("GOOGLE_CLIENT_ID is required in production (Google sign-in)"),
  GOOGLE_CLIENT_SECRET: required("GOOGLE_CLIENT_SECRET is required in production (Google sign-in)"),
});

export function validateEnv() {
  const production = process.env.NODE_ENV === "production" && process.env.BUILDWISE_SKIP_ENV_CHECK !== "true";
  const result = (production ? Production : Base).safeParse(process.env);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${problems}\nSee .env.example and docs/DEPLOYMENT.md.`);
  }
  return result.data;
}

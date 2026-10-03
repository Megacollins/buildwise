import { z } from "zod";

/**
 * Environment validation. Called once at server start (src/instrumentation.ts)
 * so a misconfigured deployment fails immediately with a clear message instead
 * of breaking later (e.g. password-reset emails with no link).
 */
const Base = z.object({
  DATABASE_URL: z.string().url("DATABASE_URL must be a postgres:// URL"),
  APP_URL: z.string().url().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  CRON_SECRET: z.string().optional(),
});

const required = (message: string) => z.string({ error: message }).min(1, message);
const Production = Base.extend({
  APP_URL: z.string({ error: "APP_URL is required in production (used for links in emails)" })
    .url("APP_URL must be a full URL").refine((u) => u.startsWith("https://"), "APP_URL must use https"),
  RESEND_API_KEY: required("RESEND_API_KEY is required in production (verification and reset emails)"),
  EMAIL_FROM: required("EMAIL_FROM is required in production, e.g. Buildwise <no-reply@yourdomain.com>"),
  CRON_SECRET: required("CRON_SECRET is required in production").refine((v) => v.length >= 32, "CRON_SECRET must be at least 32 characters"),
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

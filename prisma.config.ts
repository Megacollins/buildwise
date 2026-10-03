import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations need a direct (non-pooled) connection on hosted Postgres such as Neon;
    // the app itself connects with DATABASE_URL (pooled) through the pg adapter.
    // DATABASE_URL_UNPOOLED is what the Vercel–Neon integration provides.
    url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED ?? env("DATABASE_URL"),
    // Only needed for `prisma migrate dev`; production uses `prisma migrate deploy`.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});

# Deploying Buildwise

Recommended stack: **Vercel** (app) + **Neon** (managed PostgreSQL) + **Resend** (email).
All three have free tiers suitable for a private beta. Other Node hosts work too — the app is a
standard Next.js server; see "Other hosts" below.

## 1. Code on GitHub

Push this repository to a **private** GitHub repository. `.env` is git-ignored and must never be committed.

## 2. Database — Neon

1. Create a Neon project. Pick the region closest to most of your users (for Nigeria, a European
   region such as Frankfurt is usually the lowest-latency option Neon offers).
2. Copy two connection strings from the Neon dashboard:
   - **Pooled** connection → `DATABASE_URL` (used by the running app)
   - **Direct** connection → `DIRECT_DATABASE_URL` (used only for migrations)
3. Backups: Neon keeps point-in-time restore history; the window depends on your plan. Check it
   meets your needs before real users arrive, and test a restore once.

## 3. Email — Resend

1. Add and verify your domain in Resend (it gives you DNS records: SPF, DKIM).
2. Create an API key → `RESEND_API_KEY`.
3. Choose a sender on that domain → `EMAIL_FROM`, e.g. `Buildwise <no-reply@yourdomain.com>`.

Without a verified domain, confirmation and reset emails will land in spam or be rejected.

## 4. App — Vercel

1. Import the GitHub repository in Vercel. Framework: Next.js (auto-detected).
   `vercel.json` already sets the build command to run `prisma migrate deploy` before `next build`,
   and schedules the daily cleanup job.
2. Set the Function Region to match your Neon region.
3. Environment variables (Production):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Neon pooled connection string |
   | `DIRECT_DATABASE_URL` | Neon direct connection string |
   | `APP_URL` | `https://yourdomain.com` (must be https) |
   | `RESEND_API_KEY` | from Resend |
   | `EMAIL_FROM` | `Buildwise <no-reply@yourdomain.com>` |
   | `CRON_SECRET` | 64 random hex characters (`openssl rand -hex 32`) |

   The server **refuses to start** if any of these are missing or invalid, and logs exactly which.
4. Deploy. Then load the reference data (regions and material catalog) once, from your machine:

   ```bash
   DATABASE_URL="<pooled url>" DIRECT_DATABASE_URL="<direct url>" npx prisma db seed
   ```

   On a non-local database the seed **does not** create the demo account (its password is public).
   Re-run the seed whenever `src/data` changes; it is idempotent.
5. Add your custom domain in Vercel and point DNS at it. HTTPS is automatic.

## 5. After deploying

- **Health check:** `https://yourdomain.com/api/health` → `{"status":"ok","db":"ok"}`. Point an uptime
  monitor (e.g. Better Stack or UptimeRobot) at it.
- **Logs:** server errors are written as one-line JSON (`"level":"error"`) with a `digest` that matches
  the reference number shown to users on error pages. Search for it in Vercel → Logs.
- **Smoke test:** sign up with a real inbox, confirm the email, reset the password, create a project.

## Pre-launch checklist (not code)

- [ ] Real, verified cost data for the launch region (sample data must not be presented to paying users).
- [ ] Terms of Service and Privacy Policy reviewed by a lawyer in the launch country.
- [ ] An architect has reviewed a range of generated concepts for the launch market.
- [ ] Backups confirmed and a restore tested.
- [ ] Support email address monitored.

## Other hosts (Railway, Render, Fly.io, a VPS)

Any host that runs Node 20+:

```bash
npm ci                     # runs prisma generate
npx prisma migrate deploy  # with DIRECT_DATABASE_URL / DATABASE_URL set
npm run build
npm start                  # listens on $PORT (default 3000)
```

Set the same environment variables. Schedule a daily request to `/api/cron/cleanup` with header
`Authorization: Bearer $CRON_SECRET`. If the host sits behind a proxy, make sure it sets
`X-Forwarded-For` (used for rate limiting).

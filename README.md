# Buildwise

**From an idea to a real home.** Design. Plan. Visualize. Customize. Estimate. Build.

Buildwise is a global home-design and pre-construction platform. It does not generate pictures of
houses: every design is a **structured building model**, and the plans, 3D view, quantities and cost
estimate are all derived from that one model.

> Status: MVP foundation (Phase 1). All regional prices are **sample data** and every concept is a
> **concept design** — not construction documentation. The UI says so wherever it matters.

## Quick start

Requirements: Node 20+ (tested on Node 26), npm.

```bash
npm install                # also runs `prisma generate`
npm run db:start           # local Postgres via `prisma dev` (port 51214, matches .env)
npm run db:migrate         # apply migrations
npm run db:seed            # sample regions, material catalog, demo account + projects
npm run dev                # http://localhost:3000
```

Using your own PostgreSQL instead: set `DATABASE_URL` in `.env` (see `.env.example`) and skip `db:start`.

**Demo account (local only):** credentials are in [`prisma/seed.ts`](prisma/seed.ts) (`DEMO_EMAIL` /
`DEMO_PASSWORD`). New sign-ups also receive their own copy of the sample project.

**Deploying:** see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) (Vercel + Neon + Resend, or any Node host).

Other scripts: `npm test` (domain test suite), `npm run typecheck`, `npm run lint`, `npm run build`, `npm run check:domain`
(generates concepts for every region and prints layouts and cost ranges — a quick domain sanity check).

## The core loop

Open project → inspect floor plan → inspect dimensions → view 3D → change material → see updated estimate.

1. **Plans** tab: site plan, floor plans, elevations, section, schedules — all computed from geometry.
2. **3D** tab: orbit, cutaway floor plan, exterior, interior walk (WASD), Blueprint → Structure →
   Finished → Furnished, time of day, 360°.
3. **Materials** tab: choose a finish; each option shows its measured cost delta, the estimate is
   recomputed on the server and a version is saved; the 3D preview updates.
4. **Design** tab: click a wall to move it or a room to resize it; the assistant turns requests like
   "make the kitchen bigger" into priced, structured proposals.
5. **Cost** tab: itemised estimate (quantity × rate range, with basis) and budget optimisation
   options measured by re-running the engine on a modified copy of the model.

## Architecture (short version)

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full write-up.

```
src/
  domain/            Pure TypeScript, no UI/DB imports — the product's core
    units/           mm-only storage; presentation-layer conversion (metric/imperial)
    model/           Building model types, derivation (rebuild), geometry, quantities, fixtures, operations
    generator/       Requirements schema + rule-based concept generator (budget-aware)
    cost/            Deterministic cost engine + budget optimisation
    regions/         Region data contract (climate, practice, planning, rates, references)
    materials/       Material catalog contract, regional projection
    assistant/       Plain-language → requirements parser
  data/              SAMPLE regional datasets, material catalog, sample projects (seeded into the DB)
  server/            DB client, auth/sessions, authorisation-checked data access, assistant service
  i18n/              Locale config, typed dictionaries (en complete, 11 drafts), formatting, RTL
  components/        UI kit, drawings (SVG), three (R3F), project workspace, wizard
  app/               Next.js App Router pages + server actions
prisma/              Schema, migrations, seed
```

Key rules the code follows:

- **One model, many views.** Drawings, 3D, quantities and cost read the same `BuildingModel`.
- **Edits are operations.** Every change is a validated `ModelOp`, re-applied on the server; the client
  never sends a finished model or a price.
- **Cost is separate from AI.** The engine is deterministic and auditable; the assistant only proposes ops.
- **Regional data is data.** Swap sample datasets for verified ones without touching the model or engine.
- **Honesty over polish.** Sample data, unverified regulations, missing features and professional
  review requirements are labelled, never faked.

## Accounts & security

- Email verification (required before requesting professional review), password reset (30-minute,
  single-use links; the newest link revokes older ones), change password (signs out other devices).
- Tokens and sessions are stored only as SHA-256 hashes; passwords use bcrypt.
- Rate limits stored in Postgres (work across instances): sign-in 8 per account / 30 per IP per 15 min,
  sign-up 10 per IP per hour, reset requests 3 per account / 10 per IP per hour.
- Reset requests answer identically whether or not an account exists; sign-in timing is equalised.
- Security headers: CSP, frame denial, nosniff, referrer and permissions policies, HSTS in production.
- Email: set `RESEND_API_KEY`, `EMAIL_FROM` and `APP_URL` in production. In development, emails
  (with their links) are printed to the terminal running `npm run dev`.

## Known limitations (MVP)

- Rectangular plots and a front-row / hall / rear-row layout strategy only.
- Balconies and designed outdoor spaces are recorded in the brief but not modelled geometrically.
- 3D interior walk has no collision; materials are colours, not textures.
- Non-English translations are machine-drafted and partial (fallback to English per key).
- The assistant is rule-based and English-only; an LLM provider can plug into `src/server/assistant.ts`.
- No PDF generation yet (sheets are printable to A3 from the browser); no model export.
- Professionals directory is intentionally empty until a verification process exists.

# Senior Music Connection — Booking & Matching Platform

Matches professional musicians with senior living communities using an explainable, rules-based engine and a human-approved, secure confirmation flow. **The system recommends; an SMC administrator approves. It never auto-books.**

## Stack

Next.js 16 (App Router) + TypeScript · PostgreSQL + Prisma 7 · Auth.js (credentials) · Zod + React Hook Form · Resend + React Email · Inngest · Tailwind v4 · Vitest.

## Quick start (local)

```bash
# 1. Postgres (Docker) — or point DATABASE_URL at Neon/Supabase
docker run -d --name smc-postgres -e POSTGRES_USER=smc -e POSTGRES_PASSWORD=smc -e POSTGRES_DB=smc -p 5433:5432 postgres:16-alpine

# 2. Env
cp .env.example .env          # defaults work for local dev; leave API keys blank to run offline

# 3. Install, migrate, seed (42 musicians, 14 facilities, ~30 requests across every pipeline state)
npm install
npm run db:migrate
npm run db:seed

# 4. Run
npm run dev                   # http://localhost:3000
```

With `DEMO_MODE=true`, open **http://localhost:3000/demo** for one-click sign-in as each role and simulated musician / community inboxes with live secure links.

| Role | Email | Password |
| --- | --- | --- |
| Administrator | admin@smc.test | demo-admin |
| Scheduler | scheduler@smc.test | demo-scheduler |
| Staff | staff@smc.test | demo-staff |

Musicians and community contacts have no login (by design); their experience is the emails and secure links shown on the demo hub.

Public forms: `/request` (facility event request), `/apply` (musician application). Feedback forms and offer responses are reached only through emailed links; without `RESEND_API_KEY` the emails (with their links) appear in **Admin → Email log**.

## Commands

| Command | What |
| --- | --- |
| `npm test` | Unit tests for the matching engine (pure module, no DB). |
| `npm run typecheck` | TypeScript. |
| `npm run backtest` | Replay the engine over historical bookings and report where the booked musician ranked. |
| `npm run jobs:run` | Run due reminders / completion / feedback sends / nudges once (idempotent). |
| `npm run uat:confirmation` | UAT for the secure confirmation flow against the running dev server: partial acceptance, concurrent double-redemption, confirmation, revoked links, conflicting responses. |
| `npm run dev:links` | Local dev only: print the live secure links captured in the email log (no email provider configured). |
| `npm run inngest:dev` | Inngest dev server for scheduled jobs (optional locally; the app falls back to inline execution). |
| `npm run db:studio` | Prisma Studio. |

## Layout

```
lib/matching/        Pure matching engine: types, mandatory filters, weighted scoring, reason codes. No I/O.
lib/services/        Domain services (intake, readiness, matching persistence, bookings/responses, feedback, jobs, metrics).
lib/tokens.ts        DB-stored single-use tokens for secure links (hashed, expiring, revocable, atomic redemption).
lib/notifications/   Channel-agnostic dispatcher (email adapter now; SMS can be added as a second adapter).
lib/emails/          React Email templates with SMC branding.
lib/geo/             Google Geocoding + Distance Matrix, with a straight-line fallback when no key is set.
lib/inngest/         Background functions: match-on-ready, scheduled jobs (cron */10).
app/(public)/        Musician application, event request, two feedback forms.
app/respond/[token]  Accept / Decline / Request changes page.
app/admin/           Dashboard, pipeline, request detail with reasoned candidates, musicians, facilities, events, feedback, exceptions, reports, email log, audit log, settings.
prisma/              Schema, migrations (incl. append-only audit trigger), realistic seed.
tests/               Engine unit tests.  scripts/  backtest + jobs runner.  docs/ADMIN.md  administrator guide.
```

## National operation

The platform is region-agnostic. Every timestamp is stored in UTC; each facility, musician and event carries its own IANA time zone, chosen on the public forms (defaulted from the state) and used for all display, availability checks and emails. Matching is distance-based, so rosters in different metros never interact. Set `NEXT_PUBLIC_DEFAULT_TIMEZONE` for staff-facing timestamps that have no facility context, and `GOOGLE_MAPS_API_KEY` so travel times reflect real roads in every region.

## Environment variables

See `.env.example`. `DATABASE_URL`, `AUTH_SECRET`, `APP_BASE_URL` are required. `RESEND_API_KEY`/`EMAIL_FROM` enable real email; `GOOGLE_MAPS_API_KEY` enables real geocoding and drive times; `INNGEST_*` for hosted Inngest; `JOBS_SECRET` protects the external cron endpoint `POST /api/jobs/run`.

## Deploying a public demo (Railway)

`railway.json` is checked in, so the only setup is in the Railway dashboard:

1. **New Project → Deploy from GitHub repo** → pick `magglesnyc/SMC` (branch `main`).
2. In the same project, **+ New → Database → PostgreSQL**.
3. Open the web service → **Variables** and add:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference to the database service) |
   | `AUTH_SECRET` | output of `openssl rand -base64 32` |
   | `APP_BASE_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` |
   | `DEMO_MODE` | `true` |

4. Web service → **Settings → Networking → Generate Domain**. Railway redeploys; the pre-deploy step runs the migrations and, because `DEMO_MODE=true` and the database is empty, the first boot runs the demo seed. Open `https://<domain>/demo`.

Emails stay in **Admin → Email log** unless `RESEND_API_KEY` is set. Scheduled jobs run inline on demand without Inngest. To reset the demo data, delete the rows (or the Postgres service) and redeploy.

## Deploying (Vercel + Neon/Supabase)

1. Create the database, set `DATABASE_URL`, run `npm run db:deploy`.
2. Set the env vars above in Vercel. Generate `AUTH_SECRET` with `openssl rand -base64 32`.
3. Create staff users (seed creates demo users; for production insert rows in `User` with a bcrypt hash).
4. Connect Inngest to `https://<app>/api/inngest`, or add a Vercel Cron hitting `POST /api/jobs/run` every 10 minutes with the bearer secret.
5. Enable the provider's daily backups with 30-day PITR and **test a restore** before launch (see docs/ADMIN.md).

## Out of scope for v1

Musician/facility login portals, payments, SMS, external calendar sync, ML matching, marketing site, bulk historical migration.

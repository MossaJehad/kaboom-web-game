# Deployment, Operations & Backups

## Environment Variables

Copy `.env.example` to `.env` and configure:
- `DATABASE_URL` — PostgreSQL connection string
- `NODE_ENV` — `production`
- `SESSION_SECRET` — Cryptographically random string (64+ chars)
- `COOKIE_SECURE` — `true` behind HTTPS/TLS
- `CORS_ORIGIN` & `APP_URL` — Public HTTPS origin of the frontend
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — Optional SMTP relay (e.g., Brevo/Resend/Mailgun free tier or self-hosted SMTP). When omitted in development, emails are written to the local dev outbox.
- `ADMIN_EMAIL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` — Initial administrator seed credentials.

## One-Project Vercel Deployment (Frontend + Fastify API)

SKYHOP is pre-configured via `vercel.json` and `api/index.mjs` to deploy both the React/Vite frontend and the Fastify API together on the same Vercel domain (ensuring same-origin HttpOnly auth & CSRF cookies work cleanly).

### 1. Provision a Free PostgreSQL Database
Create a free PostgreSQL database on **Neon** (recommended — also available directly in the Vercel Marketplace under *Storage -> Create Database -> Neon*), **Supabase**, or **Prisma Postgres**, and copy its `DATABASE_URL`.

### 2. Configure Vercel Environment Variables
In Vercel Project Settings -> Environment Variables (Production & Preview), add:
- `DATABASE_URL` = `postgresql://...` (your managed PostgreSQL connection string)
- `SESSION_SECRET` = a random 64-character secret (e.g. `openssl rand -hex 32`)
- `ADMIN_EMAIL` = your admin email
- `ADMIN_USERNAME` = your admin username
- `ADMIN_PASSWORD` = a strong admin password
- Optional SMTP vars (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) for real verification/reset emails

> `APP_URL`, `CORS_ORIGIN`, and `COOKIE_SECURE=true` are automatically derived from Vercel's `VERCEL_PROJECT_PRODUCTION_URL` / `VERCEL_URL` unless you explicitly override them (e.g., for a custom domain).

### 3. Deploy
- **Via GitHub (Recommended)**: Push this repo to GitHub and import it at [vercel.com/new](https://vercel.com/new). Vercel automatically reads `vercel.json`, builds all workspaces, runs `prisma migrate deploy` + idempotent `db:seed`, serves `apps/web/dist`, and mounts `/api/*` via `api/index.mjs`.
- **Via CLI**: Run `npx vercel` (then `npx vercel --prod` once env vars are configured).

## Self-Hosted Docker Compose Deployment

```bash
docker compose up -d --build
```
The `api` container automatically applies pending Prisma migrations (`prisma migrate deploy`) and runs idempotent catalog seeding before starting Fastify. The `web` container serves the static Vite build via Nginx and reverse-proxies `/api/*` to the API container.

## Free-Tier-Compatible Cloud Hosting Options

For small-scale indie launches without paid infrastructure:
- **PostgreSQL**: Neon or Supabase free tier (limitations: storage caps 500MB, auto-suspend cold starts after inactivity).
- **Backend API (`apps/api`)**: Render Web Service or Fly.io free/hobby tier (limitations: spin-down cold starts on free tier, 512MB RAM).
- **Frontend (`apps/web`)**: Cloudflare Pages or Vercel static hosting (limitations: configure reverse proxy/rewrite for `/api/*` to API origin or set `VITE_API_URL` and `COOKIE_SECURE=true` with matching root domain for cookies).

## Backup & Restoration

Use the included backup helper:
```bash
# Create compressed SQL dump
DATABASE_URL="postgresql://..." ./scripts/backup-db.sh backup skyhop_2026.sql.gz

# Restore from dump
DATABASE_URL="postgresql://..." ./scripts/backup-db.sh restore skyhop_2026.sql.gz
```
Schedule daily automated backups via cron or managed database snapshots and store encrypted dumps off-host.

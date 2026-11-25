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

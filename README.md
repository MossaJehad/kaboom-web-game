# SKYHOP Arcade

A production-oriented, retro pixel-art Flappy Bird-inspired web game built with **Kaboom.js 3000.1.17**, **React 19**, **Vite**, **Tailwind CSS**, **Fastify**, **PostgreSQL**, **Prisma**, and **TypeScript (strict mode)** in a modular pnpm monorepo.

## Highlights

- **Deterministic Fixed-Timestep Simulation (`@skyhop/game-core`)**: 60 TPS fixed-timestep physics completely isolated from Kaboom.js rendering, guaranteeing identical play across 60Hz, 120Hz, and 144Hz devices and enabling full backend replay verification.
- **Kaboom.js Adapter Pattern**: Kaboom.js 3000.1.17 is isolated strictly inside `apps/web/src/engine/kaboomAdapter.ts` behind `IGameEngineAdapter` for effortless future migration to KAPLAY.
- **4 Game Modes**: Classic, Hardcore (tight gaps, high speed, pause disabled), Zen (relaxed unranked practice), and Daily Challenge (shared server-controlled deterministic seed, daily leaderboard, countdown timer, and completion bonus).
- **15 Original Pixel-Art Bird Skins & 12 Unlockable Scenes**: Every bird has unique multi-frame pixel anatomy and animation; every scene has data-driven parallax layers, custom obstacles, ground textures, environmental weather FX, animated previews, and ambient audio.
- **9 Cosmetic Categories**: Bird Skins, Scenes, Obstacle Skins, Ground Textures, Particle Trails, Flapping Effects, Game-Over Effects, Profile Avatars, and Profile Frames.
- **Server-Authoritative Economy & Progression**: Earnable Coins only (no real-money payments or loot boxes), atomic transaction ledger with idempotency keys, XP/leveling, 32 achievements, rotating daily/weekly missions, and unlockable titles.
- **7 Verified Leaderboards**: All-Time, Monthly, Weekly, Daily, Daily Challenge, Hardcore, and Friends — deterministic tie-breaking, pagination, username search, and personal standing.
- **Complete Accounts, Social & Admin Operations**: Session-based HttpOnly cookie auth, scrypt hashing, CSRF protection, email verification, password reset, guest mode with safe preference migration, friends/blocking, and RBAC Admin Dashboard with replay inspection, score invalidation, audited currency adjustments, versioned difficulty configs, and audit logs.
- **PWA & Responsive Mobile Support**: Touch/mouse/keyboard input without touch duplication, portrait/landscape aspect preservation, offline practice service worker, reduced-motion, and high-contrast options.

## Quick Start (Local Development)

### Prerequisites
- Node.js 20+ (tested on v22)
- pnpm 9+ (tested on v12.23)
- PostgreSQL 16+ (or Docker Compose)

### 1. Install Dependencies & Configure Environment
```bash
cp .env.example .env
pnpm install
```

### 2. Start PostgreSQL
Option A — Docker Compose:
```bash
docker compose up -d postgres
```
Option B — Local PostgreSQL:
Ensure a PostgreSQL role `skyhop` (password `skyhop_dev_password`) and databases `skyhop` and `skyhop_test` exist matching `DATABASE_URL` in `.env`.

### 3. Build Shared Packages, Migrate, Seed & Generate Assets
```bash
pnpm build
pnpm db:migrate:deploy
pnpm db:seed
pnpm assets:generate
```

### 4. Start API & Frontend Dev Servers
```bash
pnpm dev
```
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3001`
- Default Seeded Admin Login: `skyadmin` / `ChangeMeAdmin123!` (change immediately in production via `.env`)

### 5. Run Full Docker Stack (Production-Like)
```bash
docker compose up --build
```
Serves the production frontend + proxied API at `http://localhost:8080`.

## Testing Commands

```bash
# Typecheck all workspace packages
pnpm typecheck

# Lint all workspace packages
pnpm lint

# Run unit + backend integration tests (uses skyhop_test database)
pnpm test

# Run Playwright End-to-End tests (requires API on :3001 and Web on :5173)
pnpm test:e2e
```

## Documentation Index

- [Architecture Guide](docs/ARCHITECTURE.md)
- [Database Schema](docs/DATABASE.md)
- [API Reference](docs/API.md)
- [Anti-Cheat & Security](docs/ANTI_CHEAT.md)
- [Deployment & Backups](docs/DEPLOYMENT.md)
- [Asset Licensing](docs/ASSET_LICENSING.md)

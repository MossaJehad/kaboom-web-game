# SKYHOP REST API Reference

All endpoints accept and return JSON. Authenticated sessions use `HttpOnly` cookie `skyhop_session`. All authenticated mutating requests (`POST`, `PATCH`, `PUT`, `DELETE`) require header `X-CSRF-Token` matching cookie `skyhop_csrf`.

## Health
- `GET /api/health` — Database readiness probe.

## Authentication (`/api/auth`)
- `POST /api/auth/register` — Create user, award 100 welcome coins, issue verification token & session cookie.
- `POST /api/auth/login` — Authenticate by email or username + password.
- `POST /api/auth/logout` — Revoke current session and clear cookies.
- `GET /api/auth/me` — Return current authenticated user DTO + CSRF token (or `null`).
- `POST /api/auth/verify-email` — Consume single-use verification token.
- `POST /api/auth/resend-verification` — Issue fresh email verification token.
- `POST /api/auth/forgot-password` — Issue single-use password reset token (non-enumerating response).
- `POST /api/auth/reset-password` — Reset password and revoke all existing sessions.
- `POST /api/auth/change-password` — Change password while authenticated; revokes other sessions.
- `DELETE /api/auth/account` — Permanently soft-delete account (requires password + `"DELETE"`).

## Users & Profiles (`/api/users`)
- `GET /api/users/me/profile` — Full private + public profile.
- `PATCH /api/users/me/profile` — Update display name, bio, unlocked title, and privacy flags.
- `PATCH /api/users/me/username` — Change unique username.
- `PATCH /api/users/me/settings` — Persist audio, accessibility, and keybind preferences.
- `GET /api/users/search?q=` — Search public player directory.
- `GET /api/users/:username` — Public profile respecting privacy & block rules.

## Gameplay & Leaderboards (`/api/game`, `/api/leaderboards`)
- `GET /api/game/modes` — Active game modes.
- `GET /api/game/daily-challenge` — Today's UTC Daily Challenge, reset countdown, and user status.
- `POST /api/game/sessions/start` — Create verified session with deterministic seed & versioned physics config.
- `POST /api/game/sessions/submit` — Submit flap tick replay; backend re-simulates and awards authoritative score, coins, XP, achievements, and mission progress.
- `GET /api/game/history` — Recent verified runs.
- `GET /api/leaderboards?board=&page=&pageSize=&search=` — Boards: `all_time`, `monthly`, `weekly`, `daily`, `daily_challenge`, `hardcore`, `friends`.

## Shop, Inventory & Economy (`/api/shop`, `/api/inventory`, `/api/economy`)
- `GET /api/shop/items?category=&rarity=` — Full cosmetic catalog with ownership/equipped/level lock states.
- `POST /api/shop/purchase` — Idempotent atomic purchase (server-controlled price).
- `GET /api/inventory` — Owned cosmetics & active loadout.
- `POST /api/inventory/equip` — Equip or unequip an owned cosmetic (backend ownership validated).
- `POST /api/inventory/reset` — Reset all cosmetic slots to defaults.
- `GET /api/economy/wallet` & `GET /api/economy/transactions` — Balance, rewards, purchases, and paginated ledger.

## Progression, Achievements, Missions & Friends
- `GET /api/achievements` & `POST /api/achievements/:slug/claim`
- `GET /api/missions` & `POST /api/missions/:id/claim`
- `GET /api/progression`
- `GET /api/friends`, `POST /api/friends/requests`, `POST /api/friends/requests/:id/accept`, `POST /api/friends/requests/:id/reject`, `DELETE /api/friends/:friendUserId`, `POST /api/friends/block`, `DELETE /api/friends/block/:blockedUserId`, `GET /api/friends/compare/:username`

## Admin Operations (`/api/admin` — `ADMIN` / `MODERATOR` RBAC)
- `GET /api/admin/analytics`
- `GET /api/admin/users`, `POST /api/admin/users/:id/moderate`, `POST /api/admin/users/:id/currency`
- `GET /api/admin/replays`, `POST /api/admin/results/:id/invalidate`
- `GET /api/admin/transactions`
- `GET /api/admin/cosmetics`, `POST /api/admin/cosmetics`
- `GET /api/admin/daily-challenges`, `POST /api/admin/daily-challenges`
- `GET /api/admin/missions`, `POST /api/admin/missions`
- `GET /api/admin/achievements`, `POST /api/admin/achievements`
- `GET /api/admin/configurations`, `POST /api/admin/configurations`
- `GET /api/admin/audit-logs`

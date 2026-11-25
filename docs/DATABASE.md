# Database Schema Documentation

SKYHOP uses PostgreSQL 17 managed by Prisma (`packages/database/prisma/schema.prisma`).

## Core Domain Models (28 Models)

### Accounts & Auth
- `User`: Identity, unique lowercased email & username, scrypt `passwordHash`, `role` (`USER | MODERATOR | ADMIN`), `status` (`ACTIVE | SUSPENDED | BANNED`), soft-delete `deletedAt`.
- `UserProfile`: Public/private display name, bio, active title, `unlockedTitles[]`, privacy flags (`isPublic`, `showStats`, `showCosmetics`, `showFriends`).
- `AuthSession`: SHA-256 hashed session token, session-bound `csrfToken`, expiration, revocation timestamp, IP & UA metadata.
- `EmailVerificationToken` & `PasswordResetToken`: Single-use SHA-256 hashed tokens with expiry and `usedAt`.
- `PlayerSettings`: Persisted audio volumes, accessibility toggles (`reducedMotion`, `highContrast`, `screenShake`, `vibration`), custom keybinds (`flapKey`, `pauseKey`), and `showFps`.

### Gameplay, Verification & Rankings
- `GameMode`: Mode registry (`classic`, `hardcore`, `zen`, `daily_challenge`).
- `GameConfiguration`: Immutable versioned `physicsConfig`, `economyConfig`, and `antiCheatConfig` JSON snapshots so historical sessions remain verifiable even after difficulty balance updates.
- `DailyChallenge`: UTC date-keyed deterministic seed, target score, reward coins/XP, scene slug, and config version.
- `GameSession`: Server-issued active session with `seed`, `configVersion`, `expiresAt`, and `status` (`ACTIVE | COMPLETED | EXPIRED | REJECTED`).
- `GameResult`: Authoritative verified score, obstacles passed, duration, flap count, replay payload JSON, flagging & invalidation metadata, and equipped bird/scene snapshot. Indexed on `(modeSlug, isVerified, isInvalidated, verifiedScore DESC, createdAt ASC)` for fast deterministic leaderboard queries.
- `PlayerStats`: Aggregate career stats, per-mode high scores, XP/level, consecutive fails since PR (for Comeback achievement), and daily challenge counts.

### Virtual Economy & Cosmetics
- `Wallet`: Integer `balance`, `totalEarned`, `totalSpent`.
- `CurrencyTransaction`: Immutable audit ledger with unique `idempotencyKey` preventing duplicate rewards or double-charges.
- `CosmeticItem` & `CosmeticAsset`: Data-driven catalog across 9 categories and 5 rarities with availability and level requirements.
- `UserInventory`: Unique `(userId, cosmeticItemId)` ownership records.
- `EquippedCosmetics`: Active equipped cosmetic slugs per slot.
- `Purchase`: Atomic receipt linking user, cosmetic item, `pricePaid`, `idempotencyKey`, and `CurrencyTransaction`.

### Retention, Social & Moderation
- `Achievement` & `UserAchievement`: 32 milestone definitions + per-user progress, `unlockedAt`, and single-claim `claimedAt`.
- `Mission` & `UserMission`: Rotating Daily/Weekly mission templates + period-scoped user progress, expiration, and single-claim `claimedAt`.
- `FriendRequest`, `Friendship`, `BlockedUser`: Complete social graph with canonical pair ordering `(userAId < userBId)` to prevent duplicate friendships.
- `ModerationAction` & `AuditLog`: Full accountability log for bans, suspensions, score invalidations, currency adjustments, catalog updates, and config versions.

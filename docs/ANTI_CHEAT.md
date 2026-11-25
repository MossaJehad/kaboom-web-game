# Anti-Cheat, Score Verification & Security Model

## Authoritative Deterministic Replay Verification

1. **Session Issuance**: When an authenticated player starts a run (`POST /api/game/sessions/start`), the backend creates a unique `GameSession` containing a server-generated deterministic `seed`, an immutable `configVersion`, `startedAt`, and `expiresAt`.
2. **Client Recording**: The browser runs `@skyhop/game-core`'s fixed-timestep `GameSimulation` (60 TPS) and records an ordered integer array `flapTicks: number[]` and `totalTicks`.
3. **Server Re-Simulation**: On `POST /api/game/sessions/submit`, the backend atomically transitions the session from `ACTIVE` to `COMPLETED` (blocking duplicate/parallel submissions) and executes `verifyReplay()` using the stored `seed` and exact `configVersion` physics snapshot.
4. **Validation Checks**:
   - Strictly increasing non-negative integer tick indices within `totalTicks`.
   - Maximum payload & session duration limits (`maxReplayFlaps`, `maxSessionTicks`, Fastify 512KB body cap).
   - Wall-clock time-dilation check: rejects speedhacks where simulated gameplay duration greatly exceeds real elapsed wall time since `startedAt`.
   - Client-claimed score tampering: client score is never trusted; mismatches are logged and flagged in `GameResult.isFlagged` and `AuditLog`.
   - Robotic cadence heuristic: high-score runs with unnaturally low inter-flap standard deviation are flagged for human moderator inspection without blindly banning skilled human players.

## Economy & Security Protections

- **Atomic Conditional Debits**: Wallet purchases execute `updateMany({ where: { userId, balance: { gte: price } }, data: { balance: { decrement: price } } })` inside a Prisma transaction paired with unique `UserInventory(userId, cosmeticItemId)` and `Purchase(idempotencyKey)` constraints — eliminating race conditions and negative balances.
- **Reward Anti-Farming**: Daily cap on obstacle coins, minimum score/duration eligibility for First Game of Day, minimum score + daily cap for Personal Record bonuses, single-claim enforcement on Achievements/Missions, and strict exclusion of Zen & guest runs from competitive rankings.
- **Auth Hardening**: `scrypt` password hashing with 16-byte random salt + `timingSafeEqual`, SHA-256 hashed session tokens in `HttpOnly` `SameSite=Lax` cookies, CSRF header validation, Helmet headers, Zod input validation, and Fastify rate limiting.

## Documented Limitations

Deterministic replay verification eliminates direct score forgery, memory editing, replay duplication, and time-scale speedhacks, **but does not eliminate external computer-vision or DOM-reading bots** that observe the screen and inject legitimate human-like keypress timings in real time. To mitigate automated play, SKYHOP combines robotic cadence flagging, rate limiting, replay inspection in the Admin Dashboard, score invalidation with automatic leaderboard recalculation, and account suspension/ban workflows.

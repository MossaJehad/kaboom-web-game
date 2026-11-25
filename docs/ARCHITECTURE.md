# SKYHOP Architecture

## Monorepo Layout

| Workspace | Responsibility |
|---|---|
| `packages/shared` | Shared TypeScript DTOs, Zod validation schemas, physics/economy/anti-cheat defaults, progression curve, and data-driven catalog definitions (15 birds, 12 scenes, 9 cosmetic categories, 32 achievements, 12 missions). |
| `packages/game-core` | Pure deterministic 60 TPS simulation (`GameSimulation`), Mulberry32 PRNG (`DeterministicRng`), physically-possible obstacle generator, AABB collision detection, and server-side replay verifier (`verifyReplay`). Zero browser or Kaboom.js dependency. |
| `packages/database` | Prisma 6 PostgreSQL schema (28 normalized models), migrations, client export, and idempotent seed script. |
| `apps/api` | Fastify v5 REST API with HttpOnly session auth, CSRF protection, Helmet headers, rate limiting, atomic wallet/shop transactions, replay verification, leaderboards, friends, and RBAC admin operations. |
| `apps/web` | React 19 + Vite + Tailwind CSS v4 frontend + isolated Kaboom.js 3000.1.17 renderer (`KaboomGameAdapter`), explicit 9-state FSM, Web Audio manager, and PWA service worker. |
| `scripts/` | Deterministic pixel-art PNG + WAV audio asset builder (`generate-assets.ts`) and PostgreSQL backup/restore script (`backup-db.sh`). |

## Separation of Concerns: React vs Kaboom.js

- **React** owns routing, menus, shop, wardrobe, leaderboards, forms, audio settings, and modal overlays (`READY`, `COUNTDOWN`, `PAUSED`, `RESULTS`). React never runs inside `requestAnimationFrame` or re-renders every frame.
- **Kaboom.js 3000.1.17** runs exclusively inside `apps/web/src/engine/kaboomAdapter.ts` implementing `IGameEngineAdapter`.
- **Simulation**: Inside `onFrameUpdate(dt)`, the adapter accumulates wall time and steps `@skyhop/game-core`'s `GameSimulation` in exact `FIXED_DT = 1/60` increments. Visual particles and score popups use preallocated object pools (`MAX_PARTICLES = 90`, `MAX_POPUPS = 10`) to prevent GC pauses on mobile devices.
- **Future KAPLAY Migration**: Replacing Kaboom.js with KAPLAY only requires creating a `KaplayGameAdapter` implementing `IGameEngineAdapter` — zero changes to React pages, simulation, or backend code.

## Explicit 9-State Game Machine

```
LOADING -> READY -> COUNTDOWN -> PLAYING <-> PAUSED
                                    |
                                GAME_OVER -> RESULTS -> RESTARTING -> READY
```

Every transition is guarded by `GameStateMachine` (`apps/web/src/engine/stateMachine.ts`). Unmounting `PlayPage` invokes `adapter.unmount()`, cancelling Kaboom callbacks, calling `k.quit()`, and removing all window/document/canvas listeners so overlapping sessions or duplicate listeners cannot occur.

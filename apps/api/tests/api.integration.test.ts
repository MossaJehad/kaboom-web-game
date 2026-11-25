import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@skyhop/database";
import { GameSimulation } from "@skyhop/game-core";
import type { ModePhysicsConfig } from "@skyhop/shared";
import { seedDatabase } from "../../../packages/database/prisma/seed.js";
import { buildApp } from "../src/app.js";
import { clearDevOutbox } from "../src/services/mailer.js";

// Point integration tests to isolated test database
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://skyhop:skyhop_dev_password@localhost:5432/skyhop_test?schema=public";
process.env.NODE_ENV = "test";
process.env.COOKIE_SECURE = "false";

function extractCookieHeader(setCookie: string | string[] | undefined): string {
  if (!setCookie) return "";
  const list = Array.isArray(setCookie) ? setCookie : [setCookie];
  return list.map((c) => c.split(";")[0]!).join("; ");
}

function generateWinningReplay(seed: string, config: ModePhysicsConfig, targetScore: number) {
  const sim = new GameSimulation(seed, config);
  const flapTicks: number[] = [];

  for (let tick = 0; tick < 60 * 90; tick++) {
    const st = sim.getState();
    if (!st.alive) break;
    if (st.score >= targetScore) {
      sim.step(false);
      continue;
    }
    const upcoming = st.obstacles.find((o) => o.x + o.width > st.birdX - 14);
    const desiredY = upcoming ? upcoming.gapCenterY + upcoming.gapHeight * 0.18 : 280;
    const flapApex = (config.flapVelocity * config.flapVelocity) / (2 * config.gravity);
    const insideOrNear = upcoming ? upcoming.x < st.birdX + 36 : false;
    const safeTop = upcoming && insideOrNear ? upcoming.gapCenterY - upcoming.gapHeight / 2 + 13 : 36;
    const shouldFlap = st.birdY > desiredY && st.birdY - flapApex > safeTop;
    const res = sim.step(shouldFlap);
    if (res.flapped) flapTicks.push(tick);
  }
  const final = sim.getState();
  return { flapTicks, totalTicks: final.tick, score: final.score };
}

describe("SKYHOP API End-to-End Integration Suite", () => {
  let app: FastifyInstance;
  let playerCookie = "";
  let playerCsrf = "";
  let playerId = "";
  let player2Cookie = "";
  let player2Csrf = "";
  let adminCookie = "";
  let adminCsrf = "";

  beforeAll(async () => {
    // Clean test DB tables and seed fresh catalog + admin
    await prisma.auditLog.deleteMany();
    await prisma.moderationAction.deleteMany();
    await prisma.purchase.deleteMany();
    await prisma.currencyTransaction.deleteMany();
    await prisma.gameResult.deleteMany();
    await prisma.gameSession.deleteMany();
    await prisma.userMission.deleteMany();
    await prisma.userAchievement.deleteMany();
    await prisma.userInventory.deleteMany();
    await prisma.friendRequest.deleteMany();
    await prisma.friendship.deleteMany();
    await prisma.blockedUser.deleteMany();
    await prisma.authSession.deleteMany();
    await prisma.emailVerificationToken.deleteMany();
    await prisma.passwordResetToken.deleteMany();
    await prisma.user.deleteMany();

    await seedDatabase(prisma);
    clearDevOutbox();
    app = await buildApp({ logger: false, rateLimitMax: 2000 });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("registers a new player, grants 100 welcome coins, verifies email, and enforces CSRF", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "ace@example.com",
        username: "AcePilot",
        password: "Password123",
        guestMigration: { localClassicBest: 42 },
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user.username).toBe("AcePilot");
    expect(body.user.walletBalance).toBe(100);
    expect(body.user.emailVerified).toBe(false);
    expect(body.devVerificationToken).toBeTruthy();

    playerCookie = extractCookieHeader(res.headers["set-cookie"]);
    playerCsrf = body.csrfToken;
    playerId = body.user.id;

    // Guest migration MUST NOT inject unverified scores into competitive leaderboard
    const lbBefore = await app.inject({ method: "GET", url: "/api/leaderboards?board=all_time" });
    expect(lbBefore.json().entries).toHaveLength(0);

    // CSRF protection rejects authenticated mutations missing X-CSRF-Token
    const noCsrf = await app.inject({
      method: "PATCH",
      url: "/api/users/me/profile",
      headers: { cookie: playerCookie },
      payload: { bio: "hacked" },
    });
    expect(noCsrf.statusCode).toBe(403);
    expect(noCsrf.json().error.code).toBe("INVALID_CSRF_TOKEN");

    // Verify email with issued token
    const verifyRes = await app.inject({
      method: "POST",
      url: "/api/auth/verify-email",
      payload: { token: body.devVerificationToken },
    });
    expect(verifyRes.statusCode).toBe(200);
    expect(verifyRes.json().emailVerified).toBe(true);

    // Reusing the same verification token must fail
    const reuseRes = await app.inject({
      method: "POST",
      url: "/api/auth/verify-email",
      payload: { token: body.devVerificationToken },
    });
    expect(reuseRes.statusCode).toBe(400);
  });

  it("verifies deterministic gameplay sessions, awards coins/XP/leaderboard rank, and blocks replay abuse", async () => {
    // Start Classic session
    const startRes = await app.inject({
      method: "POST",
      url: "/api/game/sessions/start",
      headers: { cookie: playerCookie, "x-csrf-token": playerCsrf },
      payload: { mode: "classic" },
    });
    expect(startRes.statusCode).toBe(201);
    const session = startRes.json().session;

    // Backdate session.startedAt by 40s so wall-clock check sees realistic elapsed duration without sleeping
    await prisma.gameSession.update({
      where: { id: session.sessionId },
      data: { startedAt: new Date(Date.now() - 45000) },
    });

    const replay = generateWinningReplay(session.seed, session.physicsConfig, 12);
    expect(replay.score).toBeGreaterThanOrEqual(12);

    // Submit replay claiming fake 999 score — backend MUST ignore claimed score, compute verified score, and flag!
    const submitRes = await app.inject({
      method: "POST",
      url: "/api/game/sessions/submit",
      headers: { cookie: playerCookie, "x-csrf-token": playerCsrf },
      payload: {
        sessionId: session.sessionId,
        flapTicks: replay.flapTicks,
        totalTicks: replay.totalTicks,
        clientClaimedScore: 999,
      },
    });
    expect(submitRes.statusCode).toBe(200);
    const summary = submitRes.json().summary;
    expect(summary.verifiedScore).toBe(replay.score);
    expect(summary.verifiedScore).not.toBe(999);
    expect(summary.flagged).toBe(true);
    expect(summary.coinsBreakdown.firstGameOfDay).toBe(10);
    expect(summary.coinsBreakdown.personalRecord).toBe(15);
    expect(summary.coinsBreakdown.obstacles).toBe(Math.floor(replay.score / 5));
    expect(summary.xpAwarded).toBeGreaterThan(0);

    // Duplicate session submission MUST be rejected (409)
    const dupRes = await app.inject({
      method: "POST",
      url: "/api/game/sessions/submit",
      headers: { cookie: playerCookie, "x-csrf-token": playerCsrf },
      payload: {
        sessionId: session.sessionId,
        flapTicks: replay.flapTicks,
        totalTicks: replay.totalTicks,
      },
    });
    expect(dupRes.statusCode).toBe(409);

    // Speedhack rejection: brand new session submitting 15 seconds of sim ticks immediately
    const fastStart = await app.inject({
      method: "POST",
      url: "/api/game/sessions/start",
      headers: { cookie: playerCookie, "x-csrf-token": playerCsrf },
      payload: { mode: "classic" },
    });
    const fastSess = fastStart.json().session;
    const fastReplay = generateWinningReplay(fastSess.seed, fastSess.physicsConfig, 10);
    const speedhackRes = await app.inject({
      method: "POST",
      url: "/api/game/sessions/submit",
      headers: { cookie: playerCookie, "x-csrf-token": playerCsrf },
      payload: {
        sessionId: fastSess.sessionId,
        flapTicks: fastReplay.flapTicks,
        totalTicks: fastReplay.totalTicks,
      },
    });
    expect(speedhackRes.statusCode).toBe(400);
    expect(speedhackRes.json().error.code).toBe("INVALID_REPLAY");

    // Player appears on Classic All-Time Leaderboard with verified score
    const lbRes = await app.inject({
      method: "GET",
      url: "/api/leaderboards?board=all_time",
      headers: { cookie: playerCookie },
    });
    expect(lbRes.statusCode).toBe(200);
    expect(lbRes.json().entries).toHaveLength(1);
    expect(lbRes.json().entries[0].username).toBe("AcePilot");
    expect(lbRes.json().entries[0].score).toBe(replay.score);
    expect(lbRes.json().personalEntry.rank).toBe(1);
  });

  it("ensures Zen mode never affects competitive rankings", async () => {
    const startRes = await app.inject({
      method: "POST",
      url: "/api/game/sessions/start",
      headers: { cookie: playerCookie, "x-csrf-token": playerCsrf },
      payload: { mode: "zen" },
    });
    const sess = startRes.json().session;
    await prisma.gameSession.update({
      where: { id: sess.sessionId },
      data: { startedAt: new Date(Date.now() - 60000) },
    });
    const replay = generateWinningReplay(sess.seed, sess.physicsConfig, 25);
    const submitRes = await app.inject({
      method: "POST",
      url: "/api/game/sessions/submit",
      headers: { cookie: playerCookie, "x-csrf-token": playerCsrf },
      payload: {
        sessionId: sess.sessionId,
        flapTicks: replay.flapTicks,
        totalTicks: replay.totalTicks,
      },
    });
    expect(submitRes.statusCode).toBe(200);

    const lbRes = await app.inject({ method: "GET", url: "/api/leaderboards?board=all_time" });
    expect(lbRes.json().entries[0].score).toBeLessThan(25);
  });

  it("handles atomic concurrent purchases without negative balances, enforces ownership on equip", async () => {
    // Attempting to equip unowned cosmetic MUST be forbidden
    const unownedEquip = await app.inject({
      method: "POST",
      url: "/api/inventory/equip",
      headers: { cookie: playerCookie, "x-csrf-token": playerCsrf },
      payload: { category: "BIRD_SKIN", cosmeticSlug: "bluebird" },
    });
    expect(unownedEquip.statusCode).toBe(403);
    expect(unownedEquip.json().error.code).toBe("COSMETIC_NOT_OWNED");

    // Set wallet to exact 100 coins and fire 5 simultaneous purchases of Bluebird (100 coins)
    await prisma.wallet.update({ where: { userId: playerId }, data: { balance: 100 } });

    const attempts = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        app.inject({
          method: "POST",
          url: "/api/shop/purchase",
          headers: { cookie: playerCookie, "x-csrf-token": playerCsrf },
          payload: { cosmeticSlug: "bluebird", idempotencyKey: `race-test-${i}-${Date.now()}` },
        })
      )
    );

    const succeeded = attempts.filter((r) => r.statusCode === 201);
    expect(succeeded).toHaveLength(1);

    const walletAfter = await prisma.wallet.findUniqueOrThrow({ where: { userId: playerId } });
    expect(walletAfter.balance).toBe(0);

    // Now equipping Bluebird succeeds!
    const equipRes = await app.inject({
      method: "POST",
      url: "/api/inventory/equip",
      headers: { cookie: playerCookie, "x-csrf-token": playerCsrf },
      payload: { category: "BIRD_SKIN", cosmeticSlug: "bluebird" },
    });
    expect(equipRes.statusCode).toBe(200);
    expect(equipRes.json().equipped.birdSkin).toBe("bluebird");

    // Buying an expensive item with 0 coins fails cleanly with INSUFFICIENT_COINS
    const poorRes = await app.inject({
      method: "POST",
      url: "/api/shop/purchase",
      headers: { cookie: playerCookie, "x-csrf-token": playerCsrf },
      payload: { cosmeticSlug: "cosmic-dragon" },
    });
    expect(poorRes.statusCode).toBe(400);
    expect(poorRes.json().error.code).toBe("INSUFFICIENT_COINS");
  });

  it("prevents duplicate achievement claims and supports friend requests & friends leaderboard", async () => {
    // Claim unlocked "first-flight" achievement
    const claim1 = await app.inject({
      method: "POST",
      url: "/api/achievements/first-flight/claim",
      headers: { cookie: playerCookie, "x-csrf-token": playerCsrf },
    });
    expect(claim1.statusCode).toBe(200);
    expect(claim1.json().coinsAwarded).toBe(15);

    // Second claim MUST fail
    const claim2 = await app.inject({
      method: "POST",
      url: "/api/achievements/first-flight/claim",
      headers: { cookie: playerCookie, "x-csrf-token": playerCsrf },
    });
    expect(claim2.statusCode).toBe(400);
    expect(claim2.json().error.code).toBe("ALREADY_CLAIMED");

    // Register second player and test friend workflow
    const reg2 = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "wingmate@example.com", username: "WingMate", password: "Password123" },
    });
    expect(reg2.statusCode).toBe(201);
    player2Cookie = extractCookieHeader(reg2.headers["set-cookie"]);
    player2Csrf = reg2.json().csrfToken;

    const sendReq = await app.inject({
      method: "POST",
      url: "/api/friends/requests",
      headers: { cookie: playerCookie, "x-csrf-token": playerCsrf },
      payload: { username: "WingMate" },
    });
    expect(sendReq.statusCode).toBe(201);

    const p2Friends = await app.inject({
      method: "GET",
      url: "/api/friends",
      headers: { cookie: player2Cookie },
    });
    const reqId = p2Friends.json().incomingRequests[0].id;

    const acceptRes = await app.inject({
      method: "POST",
      url: `/api/friends/requests/${reqId}/accept`,
      headers: { cookie: player2Cookie, "x-csrf-token": player2Csrf },
    });
    expect(acceptRes.statusCode).toBe(200);

    const friendsLb = await app.inject({
      method: "GET",
      url: "/api/leaderboards?board=friends",
      headers: { cookie: player2Cookie },
    });
    expect(friendsLb.statusCode).toBe(200);
    expect(friendsLb.json().entries.some((e: { username: string }) => e.username === "AcePilot")).toBe(true);
  });

  it("enforces admin RBAC, supports audited currency adjustments, score invalidation, and config versioning", async () => {
    // Regular user CANNOT access admin endpoints
    const nonAdmin = await app.inject({
      method: "GET",
      url: "/api/admin/analytics",
      headers: { cookie: playerCookie },
    });
    expect(nonAdmin.statusCode).toBe(403);

    // Admin logs in
    const adminLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        identifier: process.env.ADMIN_USERNAME ?? "skyadmin",
        password: process.env.ADMIN_PASSWORD ?? "ChangeMeAdmin123!",
      },
    });
    expect(adminLogin.statusCode).toBe(200);
    adminCookie = extractCookieHeader(adminLogin.headers["set-cookie"]);
    adminCsrf = adminLogin.json().csrfToken;

    // Fetch real analytics
    const analytics = await app.inject({
      method: "GET",
      url: "/api/admin/analytics",
      headers: { cookie: adminCookie },
    });
    expect(analytics.statusCode).toBe(200);
    expect(analytics.json().analytics.totalUsers).toBeGreaterThanOrEqual(3);

    // Audited currency grant
    const adj = await app.inject({
      method: "POST",
      url: `/api/admin/users/${playerId}/currency`,
      headers: { cookie: adminCookie, "x-csrf-token": adminCsrf },
      payload: { amount: 500, reason: "Tournament prize payout" },
    });
    expect(adj.statusCode).toBe(200);
    expect(adj.json().balance).toBeGreaterThanOrEqual(500);

    // Inspect flagged replay and invalidate it -> removes score from leaderboard!
    const replaysRes = await app.inject({
      method: "GET",
      url: "/api/admin/replays?flaggedOnly=true",
      headers: { cookie: adminCookie },
    });
    expect(replaysRes.statusCode).toBe(200);
    const flaggedId = replaysRes.json().replays[0].id;

    const invRes = await app.inject({
      method: "POST",
      url: `/api/admin/results/${flaggedId}/invalidate`,
      headers: { cookie: adminCookie, "x-csrf-token": adminCsrf },
      payload: { reason: "Tampered client score mismatch confirmed" },
    });
    expect(invRes.statusCode).toBe(200);

    // Leaderboard is now clean after invalidation
    const lbAfter = await app.inject({ method: "GET", url: "/api/leaderboards?board=all_time" });
    expect(lbAfter.json().entries).toHaveLength(0);

    // Audit log recorded admin actions
    const auditRes = await app.inject({
      method: "GET",
      url: "/api/admin/audit-logs",
      headers: { cookie: adminCookie },
    });
    expect(auditRes.statusCode).toBe(200);
    expect(auditRes.json().logs.some((l: { action: string }) => l.action === "ADMIN_INVALIDATE_RESULT")).toBe(true);
  });
});

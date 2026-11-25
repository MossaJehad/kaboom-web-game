import type { FastifyInstance } from "fastify";
import { prisma } from "@skyhop/database";
import { startGameSessionSchema, submitGameSessionSchema } from "@skyhop/shared";
import { requireAuth } from "../plugins/auth.js";
import {
  getOrCreateTodayDailyChallenge,
  startGameSession,
  submitGameSession,
} from "../services/game.service.js";

export async function gameRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/api/game/modes", async (_request, reply) => {
    const modes = await prisma.gameMode.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
    return reply.send({ modes });
  });

  fastify.get("/api/game/daily-challenge", async (request, reply) => {
    const daily = await getOrCreateTodayDailyChallenge();
    let userCompletedToday = false;
    let userBestToday = 0;

    if (request.auth) {
      const best = await prisma.gameResult.findFirst({
        where: {
          userId: request.auth.user.id,
          dailyChallengeId: daily.id,
          isVerified: true,
          isInvalidated: false,
        },
        orderBy: { verifiedScore: "desc" },
      });
      if (best) {
        userBestToday = best.verifiedScore;
        userCompletedToday = best.verifiedScore >= daily.targetScore;
      }
    }

    return reply.send({
      dailyChallenge: {
        id: daily.id,
        challengeDate: daily.challengeDate,
        targetScore: daily.targetScore,
        rewardCoins: daily.rewardCoins,
        rewardXp: daily.rewardXp,
        sceneSlug: daily.sceneSlug,
        nextResetAt: daily.nextResetAt,
        msUntilReset: daily.msUntilReset,
        userCompletedToday,
        userBestToday,
      },
    });
  });

  fastify.post("/api/game/sessions/start", async (request, reply) => {
    const auth = requireAuth(request);
    const body = startGameSessionSchema.parse(request.body);
    const session = await startGameSession({
      userId: auth.user.id,
      modeSlug: body.mode,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"],
    });
    return reply.status(201).send({ session });
  });

  fastify.post("/api/game/sessions/submit", async (request, reply) => {
    const auth = requireAuth(request);
    const body = submitGameSessionSchema.parse(request.body);
    const summary = await submitGameSession({
      userId: auth.user.id,
      sessionId: body.sessionId,
      flapTicks: body.flapTicks,
      totalTicks: body.totalTicks,
      clientClaimedScore: body.clientClaimedScore,
      pauseDurationMs: body.pauseDurationMs,
      ipAddress: request.ip,
    });
    return reply.send({ summary });
  });

  fastify.get("/api/game/history", async (request, reply) => {
    const auth = requireAuth(request);
    const q = request.query as { limit?: string };
    const limit = Math.min(50, Math.max(1, Number(q.limit) || 20));
    const results = await prisma.gameResult.findMany({
      where: { userId: auth.user.id },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        modeSlug: true,
        verifiedScore: true,
        obstaclesPassed: true,
        durationMs: true,
        deathReason: true,
        equippedBirdSlug: true,
        equippedSceneSlug: true,
        coinsAwarded: true,
        xpAwarded: true,
        isPersonalRecord: true,
        isInvalidated: true,
        createdAt: true,
      },
    });
    return reply.send({ results });
  });
}

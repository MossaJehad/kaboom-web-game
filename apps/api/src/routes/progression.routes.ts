import type { FastifyInstance } from "fastify";
import { prisma } from "@skyhop/database";
import { calculateLevelProgress, LEVEL_MILESTONE_REWARDS } from "@skyhop/shared";
import { requireAuth } from "../plugins/auth.js";
import {
  claimAchievementReward,
  claimMissionReward,
  ensureActiveMissionsForUserTx,
  evaluateUserAchievementsTx,
} from "../services/progression.service.js";

export async function progressionRoutes(fastify: FastifyInstance): Promise<void> {
  // List all achievements with user progress & claim state
  fastify.get("/api/achievements", async (request, reply) => {
    const auth = requireAuth(request);

    await prisma.$transaction(async (tx) => {
      await evaluateUserAchievementsTx(tx, auth.user.id);
    });

    const [achievements, userAchievements] = await Promise.all([
      prisma.achievement.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.userAchievement.findMany({
        where: { userId: auth.user.id },
      }),
    ]);

    const uaMap = new Map(userAchievements.map((u) => [u.achievementId, u]));
    return reply.send({
      achievements: achievements.map((a) => {
        const ua = uaMap.get(a.id);
        return {
          id: a.id,
          slug: a.slug,
          name: a.name,
          description: a.description,
          category: a.category,
          iconKey: a.iconKey,
          targetValue: a.targetValue,
          rewardCoins: a.rewardCoins,
          rewardXp: a.rewardXp,
          rewardTitle: a.rewardTitle,
          progress: ua?.progress ?? 0,
          unlocked: Boolean(ua?.unlockedAt),
          unlockedAt: ua?.unlockedAt?.toISOString() ?? null,
          claimed: Boolean(ua?.claimedAt),
          claimedAt: ua?.claimedAt?.toISOString() ?? null,
        };
      }),
    });
  });

  fastify.post("/api/achievements/:slug/claim", async (request, reply) => {
    const auth = requireAuth(request);
    const { slug } = request.params as { slug: string };
    const result = await claimAchievementReward(auth.user.id, slug);
    return reply.send(result);
  });

  // Daily & Weekly rotating missions
  fastify.get("/api/missions", async (request, reply) => {
    const auth = requireAuth(request);
    const missions = await prisma.$transaction((tx) =>
      ensureActiveMissionsForUserTx(tx, auth.user.id)
    );

    const now = Date.now();
    return reply.send({
      missions: missions.map((um) => ({
        id: um.id,
        slug: um.mission.slug,
        name: um.mission.name,
        description: um.mission.description,
        cadence: um.mission.cadence,
        targetValue: um.mission.targetValue,
        progress: um.progress,
        rewardCoins: um.mission.rewardCoins,
        rewardXp: um.mission.rewardXp,
        periodKey: um.periodKey,
        completed: Boolean(um.completedAt),
        completedAt: um.completedAt?.toISOString() ?? null,
        claimed: Boolean(um.claimedAt),
        claimedAt: um.claimedAt?.toISOString() ?? null,
        expiresAt: um.expiresAt.toISOString(),
        msRemaining: Math.max(0, um.expiresAt.getTime() - now),
      })),
    });
  });

  fastify.post("/api/missions/:id/claim", async (request, reply) => {
    const auth = requireAuth(request);
    const { id } = request.params as { id: string };
    const result = await claimMissionReward(auth.user.id, id);
    return reply.send(result);
  });

  // Progression overview & level milestones
  fastify.get("/api/progression", async (request, reply) => {
    const auth = requireAuth(request);
    const [stats, profile, levelTxs] = await Promise.all([
      prisma.playerStats.findUniqueOrThrow({ where: { userId: auth.user.id } }),
      prisma.userProfile.findUnique({ where: { userId: auth.user.id } }),
      prisma.currencyTransaction.findMany({
        where: { userId: auth.user.id, source: "LEVEL_UP" },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
    ]);

    const lvl = calculateLevelProgress(stats.xp);
    return reply.send({
      progression: {
        level: lvl.level,
        xp: stats.xp,
        currentLevelXp: lvl.currentLevelXp,
        nextLevelXp: lvl.nextLevelXp,
        progressPercent: lvl.progressPercent,
        unlockedTitles: profile?.unlockedTitles ?? [],
        activeTitle: profile?.title ?? null,
        milestones: LEVEL_MILESTONE_REWARDS.map((m) => ({
          ...m,
          reached: lvl.level >= m.level,
        })),
        history: levelTxs.map((tx) => ({
          id: tx.id,
          description: tx.description,
          coins: tx.amount,
          createdAt: tx.createdAt.toISOString(),
        })),
      },
    });
  });
}

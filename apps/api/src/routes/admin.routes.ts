import type { FastifyInstance } from "fastify";
import { prisma, Prisma } from "@skyhop/database";
import {
  adminAchievementSchema,
  adminAdjustCurrencySchema,
  adminCosmeticUpsertSchema,
  adminDailyChallengeSchema,
  adminGameConfigSchema,
  adminMissionSchema,
  adminModerateUserSchema,
  DEFAULT_ANTICHEAT_CONFIG,
  DEFAULT_ECONOMY_CONFIG,
  DEFAULT_MODE_CONFIGS,
  type GameModeSlug,
} from "@skyhop/shared";
import { requireRole } from "../plugins/auth.js";
import { adminAdjustCoins } from "../services/economy.service.js";
import { deriveDailySeed } from "../utils/crypto.js";
import { badRequest, notFound } from "../utils/errors.js";

export async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  // Real backend analytics
  fastify.get("/api/admin/analytics", async (request, reply) => {
    requireRole(request, ["ADMIN", "MODERATOR"]);
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      newUsers24h,
      bannedUsers,
      totalGames,
      games24h,
      flaggedResults,
      invalidatedResults,
      totalPurchases,
      walletStats,
      modeBreakdown,
    ] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.user.count({ where: { deletedAt: null, createdAt: { gte: last24h } } }),
      prisma.user.count({ where: { status: { in: ["BANNED", "SUSPENDED"] } } }),
      prisma.gameResult.count(),
      prisma.gameResult.count({ where: { createdAt: { gte: last24h } } }),
      prisma.gameResult.count({ where: { isFlagged: true, isInvalidated: false } }),
      prisma.gameResult.count({ where: { isInvalidated: true } }),
      prisma.purchase.count(),
      prisma.wallet.aggregate({
        _sum: { balance: true, totalEarned: true, totalSpent: true },
      }),
      prisma.gameResult.groupBy({
        by: ["modeSlug"],
        where: { createdAt: { gte: last7d } },
        _count: { id: true },
        _avg: { verifiedScore: true },
      }),
    ]);

    return reply.send({
      analytics: {
        totalUsers,
        newUsers24h,
        bannedOrSuspendedUsers: bannedUsers,
        totalGames,
        games24h,
        flaggedResults,
        invalidatedResults,
        totalPurchases,
        economy: {
          circulatingCoins: walletStats._sum.balance ?? 0,
          totalCoinsEarned: walletStats._sum.totalEarned ?? 0,
          totalCoinsSpent: walletStats._sum.totalSpent ?? 0,
        },
        modeBreakdown7d: modeBreakdown.map((m) => ({
          modeSlug: m.modeSlug,
          games: m._count.id,
          avgScore: Number((m._avg.verifiedScore ?? 0).toFixed(1)),
        })),
      },
    });
  });

  // Search & filter registered players
  fastify.get("/api/admin/users", async (request, reply) => {
    requireRole(request, ["ADMIN", "MODERATOR"]);
    const q = request.query as { search?: string; status?: string; page?: string; pageSize?: string };
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(q.pageSize) || 25));

    const where: Prisma.UserWhereInput = { deletedAt: null };
    if (q.status && ["ACTIVE", "SUSPENDED", "BANNED"].includes(q.status)) {
      where.status = q.status as "ACTIVE" | "SUSPENDED" | "BANNED";
    }
    if (q.search && q.search.trim().length > 0) {
      const s = q.search.trim().toLowerCase();
      where.OR = [{ usernameLower: { contains: s } }, { emailLower: { contains: s } }];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          status: true,
          emailVerifiedAt: true,
          suspendedUntil: true,
          banReason: true,
          createdAt: true,
          wallet: { select: { balance: true, totalEarned: true, totalSpent: true } },
          stats: { select: { level: true, totalGames: true, highestScore: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return reply.send({
      users,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    });
  });

  // Moderate user (WARN / SUSPEND / UNSUSPEND / BAN / UNBAN)
  fastify.post("/api/admin/users/:id/moderate", async (request, reply) => {
    const auth = requireRole(request, ["ADMIN", "MODERATOR"]);
    const { id } = request.params as { id: string };
    const body = adminModerateUserSchema.parse(request.body);

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target || target.deletedAt) {
      throw notFound("User not found.");
    }
    if (target.id === auth.user.id) {
      throw badRequest("You cannot moderate your own account.");
    }
    if (target.role === "ADMIN" && auth.user.role !== "ADMIN") {
      throw badRequest("Moderators cannot moderate administrators.");
    }

    const suspendedUntil =
      body.action === "SUSPEND"
        ? new Date(Date.now() + (body.durationHours ?? 24) * 60 * 60 * 1000)
        : null;

    await prisma.$transaction(async (tx) => {
      if (body.action === "BAN") {
        await tx.user.update({
          where: { id },
          data: { status: "BANNED", banReason: body.reason, suspendedUntil: null },
        });
        await tx.authSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      } else if (body.action === "SUSPEND") {
        await tx.user.update({
          where: { id },
          data: { status: "SUSPENDED", suspendedUntil, banReason: body.reason },
        });
        await tx.authSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      } else if (body.action === "UNBAN" || body.action === "UNSUSPEND") {
        await tx.user.update({
          where: { id },
          data: { status: "ACTIVE", suspendedUntil: null, banReason: null },
        });
      }

      await tx.moderationAction.create({
        data: {
          targetUserId: id,
          moderatorId: auth.user.id,
          actionType: body.action,
          reason: body.reason,
          expiresAt: suspendedUntil,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: auth.user.id,
          action: `ADMIN_USER_${body.action}`,
          entityType: "User",
          entityId: id,
          details: { reason: body.reason, durationHours: body.durationHours },
          ipAddress: request.ip,
        },
      });
    });

    return reply.send({ ok: true });
  });

  // Audited currency adjustment
  fastify.post("/api/admin/users/:id/currency", async (request, reply) => {
    const auth = requireRole(request, ["ADMIN"]);
    const { id } = request.params as { id: string };
    const body = adminAdjustCurrencySchema.parse(request.body);

    const res = await adminAdjustCoins({
      targetUserId: id,
      actorId: auth.user.id,
      amount: body.amount,
      reason: body.reason,
      ipAddress: request.ip,
    });

    return reply.send({ ok: true, ...res });
  });

  // Review suspicious & recent gameplay replays
  fastify.get("/api/admin/replays", async (request, reply) => {
    requireRole(request, ["ADMIN", "MODERATOR"]);
    const q = request.query as { flaggedOnly?: string; limit?: string };
    const flaggedOnly = q.flaggedOnly === "true";
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 30));

    const results = await prisma.gameResult.findMany({
      where: flaggedOnly ? { isFlagged: true } : {},
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        user: { select: { id: true, username: true, status: true } },
        session: { select: { seed: true, configVersion: true, startedAt: true } },
      },
    });

    return reply.send({ replays: results });
  });

  // Invalidate fraudulent score and recalculate affected player's high scores
  fastify.post("/api/admin/results/:id/invalidate", async (request, reply) => {
    const auth = requireRole(request, ["ADMIN", "MODERATOR"]);
    const { id } = request.params as { id: string };
    const body = (request.body as { reason?: string } | null) ?? {};
    const reason = (body.reason ?? "Invalidated during moderation review").trim();

    const result = await prisma.gameResult.findUnique({ where: { id } });
    if (!result) {
      throw notFound("Game result not found.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.gameResult.update({
        where: { id },
        data: {
          isInvalidated: true,
          invalidatedById: auth.user.id,
          invalidatedReason: reason,
        },
      });

      // Recompute user's authoritative high scores from remaining valid results
      const bestByMode = await tx.gameResult.groupBy({
        by: ["modeSlug"],
        where: {
          userId: result.userId,
          isVerified: true,
          isInvalidated: false,
        },
        _max: { verifiedScore: true },
      });

      const scoreMap = new Map(bestByMode.map((b) => [b.modeSlug, b._max.verifiedScore ?? 0]));
      const classicHigh = scoreMap.get("classic") ?? 0;
      const hardcoreHigh = scoreMap.get("hardcore") ?? 0;
      const zenHigh = scoreMap.get("zen") ?? 0;
      const dailyHigh = scoreMap.get("daily_challenge") ?? 0;
      const rankedHigh = Math.max(classicHigh, hardcoreHigh, dailyHigh);

      await tx.playerStats.update({
        where: { userId: result.userId },
        data: {
          classicHighScore: classicHigh,
          hardcoreHighScore: hardcoreHigh,
          zenHighScore: zenHigh,
          dailyHighScore: dailyHigh,
          highestScore: rankedHigh,
        },
      });

      await tx.moderationAction.create({
        data: {
          targetUserId: result.userId,
          moderatorId: auth.user.id,
          actionType: "INVALIDATE_SCORE",
          reason,
          metadata: { resultId: id, invalidatedScore: result.verifiedScore, modeSlug: result.modeSlug },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: auth.user.id,
          action: "ADMIN_INVALIDATE_RESULT",
          entityType: "GameResult",
          entityId: id,
          details: { userId: result.userId, score: result.verifiedScore, reason },
          ipAddress: request.ip,
        },
      });
    });

    return reply.send({ ok: true });
  });

  // Review currency transactions globally
  fastify.get("/api/admin/transactions", async (request, reply) => {
    requireRole(request, ["ADMIN", "MODERATOR"]);
    const q = request.query as { limit?: string; source?: string };
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 50));

    const transactions = await prisma.currencyTransaction.findMany({
      where: q.source ? { source: q.source } : {},
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        user: { select: { id: true, username: true } },
      },
    });

    return reply.send({ transactions });
  });

  // Cosmetics catalog admin management
  fastify.get("/api/admin/cosmetics", async (request, reply) => {
    requireRole(request, ["ADMIN"]);
    const items = await prisma.cosmeticItem.findMany({
      include: { assets: true },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
    });
    return reply.send({ items });
  });

  fastify.post("/api/admin/cosmetics", async (request, reply) => {
    const auth = requireRole(request, ["ADMIN"]);
    const body = adminCosmeticUpsertSchema.parse(request.body);

    const item = await prisma.$transaction(async (tx) => {
      const saved = await tx.cosmeticItem.upsert({
        where: { slug: body.slug },
        update: {
          name: body.name,
          description: body.description,
          category: body.category,
          rarity: body.rarity,
          price: body.price,
          isAvailable: body.isAvailable,
          requiredLevel: body.requiredLevel,
          unlockRequirementDesc: body.unlockRequirementDesc ?? null,
          ...(body.metadata ? { metadata: body.metadata as Prisma.InputJsonValue } : {}),
        },
        create: {
          slug: body.slug,
          name: body.name,
          description: body.description,
          category: body.category,
          rarity: body.rarity,
          price: body.price,
          isAvailable: body.isAvailable,
          requiredLevel: body.requiredLevel,
          unlockRequirementDesc: body.unlockRequirementDesc ?? null,
          metadata: (body.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });

      if (body.previewUrl) {
        await tx.cosmeticAsset.upsert({
          where: { cosmeticItemId_assetRole: { cosmeticItemId: saved.id, assetRole: "preview" } },
          update: { url: body.previewUrl },
          create: { cosmeticItemId: saved.id, assetRole: "preview", url: body.previewUrl },
        });
      }
      if (body.assetUrl) {
        await tx.cosmeticAsset.upsert({
          where: { cosmeticItemId_assetRole: { cosmeticItemId: saved.id, assetRole: "spritesheet" } },
          update: { url: body.assetUrl },
          create: { cosmeticItemId: saved.id, assetRole: "spritesheet", url: body.assetUrl },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: auth.user.id,
          action: "ADMIN_COSMETIC_UPSERT",
          entityType: "CosmeticItem",
          entityId: saved.id,
          details: { slug: saved.slug, price: saved.price, isAvailable: saved.isAvailable },
          ipAddress: request.ip,
        },
      });

      return saved;
    });

    return reply.status(201).send({ item });
  });

  // Daily Challenges admin management
  fastify.get("/api/admin/daily-challenges", async (request, reply) => {
    requireRole(request, ["ADMIN", "MODERATOR"]);
    const challenges = await prisma.dailyChallenge.findMany({
      orderBy: { challengeDate: "desc" },
      take: 30,
    });
    return reply.send({ challenges });
  });

  fastify.post("/api/admin/daily-challenges", async (request, reply) => {
    const auth = requireRole(request, ["ADMIN"]);
    const body = adminDailyChallengeSchema.parse(request.body);

    const activeCfg = await prisma.gameConfiguration.findFirst({
      where: { modeSlug: "daily_challenge", isActive: true },
      orderBy: { version: "desc" },
    });
    if (!activeCfg) {
      throw badRequest("No active daily_challenge game configuration exists.");
    }

    const challenge = await prisma.dailyChallenge.upsert({
      where: { challengeDate: body.challengeDate },
      update: {
        seed: body.seed ?? deriveDailySeed(body.challengeDate),
        targetScore: body.targetScore,
        rewardCoins: body.rewardCoins,
        rewardXp: body.rewardXp,
        ...(body.sceneSlug ? { sceneSlug: body.sceneSlug } : {}),
        createdById: auth.user.id,
      },
      create: {
        challengeDate: body.challengeDate,
        seed: body.seed ?? deriveDailySeed(body.challengeDate),
        targetScore: body.targetScore,
        rewardCoins: body.rewardCoins,
        rewardXp: body.rewardXp,
        configVersion: activeCfg.version,
        sceneSlug: body.sceneSlug ?? "sunny-meadow",
        createdById: auth.user.id,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: auth.user.id,
        action: "ADMIN_DAILY_CHALLENGE_UPSERT",
        entityType: "DailyChallenge",
        entityId: challenge.id,
        details: { challengeDate: challenge.challengeDate, targetScore: challenge.targetScore },
        ipAddress: request.ip,
      },
    });

    return reply.status(201).send({ challenge });
  });

  // Missions CRUD
  fastify.get("/api/admin/missions", async (request, reply) => {
    requireRole(request, ["ADMIN"]);
    const missions = await prisma.mission.findMany({ orderBy: [{ cadence: "asc" }, { slug: "asc" }] });
    return reply.send({ missions });
  });

  fastify.post("/api/admin/missions", async (request, reply) => {
    const auth = requireRole(request, ["ADMIN"]);
    const body = adminMissionSchema.parse(request.body);
    const mission = await prisma.mission.upsert({
      where: { slug: body.slug },
      update: body,
      create: body,
    });
    await prisma.auditLog.create({
      data: {
        actorId: auth.user.id,
        action: "ADMIN_MISSION_UPSERT",
        entityType: "Mission",
        entityId: mission.id,
        details: { slug: mission.slug, isActive: mission.isActive },
        ipAddress: request.ip,
      },
    });
    return reply.status(201).send({ mission });
  });

  // Achievements CRUD
  fastify.get("/api/admin/achievements", async (request, reply) => {
    requireRole(request, ["ADMIN"]);
    const achievements = await prisma.achievement.findMany({ orderBy: { sortOrder: "asc" } });
    return reply.send({ achievements });
  });

  fastify.post("/api/admin/achievements", async (request, reply) => {
    const auth = requireRole(request, ["ADMIN"]);
    const body = adminAchievementSchema.parse(request.body);
    const achievement = await prisma.achievement.upsert({
      where: { slug: body.slug },
      update: {
        ...body,
        rewardTitle: body.rewardTitle ?? null,
      },
      create: {
        ...body,
        rewardTitle: body.rewardTitle ?? null,
      },
    });
    await prisma.auditLog.create({
      data: {
        actorId: auth.user.id,
        action: "ADMIN_ACHIEVEMENT_UPSERT",
        entityType: "Achievement",
        entityId: achievement.id,
        details: { slug: achievement.slug, rewardCoins: achievement.rewardCoins },
        ipAddress: request.ip,
      },
    });
    return reply.status(201).send({ achievement });
  });

  // Versioned Game Configurations (preserves historical versions so old sessions stay verifiable!)
  fastify.get("/api/admin/configurations", async (request, reply) => {
    requireRole(request, ["ADMIN"]);
    const configurations = await prisma.gameConfiguration.findMany({
      orderBy: { version: "desc" },
      take: 40,
    });
    return reply.send({ configurations });
  });

  fastify.post("/api/admin/configurations", async (request, reply) => {
    const auth = requireRole(request, ["ADMIN"]);
    const body = adminGameConfigSchema.parse(request.body);
    const modeSlug = body.modeSlug as GameModeSlug;

    const created = await prisma.$transaction(async (tx) => {
      const latest = await tx.gameConfiguration.findFirst({
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const nextVersion = (latest?.version ?? 0) + 1;

      await tx.gameConfiguration.updateMany({
        where: { modeSlug, isActive: true },
        data: { isActive: false },
      });

      const cfg = await tx.gameConfiguration.create({
        data: {
          version: nextVersion,
          modeSlug,
          physicsConfig: {
            ...DEFAULT_MODE_CONFIGS[modeSlug],
            ...body.physicsConfig,
          } as Prisma.InputJsonValue,
          economyConfig: {
            ...DEFAULT_ECONOMY_CONFIG,
            ...(body.economyConfig ?? {}),
          } as Prisma.InputJsonValue,
          antiCheatConfig: {
            ...DEFAULT_ANTICHEAT_CONFIG,
            ...(body.antiCheatConfig ?? {}),
          } as Prisma.InputJsonValue,
          isActive: true,
          createdById: auth.user.id,
          notes: body.notes ?? `Version ${nextVersion} update`,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: auth.user.id,
          action: "ADMIN_CONFIG_VERSION_CREATED",
          entityType: "GameConfiguration",
          entityId: cfg.id,
          details: { version: cfg.version, modeSlug, notes: cfg.notes },
          ipAddress: request.ip,
        },
      });

      return cfg;
    });

    return reply.status(201).send({ configuration: created });
  });

  // Audit logs
  fastify.get("/api/admin/audit-logs", async (request, reply) => {
    requireRole(request, ["ADMIN", "MODERATOR"]);
    const q = request.query as { limit?: string };
    const limit = Math.min(200, Math.max(1, Number(q.limit) || 50));

    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        actor: { select: { id: true, username: true, role: true } },
      },
    });

    return reply.send({ logs });
  });
}

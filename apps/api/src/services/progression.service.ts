import { prisma, Prisma } from "@skyhop/database";
import { calculateLevelProgress, getLevelReward, type GameModeSlug } from "@skyhop/shared";
import { creditCoinsTx } from "./economy.service.js";
import {
  getEndOfUtcDay,
  getEndOfUtcWeek,
  getUtcDateKey,
  getUtcIsoWeekKey,
} from "../utils/crypto.js";
import { badRequest, notFound } from "../utils/errors.js";

export interface LevelUpAwardResult {
  newTotalXp: number;
  newLevel: number;
  leveledUp: boolean;
  levelsGained: Array<{
    level: number;
    coins: number;
    title?: string;
    unlockCosmeticSlug?: string;
  }>;
  totalLevelCoins: number;
}

export async function awardXpAndHandleLevelUpsTx(
  tx: Prisma.TransactionClient,
  userId: string,
  xpToAdd: number
): Promise<LevelUpAwardResult> {
  const stats = await tx.playerStats.findUniqueOrThrow({ where: { userId } });
  const oldLevel = stats.level;
  const newTotalXp = stats.xp + Math.max(0, Math.round(xpToAdd));
  const progress = calculateLevelProgress(newTotalXp);
  const newLevel = progress.level;

  await tx.playerStats.update({
    where: { userId },
    data: {
      xp: newTotalXp,
      level: newLevel,
    },
  });

  const levelsGained: LevelUpAwardResult["levelsGained"] = [];
  let totalLevelCoins = 0;

  if (newLevel > oldLevel) {
    const profile = await tx.userProfile.findUnique({ where: { userId } });
    const unlockedTitles = new Set(profile?.unlockedTitles ?? []);

    for (let lvl = oldLevel + 1; lvl <= newLevel; lvl++) {
      const reward = getLevelReward(lvl);
      const coinRes = await creditCoinsTx(tx, {
        userId,
        amount: reward.coins,
        source: "LEVEL_UP",
        description: `Reached Player Level ${lvl}`,
        idempotencyKey: `level_up:${userId}:${lvl}`,
        metadata: { level: lvl },
      });
      if (coinRes.applied) {
        totalLevelCoins += reward.coins;
      }

      if (reward.title) {
        unlockedTitles.add(reward.title);
      }

      if (reward.unlockCosmeticSlug) {
        const cosmetic = await tx.cosmeticItem.findUnique({
          where: { slug: reward.unlockCosmeticSlug },
        });
        if (cosmetic) {
          await tx.userInventory.upsert({
            where: {
              userId_cosmeticItemId: { userId, cosmeticItemId: cosmetic.id },
            },
            update: {},
            create: {
              userId,
              cosmeticItemId: cosmetic.id,
              acquiredVia: `LEVEL_${lvl}`,
            },
          });
        }
      }

      levelsGained.push(reward);
    }

    if (profile) {
      await tx.userProfile.update({
        where: { userId },
        data: { unlockedTitles: Array.from(unlockedTitles) },
      });
    }
  }

  return {
    newTotalXp,
    newLevel,
    leveledUp: newLevel > oldLevel,
    levelsGained,
    totalLevelCoins,
  };
}

export async function evaluateUserAchievementsTx(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<Array<{ slug: string; name: string; rewardCoins: number }>> {
  const [stats, wallet, achievements, existingUA, birdCount, sceneCount, purchaseCount, friendsCount] =
    await Promise.all([
      tx.playerStats.findUniqueOrThrow({ where: { userId } }),
      tx.wallet.findUniqueOrThrow({ where: { userId } }),
      tx.achievement.findMany({ where: { isActive: true } }),
      tx.userAchievement.findMany({ where: { userId } }),
      tx.userInventory.count({
        where: { userId, cosmeticItem: { category: "BIRD_SKIN" } },
      }),
      tx.userInventory.count({
        where: { userId, cosmeticItem: { category: "SCENE" } },
      }),
      tx.purchase.count({ where: { userId } }),
      tx.friendship.count({
        where: { OR: [{ userAId: userId }, { userBId: userId }] },
      }),
    ]);

  const metrics: Record<string, number> = {
    total_games: stats.totalGames,
    highest_score: stats.highestScore,
    hardcore_high_score: stats.hardcoreHighScore,
    zen_high_score: stats.zenHighScore,
    total_obstacles: stats.totalObstaclesPassed,
    daily_challenges_completed: stats.dailyChallengesCompleted,
    comeback_achieved: stats.comebackAchieved,
    total_purchases: purchaseCount,
    owned_bird_skins: birdCount,
    owned_scenes: sceneCount,
    total_coins_earned: wallet.totalEarned,
    player_level: stats.level,
    friends_count: friendsCount,
  };

  const uaMap = new Map(existingUA.map((u) => [u.achievementId, u]));
  const newlyUnlocked: Array<{ slug: string; name: string; rewardCoins: number }> = [];
  const now = new Date();

  for (const ach of achievements) {
    const val = Math.min(ach.targetValue, metrics[ach.metricKey] ?? 0);
    const existing = uaMap.get(ach.id);
    const isNowUnlocked = val >= ach.targetValue;

    if (!existing) {
      if (val > 0 || isNowUnlocked) {
        await tx.userAchievement.create({
          data: {
            userId,
            achievementId: ach.id,
            progress: val,
            unlockedAt: isNowUnlocked ? now : null,
          },
        });
        if (isNowUnlocked) {
          newlyUnlocked.push({
            slug: ach.slug,
            name: ach.name,
            rewardCoins: ach.rewardCoins,
          });
        }
      }
    } else {
      const shouldUnlock = !existing.unlockedAt && isNowUnlocked;
      if (existing.progress !== val || shouldUnlock) {
        await tx.userAchievement.update({
          where: { id: existing.id },
          data: {
            progress: Math.max(existing.progress, val),
            unlockedAt: shouldUnlock ? now : existing.unlockedAt,
          },
        });
        if (shouldUnlock) {
          newlyUnlocked.push({
            slug: ach.slug,
            name: ach.name,
            rewardCoins: ach.rewardCoins,
          });
        }
      }
    }
  }

  return newlyUnlocked;
}

export async function claimAchievementReward(userId: string, achievementSlug: string) {
  return prisma.$transaction(async (tx) => {
    const achievement = await tx.achievement.findUnique({
      where: { slug: achievementSlug },
    });
    if (!achievement) {
      throw notFound("Achievement not found");
    }

    const ua = await tx.userAchievement.findUnique({
      where: {
        userId_achievementId: { userId, achievementId: achievement.id },
      },
    });
    if (!ua || !ua.unlockedAt) {
      throw badRequest("Achievement has not been unlocked yet.", "ACHIEVEMENT_NOT_UNLOCKED");
    }
    if (ua.claimedAt) {
      throw badRequest("Achievement reward has already been claimed.", "ALREADY_CLAIMED");
    }

    // Atomic conditional update prevents duplicate claim race conditions
    const claimUpdate = await tx.userAchievement.updateMany({
      where: {
        id: ua.id,
        claimedAt: null,
      },
      data: { claimedAt: new Date() },
    });
    if (claimUpdate.count === 0) {
      throw badRequest("Achievement reward has already been claimed.", "ALREADY_CLAIMED");
    }

    const coinRes = await creditCoinsTx(tx, {
      userId,
      amount: achievement.rewardCoins,
      source: "ACHIEVEMENT",
      description: `Achievement reward: ${achievement.name}`,
      idempotencyKey: `achievement:${userId}:${achievement.id}`,
      metadata: { achievementSlug: achievement.slug },
    });

    if (achievement.rewardTitle) {
      const profile = await tx.userProfile.findUnique({ where: { userId } });
      if (profile && !profile.unlockedTitles.includes(achievement.rewardTitle)) {
        await tx.userProfile.update({
          where: { userId },
          data: { unlockedTitles: [...profile.unlockedTitles, achievement.rewardTitle] },
        });
      }
    }

    const xpRes = await awardXpAndHandleLevelUpsTx(tx, userId, achievement.rewardXp);
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });

    return {
      achievementSlug: achievement.slug,
      coinsAwarded: achievement.rewardCoins,
      xpAwarded: achievement.rewardXp,
      rewardTitle: achievement.rewardTitle,
      newWalletBalance: wallet.balance,
      leveledUp: xpRes.leveledUp,
      newLevel: xpRes.newLevel,
      transactionId: coinRes.transactionId,
    };
  });
}

// ---------- Daily & Weekly Rotating Missions ----------

function pickDeterministicSubset<T>(items: T[], count: number, seedStr: string): T[] {
  if (items.length <= count) return items;
  let hash = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    hash ^= seedStr.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    hash = Math.imul(hash ^ (hash >>> 15), 0x85ebca6b) >>> 0;
    const j = hash % (i + 1);
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return copy.slice(0, count);
}

export async function ensureActiveMissionsForUserTx(
  tx: Prisma.TransactionClient,
  userId: string,
  now: Date = new Date()
) {
  const dailyPeriod = getUtcDateKey(now);
  const weeklyPeriod = getUtcIsoWeekKey(now);
  const dailyExpires = getEndOfUtcDay(now);
  const weeklyExpires = getEndOfUtcWeek(now);

  const allMissions = await tx.mission.findMany({ where: { isActive: true } });
  const dailyPool = allMissions.filter((m) => m.cadence === "DAILY");
  const weeklyPool = allMissions.filter((m) => m.cadence === "WEEKLY");

  const chosenDaily = pickDeterministicSubset(dailyPool, 3, `daily:${dailyPeriod}`);
  const chosenWeekly = pickDeterministicSubset(weeklyPool, 3, `weekly:${weeklyPeriod}`);

  const desired = [
    ...chosenDaily.map((m) => ({ mission: m, periodKey: dailyPeriod, expiresAt: dailyExpires })),
    ...chosenWeekly.map((m) => ({ mission: m, periodKey: weeklyPeriod, expiresAt: weeklyExpires })),
  ];

  for (const entry of desired) {
    await tx.userMission.upsert({
      where: {
        userId_missionId_periodKey: {
          userId,
          missionId: entry.mission.id,
          periodKey: entry.periodKey,
        },
      },
      update: {},
      create: {
        userId,
        missionId: entry.mission.id,
        periodKey: entry.periodKey,
        progress: 0,
        expiresAt: entry.expiresAt,
      },
    });
  }

  return tx.userMission.findMany({
    where: {
      userId,
      periodKey: { in: [dailyPeriod, weeklyPeriod] },
    },
    include: { mission: true },
    orderBy: [{ mission: { cadence: "asc" } }, { mission: { slug: "asc" } }],
  });
}

export async function updateMissionProgressFromGameTx(
  tx: Prisma.TransactionClient,
  params: {
    userId: string;
    modeSlug: GameModeSlug;
    verifiedScore: number;
    obstaclesPassed: number;
    gameplayCoinsEarned: number;
    dailyChallengeCompleted: boolean;
    equippedSceneSlug: string;
    now?: Date;
  }
): Promise<void> {
  const now = params.now ?? new Date();
  const activeMissions = await ensureActiveMissionsForUserTx(tx, params.userId, now);

  for (const um of activeMissions) {
    if (um.completedAt) continue;

    let nextProgress = um.progress;
    let nextMetadata = (um.metadata as Record<string, unknown> | null) ?? {};

    switch (um.mission.metricKey) {
      case "games_played":
        nextProgress += 1;
        break;
      case "obstacles_passed":
        nextProgress += params.obstaclesPassed;
        break;
      case "single_game_score":
        nextProgress = Math.max(nextProgress, params.verifiedScore);
        break;
      case "hardcore_single_score":
        if (params.modeSlug === "hardcore") {
          nextProgress = Math.max(nextProgress, params.verifiedScore);
        }
        break;
      case "daily_challenge_completed":
        if (params.dailyChallengeCompleted) {
          nextProgress += 1;
        }
        break;
      case "gameplay_coins_earned":
        nextProgress += params.gameplayCoinsEarned;
        break;
      case "distinct_scenes_played": {
        const scenes = new Set<string>(
          Array.isArray(nextMetadata.scenes) ? (nextMetadata.scenes as string[]) : []
        );
        scenes.add(params.equippedSceneSlug);
        nextMetadata = { ...nextMetadata, scenes: Array.from(scenes) };
        nextProgress = scenes.size;
        break;
      }
      default:
        break;
    }

    const capped = Math.min(um.mission.targetValue, nextProgress);
    const completedNow = capped >= um.mission.targetValue;

    if (capped !== um.progress || completedNow) {
      await tx.userMission.update({
        where: { id: um.id },
        data: {
          progress: capped,
          completedAt: completedNow ? now : null,
          metadata: nextMetadata as Prisma.InputJsonValue,
        },
      });
    }
  }
}

export async function claimMissionReward(userId: string, userMissionId: string) {
  return prisma.$transaction(async (tx) => {
    const um = await tx.userMission.findFirst({
      where: { id: userMissionId, userId },
      include: { mission: true },
    });
    if (!um) {
      throw notFound("Mission assignment not found");
    }
    if (!um.completedAt) {
      throw badRequest("Mission is not yet completed.", "MISSION_NOT_COMPLETED");
    }
    if (um.claimedAt) {
      throw badRequest("Mission reward has already been claimed.", "ALREADY_CLAIMED");
    }

    const updated = await tx.userMission.updateMany({
      where: { id: um.id, claimedAt: null },
      data: { claimedAt: new Date() },
    });
    if (updated.count === 0) {
      throw badRequest("Mission reward has already been claimed.", "ALREADY_CLAIMED");
    }

    const coinRes = await creditCoinsTx(tx, {
      userId,
      amount: um.mission.rewardCoins,
      source: "MISSION",
      description: `Mission completed: ${um.mission.name}`,
      idempotencyKey: `mission:${userId}:${um.id}`,
      metadata: { missionSlug: um.mission.slug, periodKey: um.periodKey },
    });

    const xpRes = await awardXpAndHandleLevelUpsTx(tx, userId, um.mission.rewardXp);
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });

    return {
      userMissionId: um.id,
      missionSlug: um.mission.slug,
      coinsAwarded: um.mission.rewardCoins,
      xpAwarded: um.mission.rewardXp,
      newWalletBalance: wallet.balance,
      leveledUp: xpRes.leveledUp,
      newLevel: xpRes.newLevel,
      transactionId: coinRes.transactionId,
    };
  });
}

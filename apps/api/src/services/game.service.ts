import { prisma, Prisma } from "@skyhop/database";
import { verifyReplay } from "@skyhop/game-core";
import {
  calculateSessionXp,
  DEFAULT_ANTICHEAT_CONFIG,
  DEFAULT_ECONOMY_CONFIG,
  DEFAULT_MODE_CONFIGS,
  type AntiCheatConfig,
  type EconomyConfig,
  type GameModeSlug,
  type ModePhysicsConfig,
  type SessionRewardSummaryDTO,
} from "@skyhop/shared";
import {
  deriveDailySeed,
  generateSecureToken,
  getEndOfUtcDay,
  getUtcDateKey,
} from "../utils/crypto.js";
import { badRequest, conflict, forbidden, notFound } from "../utils/errors.js";
import { creditCoinsTx } from "./economy.service.js";
import {
  awardXpAndHandleLevelUpsTx,
  evaluateUserAchievementsTx,
  updateMissionProgressFromGameTx,
} from "./progression.service.js";

export async function getActiveGameConfig(modeSlug: GameModeSlug) {
  const cfg = await prisma.gameConfiguration.findFirst({
    where: { modeSlug, isActive: true },
    orderBy: { version: "desc" },
  });
  if (!cfg) {
    throw notFound(`No active configuration found for mode ${modeSlug}`);
  }
  return {
    version: cfg.version,
    physicsConfig: {
      ...DEFAULT_MODE_CONFIGS[modeSlug],
      ...(cfg.physicsConfig as Partial<ModePhysicsConfig>),
    },
    economyConfig: {
      ...DEFAULT_ECONOMY_CONFIG,
      ...(cfg.economyConfig as Partial<EconomyConfig>),
    },
    antiCheatConfig: {
      ...DEFAULT_ANTICHEAT_CONFIG,
      ...(cfg.antiCheatConfig as Partial<AntiCheatConfig>),
    },
  };
}

export async function getOrCreateTodayDailyChallenge() {
  const today = getUtcDateKey();
  let daily = await prisma.dailyChallenge.findUnique({
    where: { challengeDate: today },
  });

  if (!daily) {
    const activeDailyCfg = await getActiveGameConfig("daily_challenge");
    const sceneSlugs = [
      "sunny-meadow",
      "sunset-valley",
      "midnight-city",
      "desert-ruins",
      "rainy-forest",
      "snowy-mountains",
      "japanese-garden",
      "underwater-world",
    ];
    const dayIndex = Math.floor(Date.now() / 86400000) % sceneSlugs.length;

    daily = await prisma.dailyChallenge.upsert({
      where: { challengeDate: today },
      update: {},
      create: {
        challengeDate: today,
        seed: deriveDailySeed(today),
        targetScore: DEFAULT_ECONOMY_CONFIG.dailyChallengeTargetScore,
        rewardCoins: DEFAULT_ECONOMY_CONFIG.dailyChallengeCompletionCoins,
        rewardXp: 50,
        configVersion: activeDailyCfg.version,
        sceneSlug: sceneSlugs[dayIndex] ?? "sunny-meadow",
      },
    });
  }

  const nextResetAt = getEndOfUtcDay();
  return {
    ...daily,
    nextResetAt: nextResetAt.toISOString(),
    msUntilReset: Math.max(0, nextResetAt.getTime() - Date.now()),
  };
}

export async function startGameSession(params: {
  userId: string;
  modeSlug: GameModeSlug;
  ipAddress?: string;
  userAgent?: string;
}) {
  const mode = await prisma.gameMode.findUnique({
    where: { slug: params.modeSlug },
  });
  if (!mode || !mode.isActive) {
    throw badRequest("Selected game mode is currently unavailable.");
  }

  let seed: string;
  let configVersion: number;
  let physicsConfig: ModePhysicsConfig;
  let dailyChallengeId: string | null = null;
  let dailyChallengeMeta: { targetScore: number; challengeDate: string; sceneSlug: string } | null = null;
  let sessionTtlMinutes = DEFAULT_ANTICHEAT_CONFIG.sessionTtlMinutes;

  if (params.modeSlug === "daily_challenge") {
    const daily = await getOrCreateTodayDailyChallenge();
    const cfgRecord = await prisma.gameConfiguration.findUniqueOrThrow({
      where: { version: daily.configVersion },
    });
    seed = daily.seed;
    configVersion = daily.configVersion;
    physicsConfig = {
      ...DEFAULT_MODE_CONFIGS.daily_challenge,
      ...(cfgRecord.physicsConfig as Partial<ModePhysicsConfig>),
    };
    const acCfg = {
      ...DEFAULT_ANTICHEAT_CONFIG,
      ...(cfgRecord.antiCheatConfig as Partial<AntiCheatConfig>),
    };
    sessionTtlMinutes = acCfg.sessionTtlMinutes;
    dailyChallengeId = daily.id;
    dailyChallengeMeta = {
      targetScore: daily.targetScore,
      challengeDate: daily.challengeDate,
      sceneSlug: daily.sceneSlug,
    };
  } else {
    const activeCfg = await getActiveGameConfig(params.modeSlug);
    seed = generateSecureToken(12);
    configVersion = activeCfg.version;
    physicsConfig = activeCfg.physicsConfig;
    sessionTtlMinutes = activeCfg.antiCheatConfig.sessionTtlMinutes;
  }

  const expiresAt = new Date(Date.now() + sessionTtlMinutes * 60 * 1000);

  const session = await prisma.gameSession.create({
    data: {
      userId: params.userId,
      modeSlug: params.modeSlug,
      configVersion,
      dailyChallengeId,
      seed,
      status: "ACTIVE",
      expiresAt,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    },
  });

  return {
    sessionId: session.id,
    modeSlug: params.modeSlug,
    seed: session.seed,
    configVersion: session.configVersion,
    physicsConfig,
    expiresAt: session.expiresAt.toISOString(),
    dailyChallenge: dailyChallengeMeta,
  };
}

export async function submitGameSession(params: {
  userId: string;
  sessionId: string;
  flapTicks: number[];
  totalTicks: number;
  clientClaimedScore?: number;
  pauseDurationMs?: number;
  ipAddress?: string;
}): Promise<SessionRewardSummaryDTO> {
  const session = await prisma.gameSession.findUnique({
    where: { id: params.sessionId },
    include: {
      configuration: true,
      dailyChallenge: true,
    },
  });

  if (!session) {
    throw notFound("Game session not found.", "SESSION_NOT_FOUND");
  }
  if (session.userId !== params.userId) {
    throw forbidden("Session does not belong to current user.", "SESSION_OWNERSHIP_MISMATCH");
  }
  if (session.status !== "ACTIVE") {
    throw conflict("Game session has already been completed or invalidated.", "DUPLICATE_SESSION_SUBMISSION");
  }
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.gameSession.update({
      where: { id: session.id },
      data: { status: "EXPIRED" },
    });
    throw badRequest("Game session has expired.", "SESSION_EXPIRED");
  }

  const modeSlug = session.modeSlug as GameModeSlug;
  const physicsConfig: ModePhysicsConfig = {
    ...DEFAULT_MODE_CONFIGS[modeSlug],
    ...(session.configuration.physicsConfig as Partial<ModePhysicsConfig>),
  };
  const economyConfig: EconomyConfig = {
    ...DEFAULT_ECONOMY_CONFIG,
    ...(session.configuration.economyConfig as Partial<EconomyConfig>),
  };
  const antiCheatConfig: AntiCheatConfig = {
    ...DEFAULT_ANTICHEAT_CONFIG,
    ...(session.configuration.antiCheatConfig as Partial<AntiCheatConfig>),
  };

  const wallClockElapsedMs = Math.max(0, Date.now() - session.startedAt.getTime());

  // Re-simulate gameplay deterministically on the backend
  const verification = verifyReplay({
    seed: session.seed,
    physicsConfig,
    antiCheatConfig,
    flapTicks: params.flapTicks,
    totalTicks: params.totalTicks,
    clientClaimedScore: params.clientClaimedScore,
    wallClockElapsedMs,
    pauseDurationMs: params.pauseDurationMs,
  });

  if (!verification.valid) {
    await prisma.$transaction(async (tx) => {
      await tx.gameSession.update({
        where: { id: session.id },
        data: { status: "REJECTED", completedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: params.userId,
          action: "SUSPICIOUS_REPLAY_REJECTED",
          entityType: "GameSession",
          entityId: session.id,
          details: {
            rejectReason: verification.rejectReason,
            flagReasons: verification.flagReasons,
            clientClaimedScore: params.clientClaimedScore,
            wallClockElapsedMs,
            totalTicks: params.totalTicks,
            flapCount: params.flapTicks.length,
          },
          ipAddress: params.ipAddress,
        },
      });
    });

    throw badRequest(
      `Replay verification failed: ${verification.rejectReason}`,
      "INVALID_REPLAY"
    );
  }

  // Persist verified result, stats, economy rewards, progression, achievements & missions atomically
  return prisma.$transaction(async (tx) => {
    // Atomic claim of ACTIVE session (guards against parallel duplicate POSTs!)
    const claimed = await tx.gameSession.updateMany({
      where: { id: session.id, status: "ACTIVE" },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw conflict("Game session has already been submitted.", "DUPLICATE_SESSION_SUBMISSION");
    }

    const [stats, equipped] = await Promise.all([
      tx.playerStats.findUniqueOrThrow({ where: { userId: params.userId } }),
      tx.equippedCosmetics.findUnique({ where: { userId: params.userId } }),
    ]);

    const todayUtc = getUtcDateKey();
    const score = verification.verifiedScore;
    const obstaclesPassed = verification.obstaclesPassed;
    const durationMs = verification.durationMs;

    // Previous best for this mode
    const prevModeBest =
      modeSlug === "classic"
        ? stats.classicHighScore
        : modeSlug === "hardcore"
          ? stats.hardcoreHighScore
          : modeSlug === "zen"
            ? stats.zenHighScore
            : stats.dailyHighScore;

    const isPersonalRecord = score > 0 && score > prevModeBest;
    const isComeback = isPersonalRecord && stats.consecutiveFailsSincePr >= 10 && modeSlug !== "zen";

    // Economy calculations (strictly backend-controlled + abuse limits)
    let obstacleCoins = 0;
    const rawObstacleCoins = Math.floor(obstaclesPassed / economyConfig.obstaclesPerCoin);
    if (rawObstacleCoins > 0) {
      const todayStart = new Date(`${todayUtc}T00:00:00.000Z`);
      const todayEarnedAgg = await tx.currencyTransaction.aggregate({
        where: {
          userId: params.userId,
          source: "GAMEPLAY_OBSTACLES",
          createdAt: { gte: todayStart },
        },
        _sum: { amount: true },
      });
      const alreadyEarnedToday = todayEarnedAgg._sum.amount ?? 0;
      const remainingCap = Math.max(0, economyConfig.dailyObstacleCoinCap - alreadyEarnedToday);
      obstacleCoins = Math.min(rawObstacleCoins, remainingCap);
    }

    // First game of the day (requires valid effort: >= minScore OR >= minDurationMs)
    const eligibleFirstGame =
      stats.lastFirstGameRewardUtc !== todayUtc &&
      (score >= economyConfig.minFirstGameScore || durationMs >= economyConfig.minFirstGameDurationMs);
    let firstGameCoins = 0;
    if (eligibleFirstGame) {
      const res = await creditCoinsTx(tx, {
        userId: params.userId,
        amount: economyConfig.firstGameOfDayCoins,
        source: "FIRST_GAME_OF_DAY",
        description: `First game of the day (${todayUtc})`,
        idempotencyKey: `first_game:${params.userId}:${todayUtc}`,
      });
      if (res.applied) firstGameCoins = economyConfig.firstGameOfDayCoins;
    }

    if (obstacleCoins > 0) {
      await creditCoinsTx(tx, {
        userId: params.userId,
        amount: obstacleCoins,
        source: "GAMEPLAY_OBSTACLES",
        description: `Passed ${obstaclesPassed} obstacles in ${modeSlug}`,
        idempotencyKey: `session_obstacles:${session.id}`,
        metadata: { sessionId: session.id, obstaclesPassed, modeSlug },
      });
    }

    // New personal record bonus (competitive modes only, score >= minScoreForPrBonus, daily cap)
    let prCoins = 0;
    if (isPersonalRecord && modeSlug !== "zen" && score >= economyConfig.minScoreForPrBonus) {
      const todayStart = new Date(`${todayUtc}T00:00:00.000Z`);
      const prCountToday = await tx.currencyTransaction.count({
        where: {
          userId: params.userId,
          source: "PERSONAL_RECORD",
          createdAt: { gte: todayStart },
        },
      });
      if (prCountToday < economyConfig.maxPrBonusesPerDayPerMode) {
        const res = await creditCoinsTx(tx, {
          userId: params.userId,
          amount: economyConfig.newPersonalRecordCoins,
          source: "PERSONAL_RECORD",
          description: `New ${modeSlug} personal record (${score})`,
          idempotencyKey: `session_pr:${session.id}`,
          metadata: { sessionId: session.id, modeSlug, score, previousBest: prevModeBest },
        });
        if (res.applied) prCoins = economyConfig.newPersonalRecordCoins;
      }
    }

    // Daily challenge completion reward (once per UTC day)
    let dailyChallengeCompleted = false;
    let dailyChallengeCoins = 0;
    if (
      modeSlug === "daily_challenge" &&
      session.dailyChallenge &&
      score >= session.dailyChallenge.targetScore
    ) {
      const res = await creditCoinsTx(tx, {
        userId: params.userId,
        amount: session.dailyChallenge.rewardCoins,
        source: "DAILY_CHALLENGE",
        description: `Completed Daily Challenge (${session.dailyChallenge.challengeDate})`,
        idempotencyKey: `daily_challenge:${params.userId}:${session.dailyChallenge.challengeDate}`,
        metadata: { dailyChallengeId: session.dailyChallenge.id, score },
      });
      if (res.applied) {
        dailyChallengeCompleted = true;
        dailyChallengeCoins = session.dailyChallenge.rewardCoins;
      }
    }

    // Update PlayerStats (note: Zen mode NEVER updates competitive highestScore)
    const nextClassicBest =
      modeSlug === "classic" ? Math.max(stats.classicHighScore, score) : stats.classicHighScore;
    const nextHardcoreBest =
      modeSlug === "hardcore" ? Math.max(stats.hardcoreHighScore, score) : stats.hardcoreHighScore;
    const nextZenBest = modeSlug === "zen" ? Math.max(stats.zenHighScore, score) : stats.zenHighScore;
    const nextDailyBest =
      modeSlug === "daily_challenge" ? Math.max(stats.dailyHighScore, score) : stats.dailyHighScore;
    const nextRankedHighest =
      modeSlug === "zen" ? stats.highestScore : Math.max(stats.highestScore, score);

    await tx.playerStats.update({
      where: { userId: params.userId },
      data: {
        totalGames: { increment: 1 },
        classicHighScore: nextClassicBest,
        hardcoreHighScore: nextHardcoreBest,
        zenHighScore: nextZenBest,
        dailyHighScore: nextDailyBest,
        highestScore: nextRankedHighest,
        totalScore: { increment: score },
        totalObstaclesPassed: { increment: obstaclesPassed },
        totalPlaytimeMs: { increment: BigInt(durationMs) },
        consecutiveFailsSincePr: isPersonalRecord ? 0 : { increment: 1 },
        comebackAchieved: isComeback ? { increment: 1 } : undefined,
        dailyChallengesCompleted: dailyChallengeCompleted ? { increment: 1 } : undefined,
        lastPlayedDateUtc: todayUtc,
        lastFirstGameRewardUtc: eligibleFirstGame ? todayUtc : stats.lastFirstGameRewardUtc,
      },
    });

    // XP & level-ups
    const xpAwarded = calculateSessionXp({
      score,
      durationMs,
      mode: modeSlug,
      isDailyChallengeCompleted: dailyChallengeCompleted,
      isPersonalRecord: isPersonalRecord && modeSlug !== "zen",
    });
    const xpRes = await awardXpAndHandleLevelUpsTx(tx, params.userId, xpAwarded);

    const gameplayCoinsTotal = obstacleCoins + firstGameCoins + prCoins + dailyChallengeCoins;
    const grandTotalCoins = gameplayCoinsTotal + xpRes.totalLevelCoins;

    const equippedBirdSlug = equipped?.birdSkinSlug ?? "classic-sparrow";
    const equippedSceneSlug = equipped?.sceneSlug ?? "sunny-meadow";

    // Create authoritative GameResult record
    const result = await tx.gameResult.create({
      data: {
        sessionId: session.id,
        userId: params.userId,
        modeSlug,
        dailyChallengeId: session.dailyChallengeId,
        verifiedScore: score,
        clientClaimedScore: params.clientClaimedScore ?? null,
        obstaclesPassed,
        durationMs,
        totalTicks: verification.totalTicks,
        flapCount: verification.flapCount,
        replayPayload: {
          seed: session.seed,
          configVersion: session.configVersion,
          flapTicks: params.flapTicks,
          totalTicks: verification.totalTicks,
        } as Prisma.InputJsonValue,
        deathReason: verification.deathReason,
        isVerified: true,
        isFlagged: verification.flagged,
        flagReason: verification.flagReasons.length > 0 ? verification.flagReasons.join(", ") : null,
        equippedBirdSlug,
        equippedSceneSlug,
        coinsAwarded: grandTotalCoins,
        xpAwarded,
        isPersonalRecord,
      },
    });

    if (verification.flagged) {
      await tx.auditLog.create({
        data: {
          actorId: params.userId,
          action: "GAME_RESULT_FLAGGED",
          entityType: "GameResult",
          entityId: result.id,
          details: {
            flagReasons: verification.flagReasons,
            verifiedScore: score,
            clientClaimedScore: params.clientClaimedScore,
            modeSlug,
          },
          ipAddress: params.ipAddress,
        },
      });
    }

    // Update missions & achievements from verified gameplay
    await updateMissionProgressFromGameTx(tx, {
      userId: params.userId,
      modeSlug,
      verifiedScore: score,
      obstaclesPassed,
      gameplayCoinsEarned: gameplayCoinsTotal,
      dailyChallengeCompleted,
      equippedSceneSlug,
    });

    const newlyUnlockedAchievements = await evaluateUserAchievementsTx(tx, params.userId);
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: params.userId } });

    return {
      resultId: result.id,
      verifiedScore: score,
      obstaclesPassed,
      durationMs,
      isPersonalRecord,
      previousBest: prevModeBest,
      coinsBreakdown: {
        obstacles: obstacleCoins,
        firstGameOfDay: firstGameCoins,
        personalRecord: prCoins,
        dailyChallenge: dailyChallengeCoins,
        levelUps: xpRes.totalLevelCoins,
        total: grandTotalCoins,
      },
      xpAwarded,
      newTotalXp: xpRes.newTotalXp,
      newLevel: xpRes.newLevel,
      leveledUp: xpRes.leveledUp,
      levelsGained: xpRes.levelsGained,
      newWalletBalance: wallet.balance,
      newlyUnlockedAchievements,
      dailyChallengeCompleted,
      flagged: verification.flagged,
      flagReason: result.flagReason,
    };
  });
}

import { prisma } from "@skyhop/database";
import { calculateLevelProgress, type AuthUserDTO } from "@skyhop/shared";
import { notFound } from "../utils/errors.js";

export async function buildAuthUserDTO(userId: string): Promise<AuthUserDTO> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      stats: true,
      wallet: true,
      settings: true,
      equippedCosmetics: true,
    },
  });

  if (!user || user.deletedAt) {
    throw notFound("User account not found");
  }

  const totalXp = user.stats?.xp ?? 0;
  const lvl = calculateLevelProgress(totalXp);

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    status: user.status,
    emailVerified: Boolean(user.emailVerifiedAt),
    createdAt: user.createdAt.toISOString(),
    walletBalance: user.wallet?.balance ?? 0,
    level: lvl.level,
    xp: totalXp,
    currentLevelXp: lvl.currentLevelXp,
    nextLevelXp: lvl.nextLevelXp,
    levelProgressPercent: lvl.progressPercent,
    profile: {
      displayName: user.profile?.displayName ?? user.username,
      bio: user.profile?.bio ?? "",
      title: user.profile?.title ?? null,
      isPublic: user.profile?.isPublic ?? true,
      showStats: user.profile?.showStats ?? true,
      showCosmetics: user.profile?.showCosmetics ?? true,
      showFriends: user.profile?.showFriends ?? true,
    },
    equipped: {
      birdSkin: user.equippedCosmetics?.birdSkinSlug ?? "classic-sparrow",
      scene: user.equippedCosmetics?.sceneSlug ?? "sunny-meadow",
      obstacleSkin: user.equippedCosmetics?.obstacleSkinSlug ?? "obstacle-scene-default",
      groundTexture: user.equippedCosmetics?.groundTextureSlug ?? "ground-scene-default",
      particleTrail: user.equippedCosmetics?.particleTrailSlug ?? "trail-classic",
      flapEffect: user.equippedCosmetics?.flapEffectSlug ?? "flap-classic",
      gameOverEffect: user.equippedCosmetics?.gameOverEffectSlug ?? "gameover-classic",
      avatar: user.equippedCosmetics?.avatarSlug ?? "avatar-sparrow-pilot",
      frame: user.equippedCosmetics?.frameSlug ?? "frame-classic-brass",
    },
    settings: {
      masterVolume: user.settings?.masterVolume ?? 0.8,
      musicVolume: user.settings?.musicVolume ?? 0.55,
      sfxVolume: user.settings?.sfxVolume ?? 0.85,
      ambientVolume: user.settings?.ambientVolume ?? 0.5,
      reducedMotion: user.settings?.reducedMotion ?? false,
      highContrast: user.settings?.highContrast ?? false,
      screenShake: user.settings?.screenShake ?? true,
      vibration: user.settings?.vibration ?? true,
      flapKey: user.settings?.flapKey ?? "Space",
      pauseKey: user.settings?.pauseKey ?? "Escape",
      showFps: user.settings?.showFps ?? false,
    },
    unlockedTitles: user.profile?.unlockedTitles ?? [],
  };
}

export async function getPlayerGlobalRank(userId: string): Promise<number | null> {
  const stats = await prisma.playerStats.findUnique({
    where: { userId },
    select: { classicHighScore: true, user: { select: { createdAt: true, status: true } } },
  });
  if (!stats || stats.classicHighScore <= 0 || stats.user.status === "BANNED") {
    return null;
  }

  const betterCount = await prisma.playerStats.count({
    where: {
      user: { status: { not: "BANNED" }, deletedAt: null },
      OR: [
        { classicHighScore: { gt: stats.classicHighScore } },
        {
          classicHighScore: stats.classicHighScore,
          user: { createdAt: { lt: stats.user.createdAt } },
        },
      ],
    },
  });

  return betterCount + 1;
}

export async function getFullPlayerProfile(targetUserId: string, viewerUserId: string | null) {
  const isOwner = viewerUserId === targetUserId;

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    include: {
      profile: true,
      stats: true,
      wallet: true,
      equippedCosmetics: true,
      inventory: {
        include: {
          cosmeticItem: {
            include: { assets: true },
          },
        },
        orderBy: { acquiredAt: "desc" },
      },
      achievements: {
        where: { unlockedAt: { not: null } },
        include: { achievement: true },
        orderBy: { unlockedAt: "desc" },
      },
    },
  });

  if (!user || user.deletedAt) {
    throw notFound("Player not found");
  }

  const profile = user.profile;
  if (!isOwner && profile && !profile.isPublic) {
    return {
      isPrivate: true,
      username: user.username,
      displayName: profile.displayName,
      avatarSlug: user.equippedCosmetics?.avatarSlug ?? "avatar-sparrow-pilot",
      frameSlug: user.equippedCosmetics?.frameSlug ?? "frame-classic-brass",
      title: profile.title,
      createdAt: user.createdAt.toISOString(),
    };
  }

  const stats = user.stats;
  const lvl = calculateLevelProgress(stats?.xp ?? 0);
  const globalRank = await getPlayerGlobalRank(user.id);
  const averageScore =
    stats && stats.totalGames > 0 ? Number((stats.totalScore / stats.totalGames).toFixed(1)) : 0;

  const canSeeStats = isOwner || (profile?.showStats ?? true);
  const canSeeCosmetics = isOwner || (profile?.showCosmetics ?? true);

  return {
    isPrivate: false,
    id: user.id,
    username: user.username,
    displayName: profile?.displayName ?? user.username,
    bio: profile?.bio ?? "",
    title: profile?.title ?? null,
    createdAt: user.createdAt.toISOString(),
    equipped: {
      birdSkin: user.equippedCosmetics?.birdSkinSlug ?? "classic-sparrow",
      scene: user.equippedCosmetics?.sceneSlug ?? "sunny-meadow",
      obstacleSkin: user.equippedCosmetics?.obstacleSkinSlug ?? "obstacle-scene-default",
      groundTexture: user.equippedCosmetics?.groundTextureSlug ?? "ground-scene-default",
      particleTrail: user.equippedCosmetics?.particleTrailSlug ?? "trail-classic",
      flapEffect: user.equippedCosmetics?.flapEffectSlug ?? "flap-classic",
      gameOverEffect: user.equippedCosmetics?.gameOverEffectSlug ?? "gameover-classic",
      avatar: user.equippedCosmetics?.avatarSlug ?? "avatar-sparrow-pilot",
      frame: user.equippedCosmetics?.frameSlug ?? "frame-classic-brass",
    },
    progression: {
      level: lvl.level,
      xp: stats?.xp ?? 0,
      currentLevelXp: lvl.currentLevelXp,
      nextLevelXp: lvl.nextLevelXp,
      progressPercent: lvl.progressPercent,
    },
    stats: canSeeStats
      ? {
          totalGames: stats?.totalGames ?? 0,
          highestScore: stats?.highestScore ?? 0,
          classicHighScore: stats?.classicHighScore ?? 0,
          hardcoreHighScore: stats?.hardcoreHighScore ?? 0,
          zenHighScore: stats?.zenHighScore ?? 0,
          dailyHighScore: stats?.dailyHighScore ?? 0,
          averageScore,
          totalObstaclesPassed: stats?.totalObstaclesPassed ?? 0,
          totalPlaytimeMs: Number(stats?.totalPlaytimeMs ?? 0n),
          dailyChallengesCompleted: stats?.dailyChallengesCompleted ?? 0,
          globalRank,
          coinsEarned: user.wallet?.totalEarned ?? 0,
          coinsSpent: user.wallet?.totalSpent ?? 0,
        }
      : null,
    privateInfo: isOwner
      ? {
          email: user.email,
          emailVerified: Boolean(user.emailVerifiedAt),
          walletBalance: user.wallet?.balance ?? 0,
          privacy: {
            isPublic: profile?.isPublic ?? true,
            showStats: profile?.showStats ?? true,
            showCosmetics: profile?.showCosmetics ?? true,
            showFriends: profile?.showFriends ?? true,
          },
          unlockedTitles: profile?.unlockedTitles ?? [],
        }
      : null,
    achievements: user.achievements.map((ua) => ({
      slug: ua.achievement.slug,
      name: ua.achievement.name,
      description: ua.achievement.description,
      category: ua.achievement.category,
      iconKey: ua.achievement.iconKey,
      unlockedAt: ua.unlockedAt?.toISOString() ?? null,
    })),
    unlockedCosmetics: canSeeCosmetics
      ? user.inventory.map((inv) => ({
          slug: inv.cosmeticItem.slug,
          name: inv.cosmeticItem.name,
          category: inv.cosmeticItem.category,
          rarity: inv.cosmeticItem.rarity,
          previewUrl:
            inv.cosmeticItem.assets.find((a) => a.assetRole === "preview")?.url ??
            inv.cosmeticItem.assets[0]?.url ??
            "",
          acquiredAt: inv.acquiredAt.toISOString(),
        }))
      : [],
  };
}

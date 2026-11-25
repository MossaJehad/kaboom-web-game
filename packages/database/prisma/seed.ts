import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  ACHIEVEMENTS_CATALOG,
  ALL_COSMETICS_CATALOG,
  DEFAULT_ANTICHEAT_CONFIG,
  DEFAULT_ECONOMY_CONFIG,
  DEFAULT_MODE_CONFIGS,
  MISSIONS_CATALOG,
  type GameModeSlug,
} from "@skyhop/shared";

const prisma = new PrismaClient();

function hashPasswordScrypt(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt:16384:8:1:${salt}:${derived.toString("hex")}`;
}

function getTodayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function deriveDailySeed(dateStr: string): string {
  return crypto
    .createHash("sha256")
    .update(`skyhop-daily-challenge:${dateStr}`)
    .digest("hex")
    .slice(0, 24);
}

export async function seedDatabase(client: PrismaClient = prisma): Promise<void> {
  // 1. Seed Game Modes
  const modes: Array<{
    slug: GameModeSlug;
    name: string;
    description: string;
    isRanked: boolean;
    allowPause: boolean;
    sortOrder: number;
  }> = [
    {
      slug: "classic",
      name: "Classic",
      description: "Traditional endless arcade flight with steady difficulty escalation.",
      isRanked: true,
      allowPause: true,
      sortOrder: 1,
    },
    {
      slug: "hardcore",
      name: "Hardcore",
      description: "Narrow gaps, high speed, no pausing. Built for true arcade veterans.",
      isRanked: true,
      allowPause: false,
      sortOrder: 2,
    },
    {
      slug: "zen",
      name: "Zen",
      description: "Relaxed pace and wide gaps for stress-free practice. Unranked.",
      isRanked: false,
      allowPause: true,
      sortOrder: 3,
    },
    {
      slug: "daily_challenge",
      name: "Daily Challenge",
      description: "One deterministic obstacle course shared by all flyers every 24 hours.",
      isRanked: true,
      allowPause: false,
      sortOrder: 4,
    },
  ];

  for (const mode of modes) {
    await client.gameMode.upsert({
      where: { slug: mode.slug },
      update: {
        name: mode.name,
        description: mode.description,
        isRanked: mode.isRanked,
        allowPause: mode.allowPause,
        sortOrder: mode.sortOrder,
        isActive: true,
      },
      create: mode,
    });
  }

  // 2. Seed Versioned Game Configurations (versions 1..4)
  const configSeeds: Array<{ version: number; modeSlug: GameModeSlug }> = [
    { version: 1, modeSlug: "classic" },
    { version: 2, modeSlug: "hardcore" },
    { version: 3, modeSlug: "zen" },
    { version: 4, modeSlug: "daily_challenge" },
  ];

  for (const cfg of configSeeds) {
    await client.gameConfiguration.upsert({
      where: { version: cfg.version },
      update: {},
      create: {
        version: cfg.version,
        modeSlug: cfg.modeSlug,
        physicsConfig: DEFAULT_MODE_CONFIGS[cfg.modeSlug] as unknown as object,
        economyConfig: DEFAULT_ECONOMY_CONFIG as unknown as object,
        antiCheatConfig: DEFAULT_ANTICHEAT_CONFIG as unknown as object,
        isActive: true,
        notes: `Initial ${cfg.modeSlug} balanced arcade configuration`,
      },
    });
  }

  // 3. Seed Today's Daily Challenge
  const today = getTodayUtcDate();
  await client.dailyChallenge.upsert({
    where: { challengeDate: today },
    update: {},
    create: {
      challengeDate: today,
      seed: deriveDailySeed(today),
      targetScore: DEFAULT_ECONOMY_CONFIG.dailyChallengeTargetScore,
      rewardCoins: DEFAULT_ECONOMY_CONFIG.dailyChallengeCompletionCoins,
      rewardXp: 50,
      configVersion: 4,
      sceneSlug: "sunny-meadow",
    },
  });

  // 4. Seed Cosmetics & Assets
  for (const item of ALL_COSMETICS_CATALOG) {
    const saved = await client.cosmeticItem.upsert({
      where: { slug: item.slug },
      update: {
        name: item.name,
        description: item.description,
        category: item.category,
        rarity: item.rarity,
        price: item.price,
        isDefault: item.isDefault,
        requiredLevel: item.requiredLevel,
        unlockRequirementDesc: item.unlockRequirementDesc ?? null,
        metadata: item.metadata as object,
        sortOrder: item.sortOrder,
      },
      create: {
        slug: item.slug,
        name: item.name,
        description: item.description,
        category: item.category,
        rarity: item.rarity,
        price: item.price,
        isDefault: item.isDefault,
        isAvailable: true,
        requiredLevel: item.requiredLevel,
        unlockRequirementDesc: item.unlockRequirementDesc ?? null,
        metadata: item.metadata as object,
        sortOrder: item.sortOrder,
      },
    });

    for (const asset of item.assets) {
      await client.cosmeticAsset.upsert({
        where: {
          cosmeticItemId_assetRole: {
            cosmeticItemId: saved.id,
            assetRole: asset.assetRole,
          },
        },
        update: {
          url: asset.url,
          width: asset.width,
          height: asset.height,
          frameCount: asset.frameCount,
        },
        create: {
          cosmeticItemId: saved.id,
          assetRole: asset.assetRole,
          url: asset.url,
          width: asset.width,
          height: asset.height,
          frameCount: asset.frameCount,
        },
      });
    }
  }

  // 5. Seed Achievements (32 achievements)
  for (const ach of ACHIEVEMENTS_CATALOG) {
    await client.achievement.upsert({
      where: { slug: ach.slug },
      update: {
        name: ach.name,
        description: ach.description,
        category: ach.category,
        iconKey: ach.iconKey,
        metricKey: ach.metricKey,
        targetValue: ach.targetValue,
        rewardCoins: ach.rewardCoins,
        rewardXp: ach.rewardXp,
        rewardTitle: ach.rewardTitle ?? null,
        sortOrder: ach.sortOrder,
      },
      create: {
        slug: ach.slug,
        name: ach.name,
        description: ach.description,
        category: ach.category,
        iconKey: ach.iconKey,
        metricKey: ach.metricKey,
        targetValue: ach.targetValue,
        rewardCoins: ach.rewardCoins,
        rewardXp: ach.rewardXp,
        rewardTitle: ach.rewardTitle ?? null,
        sortOrder: ach.sortOrder,
        isActive: true,
      },
    });
  }

  // 6. Seed Missions (Daily & Weekly templates)
  for (const mission of MISSIONS_CATALOG) {
    await client.mission.upsert({
      where: { slug: mission.slug },
      update: {
        name: mission.name,
        description: mission.description,
        cadence: mission.cadence,
        metricKey: mission.metricKey,
        targetValue: mission.targetValue,
        rewardCoins: mission.rewardCoins,
        rewardXp: mission.rewardXp,
      },
      create: {
        slug: mission.slug,
        name: mission.name,
        description: mission.description,
        cadence: mission.cadence,
        metricKey: mission.metricKey,
        targetValue: mission.targetValue,
        rewardCoins: mission.rewardCoins,
        rewardXp: mission.rewardXp,
        isActive: true,
      },
    });
  }

  // 7. Seed Default Admin User (for local ops & admin dashboard management)
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@skyhop.local";
  const adminUsername = process.env.ADMIN_USERNAME ?? "skyadmin";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "ChangeMeAdmin123!";

  const existingAdmin = await client.user.findUnique({
    where: { emailLower: adminEmail.toLowerCase() },
  });

  if (!existingAdmin) {
    const defaultItems = await client.cosmeticItem.findMany({
      where: { isDefault: true },
    });

    const admin = await client.user.create({
      data: {
        email: adminEmail,
        emailLower: adminEmail.toLowerCase(),
        username: adminUsername,
        usernameLower: adminUsername.toLowerCase(),
        passwordHash: hashPasswordScrypt(adminPassword),
        role: "ADMIN",
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
        profile: {
          create: {
            displayName: "SKYHOP Admin",
            bio: "Official SKYHOP Arcade operations administrator.",
            title: "Arcade Warden",
            unlockedTitles: ["Arcade Warden"],
          },
        },
        stats: { create: {} },
        wallet: {
          create: {
            balance: DEFAULT_ECONOMY_CONFIG.newAccountCoins,
            totalEarned: DEFAULT_ECONOMY_CONFIG.newAccountCoins,
          },
        },
        settings: { create: {} },
        equippedCosmetics: { create: {} },
      },
    });

    await client.currencyTransaction.create({
      data: {
        userId: admin.id,
        amount: DEFAULT_ECONOMY_CONFIG.newAccountCoins,
        balanceAfter: DEFAULT_ECONOMY_CONFIG.newAccountCoins,
        type: "CREDIT",
        source: "NEW_ACCOUNT",
        description: "Welcome bonus coins",
        idempotencyKey: `signup:${admin.id}`,
      },
    });

    for (const def of defaultItems) {
      await client.userInventory.upsert({
        where: {
          userId_cosmeticItemId: {
            userId: admin.id,
            cosmeticItemId: def.id,
          },
        },
        update: {},
        create: {
          userId: admin.id,
          cosmeticItemId: def.id,
          acquiredVia: "DEFAULT",
        },
      });
    }
  }
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith("seed.ts") || process.argv[1].endsWith("seed.js"));

if (isDirectRun) {
  seedDatabase()
    .then(() => {
      console.log("SKYHOP database seeded successfully.");
    })
    .catch((err) => {
      console.error("Failed to seed database:", err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

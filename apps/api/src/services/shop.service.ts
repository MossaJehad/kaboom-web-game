import { prisma, Prisma, type CosmeticCategory, type CosmeticRarity } from "@skyhop/database";
import type { CosmeticItemDTO } from "@skyhop/shared";
import { badRequest, conflict, forbidden, notFound } from "../utils/errors.js";
import { debitCoinsTx } from "./economy.service.js";
import { evaluateUserAchievementsTx } from "./progression.service.js";

export const CATEGORY_TO_EQUIPPED_FIELD: Record<
  CosmeticCategory,
  { field: string; defaultSlug: string }
> = {
  BIRD_SKIN: { field: "birdSkinSlug", defaultSlug: "classic-sparrow" },
  SCENE: { field: "sceneSlug", defaultSlug: "sunny-meadow" },
  OBSTACLE_SKIN: { field: "obstacleSkinSlug", defaultSlug: "obstacle-scene-default" },
  GROUND_TEXTURE: { field: "groundTextureSlug", defaultSlug: "ground-scene-default" },
  PARTICLE_TRAIL: { field: "particleTrailSlug", defaultSlug: "trail-classic" },
  FLAP_EFFECT: { field: "flapEffectSlug", defaultSlug: "flap-classic" },
  GAME_OVER_EFFECT: { field: "gameOverEffectSlug", defaultSlug: "gameover-classic" },
  PROFILE_AVATAR: { field: "avatarSlug", defaultSlug: "avatar-sparrow-pilot" },
  PROFILE_FRAME: { field: "frameSlug", defaultSlug: "frame-classic-brass" },
};

export async function listCosmeticsCatalog(params: {
  userId: string | null;
  category?: CosmeticCategory;
  rarity?: CosmeticRarity;
  includeUnavailable?: boolean;
  ownedOnly?: boolean;
}): Promise<CosmeticItemDTO[]> {
  const where: Prisma.CosmeticItemWhereInput = {};
  if (!params.includeUnavailable) {
    where.isAvailable = true;
  }
  if (params.category) {
    where.category = params.category;
  }
  if (params.rarity) {
    where.rarity = params.rarity;
  }

  const [items, inventory, equipped, stats] = await Promise.all([
    prisma.cosmeticItem.findMany({
      where,
      include: { assets: true },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { price: "asc" }],
    }),
    params.userId
      ? prisma.userInventory.findMany({
          where: { userId: params.userId },
          select: { cosmeticItemId: true },
        })
      : Promise.resolve([]),
    params.userId
      ? prisma.equippedCosmetics.findUnique({ where: { userId: params.userId } })
      : Promise.resolve(null),
    params.userId
      ? prisma.playerStats.findUnique({ where: { userId: params.userId }, select: { level: true } })
      : Promise.resolve(null),
  ]);

  const ownedIds = new Set(inventory.map((i) => i.cosmeticItemId));
  const playerLevel = stats?.level ?? 1;

  const equippedMap = new Set<string>([
    equipped?.birdSkinSlug ?? "classic-sparrow",
    equipped?.sceneSlug ?? "sunny-meadow",
    equipped?.obstacleSkinSlug ?? "obstacle-scene-default",
    equipped?.groundTextureSlug ?? "ground-scene-default",
    equipped?.particleTrailSlug ?? "trail-classic",
    equipped?.flapEffectSlug ?? "flap-classic",
    equipped?.gameOverEffectSlug ?? "gameover-classic",
    equipped?.avatarSlug ?? "avatar-sparrow-pilot",
    equipped?.frameSlug ?? "frame-classic-brass",
  ]);

  const mapped: CosmeticItemDTO[] = items.map((item) => {
    const owned = item.isDefault || ownedIds.has(item.id);
    return {
      id: item.id,
      slug: item.slug,
      name: item.name,
      description: item.description,
      category: item.category,
      rarity: item.rarity,
      price: item.price,
      isDefault: item.isDefault,
      isAvailable: item.isAvailable,
      requiredLevel: item.requiredLevel,
      unlockRequirementDesc: item.unlockRequirementDesc,
      metadata: (item.metadata as Record<string, unknown>) ?? {},
      assets: item.assets.map((a) => ({
        assetRole: a.assetRole,
        url: a.url,
        width: a.width,
        height: a.height,
        frameCount: a.frameCount,
      })),
      owned,
      equipped: owned && equippedMap.has(item.slug),
      lockedByLevel: !owned && item.requiredLevel > playerLevel,
    };
  });

  if (params.ownedOnly) {
    return mapped.filter((m) => m.owned);
  }
  return mapped;
}

export async function purchaseCosmetic(params: {
  userId: string;
  cosmeticSlug: string;
  idempotencyKey?: string;
}) {
  const item = await prisma.cosmeticItem.findUnique({
    where: { slug: params.cosmeticSlug },
  });
  if (!item) {
    throw notFound("Cosmetic item not found.", "ITEM_NOT_FOUND");
  }
  if (!item.isAvailable) {
    throw badRequest("This item is currently unavailable for purchase.", "ITEM_UNAVAILABLE");
  }

  const idemKey = params.idempotencyKey ?? `purchase:${params.userId}:${item.id}`;

  try {
    return await prisma.$transaction(async (tx) => {
      // Idempotent duplicate request check
      const existingPurchase = await tx.purchase.findUnique({
        where: { idempotencyKey: idemKey },
      });
      if (existingPurchase) {
        const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: params.userId } });
        return {
          alreadyProcessed: true,
          purchaseId: existingPurchase.id,
          cosmeticSlug: item.slug,
          pricePaid: existingPurchase.pricePaid,
          newWalletBalance: wallet.balance,
          newlyUnlockedAchievements: [] as Array<{ slug: string; name: string; rewardCoins: number }>,
        };
      }

      // Check already owned
      const existingInv = await tx.userInventory.findUnique({
        where: {
          userId_cosmeticItemId: { userId: params.userId, cosmeticItemId: item.id },
        },
      });
      if (existingInv || item.isDefault) {
        throw conflict("You already own this cosmetic item.", "ALREADY_OWNED");
      }

      // Check level requirement
      const stats = await tx.playerStats.findUniqueOrThrow({ where: { userId: params.userId } });
      if (stats.level < item.requiredLevel) {
        throw forbidden(
          `Requires Player Level ${item.requiredLevel} to unlock.`,
          "LEVEL_REQUIREMENT_NOT_MET"
        );
      }

      // Server-controlled price debit (atomic balance >= price)
      const debit = await debitCoinsTx(tx, {
        userId: params.userId,
        amount: item.price,
        source: "SHOP_PURCHASE",
        description: `Purchased ${item.name}`,
        idempotencyKey: `tx:${idemKey}`,
        metadata: { cosmeticSlug: item.slug, category: item.category },
      });

      // Grant ownership (unique constraint protects concurrent race!)
      await tx.userInventory.create({
        data: {
          userId: params.userId,
          cosmeticItemId: item.id,
          acquiredVia: "PURCHASE",
        },
      });

      const purchase = await tx.purchase.create({
        data: {
          userId: params.userId,
          cosmeticItemId: item.id,
          pricePaid: item.price,
          idempotencyKey: idemKey,
          transactionId: debit.transactionId,
        },
      });

      const newlyUnlockedAchievements = await evaluateUserAchievementsTx(tx, params.userId);

      return {
        alreadyProcessed: false,
        purchaseId: purchase.id,
        cosmeticSlug: item.slug,
        pricePaid: item.price,
        newWalletBalance: debit.balance,
        newlyUnlockedAchievements,
      };
    });
  } catch (err: unknown) {
    // Handle concurrent unique constraint conflict cleanly
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw conflict("You already own this cosmetic item or purchase is already being processed.", "ALREADY_OWNED");
    }
    throw err;
  }
}

export async function equipCosmetic(params: {
  userId: string;
  category: CosmeticCategory;
  cosmeticSlug: string | null;
}) {
  const mapping = CATEGORY_TO_EQUIPPED_FIELD[params.category];
  const targetSlug = params.cosmeticSlug ?? mapping.defaultSlug;

  const item = await prisma.cosmeticItem.findUnique({
    where: { slug: targetSlug },
  });
  if (!item || item.category !== params.category) {
    throw notFound("Cosmetic item not found in this category.");
  }

  if (!item.isDefault) {
    const owned = await prisma.userInventory.findUnique({
      where: {
        userId_cosmeticItemId: {
          userId: params.userId,
          cosmeticItemId: item.id,
        },
      },
    });
    if (!owned) {
      throw forbidden("You do not own this cosmetic item.", "COSMETIC_NOT_OWNED");
    }
  }

  const updated = await prisma.equippedCosmetics.upsert({
    where: { userId: params.userId },
    update: { [mapping.field]: item.slug },
    create: {
      userId: params.userId,
      [mapping.field]: item.slug,
    },
  });

  return {
    birdSkin: updated.birdSkinSlug,
    scene: updated.sceneSlug,
    obstacleSkin: updated.obstacleSkinSlug,
    groundTexture: updated.groundTextureSlug,
    particleTrail: updated.particleTrailSlug,
    flapEffect: updated.flapEffectSlug,
    gameOverEffect: updated.gameOverEffectSlug,
    avatar: updated.avatarSlug,
    frame: updated.frameSlug,
  };
}

export async function resetEquippedToDefaults(userId: string) {
  const updated = await prisma.equippedCosmetics.upsert({
    where: { userId },
    update: {
      birdSkinSlug: "classic-sparrow",
      sceneSlug: "sunny-meadow",
      obstacleSkinSlug: "obstacle-scene-default",
      groundTextureSlug: "ground-scene-default",
      particleTrailSlug: "trail-classic",
      flapEffectSlug: "flap-classic",
      gameOverEffectSlug: "gameover-classic",
      avatarSlug: "avatar-sparrow-pilot",
      frameSlug: "frame-classic-brass",
    },
    create: { userId },
  });

  return {
    birdSkin: updated.birdSkinSlug,
    scene: updated.sceneSlug,
    obstacleSkin: updated.obstacleSkinSlug,
    groundTexture: updated.groundTextureSlug,
    particleTrail: updated.particleTrailSlug,
    flapEffect: updated.flapEffectSlug,
    gameOverEffect: updated.gameOverEffectSlug,
    avatar: updated.avatarSlug,
    frame: updated.frameSlug,
  };
}

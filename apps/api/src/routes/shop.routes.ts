import type { FastifyInstance } from "fastify";
import { prisma, type CosmeticCategory, type CosmeticRarity } from "@skyhop/database";
import {
  COSMETIC_CATEGORIES,
  COSMETIC_RARITIES,
  equipCosmeticSchema,
  purchaseCosmeticSchema,
} from "@skyhop/shared";
import { requireAuth } from "../plugins/auth.js";
import {
  equipCosmetic,
  listCosmeticsCatalog,
  purchaseCosmetic,
  resetEquippedToDefaults,
} from "../services/shop.service.js";

export async function shopRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/api/shop/items", async (request, reply) => {
    const q = request.query as { category?: string; rarity?: string };
    const category = COSMETIC_CATEGORIES.includes(q.category as CosmeticCategory)
      ? (q.category as CosmeticCategory)
      : undefined;
    const rarity = COSMETIC_RARITIES.includes(q.rarity as CosmeticRarity)
      ? (q.rarity as CosmeticRarity)
      : undefined;

    const items = await listCosmeticsCatalog({
      userId: request.auth?.user.id ?? null,
      category,
      rarity,
    });

    let walletBalance = 0;
    if (request.auth) {
      const wallet = await prisma.wallet.findUnique({ where: { userId: request.auth.user.id } });
      walletBalance = wallet?.balance ?? 0;
    }

    return reply.send({ items, walletBalance });
  });

  fastify.post("/api/shop/purchase", async (request, reply) => {
    const auth = requireAuth(request);
    const body = purchaseCosmeticSchema.parse(request.body);
    const result = await purchaseCosmetic({
      userId: auth.user.id,
      cosmeticSlug: body.cosmeticSlug,
      idempotencyKey: body.idempotencyKey,
    });
    return reply.status(result.alreadyProcessed ? 200 : 201).send(result);
  });

  fastify.get("/api/inventory", async (request, reply) => {
    const auth = requireAuth(request);
    const q = request.query as { category?: string; rarity?: string };
    const category = COSMETIC_CATEGORIES.includes(q.category as CosmeticCategory)
      ? (q.category as CosmeticCategory)
      : undefined;
    const rarity = COSMETIC_RARITIES.includes(q.rarity as CosmeticRarity)
      ? (q.rarity as CosmeticRarity)
      : undefined;

    const [items, equipped] = await Promise.all([
      listCosmeticsCatalog({
        userId: auth.user.id,
        category,
        rarity,
        includeUnavailable: true,
        ownedOnly: true,
      }),
      prisma.equippedCosmetics.findUnique({ where: { userId: auth.user.id } }),
    ]);

    return reply.send({
      items,
      equipped: {
        birdSkin: equipped?.birdSkinSlug ?? "classic-sparrow",
        scene: equipped?.sceneSlug ?? "sunny-meadow",
        obstacleSkin: equipped?.obstacleSkinSlug ?? "obstacle-scene-default",
        groundTexture: equipped?.groundTextureSlug ?? "ground-scene-default",
        particleTrail: equipped?.particleTrailSlug ?? "trail-classic",
        flapEffect: equipped?.flapEffectSlug ?? "flap-classic",
        gameOverEffect: equipped?.gameOverEffectSlug ?? "gameover-classic",
        avatar: equipped?.avatarSlug ?? "avatar-sparrow-pilot",
        frame: equipped?.frameSlug ?? "frame-classic-brass",
      },
    });
  });

  fastify.post("/api/inventory/equip", async (request, reply) => {
    const auth = requireAuth(request);
    const body = equipCosmeticSchema.parse(request.body);
    const equipped = await equipCosmetic({
      userId: auth.user.id,
      category: body.category,
      cosmeticSlug: body.cosmeticSlug,
    });
    return reply.send({ equipped });
  });

  fastify.post("/api/inventory/reset", async (request, reply) => {
    const auth = requireAuth(request);
    const equipped = await resetEquippedToDefaults(auth.user.id);
    return reply.send({ equipped });
  });

  // Economy & Wallet History
  fastify.get("/api/economy/wallet", async (request, reply) => {
    const auth = requireAuth(request);
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: auth.user.id } });
    return reply.send({ wallet });
  });

  fastify.get("/api/economy/transactions", async (request, reply) => {
    const auth = requireAuth(request);
    const q = request.query as { page?: string; pageSize?: string; filter?: string };
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(q.pageSize) || 25));

    const where =
      q.filter === "rewards"
        ? { userId: auth.user.id, type: "CREDIT" as const }
        : q.filter === "purchases"
          ? { userId: auth.user.id, type: "DEBIT" as const }
          : { userId: auth.user.id };

    const [wallet, transactions, total, purchases] = await Promise.all([
      prisma.wallet.findUniqueOrThrow({ where: { userId: auth.user.id } }),
      prisma.currencyTransaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.currencyTransaction.count({ where }),
      prisma.purchase.findMany({
        where: { userId: auth.user.id },
        include: { cosmeticItem: { select: { slug: true, name: true, category: true, rarity: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

    return reply.send({
      wallet,
      transactions,
      purchases,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    });
  });
}

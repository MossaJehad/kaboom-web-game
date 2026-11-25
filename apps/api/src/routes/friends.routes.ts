import type { FastifyInstance } from "fastify";
import { prisma } from "@skyhop/database";
import { blockUserSchema, friendRequestSchema } from "@skyhop/shared";
import { requireAuth } from "../plugins/auth.js";
import { evaluateUserAchievementsTx } from "../services/progression.service.js";
import { badRequest, conflict, forbidden, notFound } from "../utils/errors.js";

function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function friendsRoutes(fastify: FastifyInstance): Promise<void> {
  // List friends, pending requests, and blocked users
  fastify.get("/api/friends", async (request, reply) => {
    const auth = requireAuth(request);
    const userId = auth.user.id;

    const [friendships, incoming, outgoing, blocked] = await Promise.all([
      prisma.friendship.findMany({
        where: { OR: [{ userAId: userId }, { userBId: userId }] },
        include: {
          userA: {
            include: { profile: true, stats: true, equippedCosmetics: true },
          },
          userB: {
            include: { profile: true, stats: true, equippedCosmetics: true },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.friendRequest.findMany({
        where: { receiverId: userId, status: "PENDING" },
        include: {
          sender: { include: { profile: true, stats: true, equippedCosmetics: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.friendRequest.findMany({
        where: { senderId: userId, status: "PENDING" },
        include: {
          receiver: { include: { profile: true, stats: true, equippedCosmetics: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.blockedUser.findMany({
        where: { blockerId: userId },
        include: {
          blocked: { select: { id: true, username: true, profile: { select: { displayName: true } } } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const friends = friendships.map((f) => {
      const other = f.userAId === userId ? f.userB : f.userA;
      return {
        userId: other.id,
        username: other.username,
        displayName: other.profile?.displayName ?? other.username,
        title: other.profile?.title ?? null,
        level: other.stats?.level ?? 1,
        classicHighScore: other.profile?.showStats === false ? null : (other.stats?.classicHighScore ?? 0),
        hardcoreHighScore: other.profile?.showStats === false ? null : (other.stats?.hardcoreHighScore ?? 0),
        avatarSlug: other.equippedCosmetics?.avatarSlug ?? "avatar-sparrow-pilot",
        frameSlug: other.equippedCosmetics?.frameSlug ?? "frame-classic-brass",
        equippedBirdSlug: other.equippedCosmetics?.birdSkinSlug ?? "classic-sparrow",
        since: f.createdAt.toISOString(),
      };
    });

    return reply.send({
      friends,
      incomingRequests: incoming.map((r) => ({
        id: r.id,
        fromUserId: r.sender.id,
        username: r.sender.username,
        displayName: r.sender.profile?.displayName ?? r.sender.username,
        level: r.sender.stats?.level ?? 1,
        avatarSlug: r.sender.equippedCosmetics?.avatarSlug ?? "avatar-sparrow-pilot",
        createdAt: r.createdAt.toISOString(),
      })),
      outgoingRequests: outgoing.map((r) => ({
        id: r.id,
        toUserId: r.receiver.id,
        username: r.receiver.username,
        displayName: r.receiver.profile?.displayName ?? r.receiver.username,
        avatarSlug: r.receiver.equippedCosmetics?.avatarSlug ?? "avatar-sparrow-pilot",
        createdAt: r.createdAt.toISOString(),
      })),
      blockedUsers: blocked.map((b) => ({
        userId: b.blocked.id,
        username: b.blocked.username,
        displayName: b.blocked.profile?.displayName ?? b.blocked.username,
        reason: b.reason,
        createdAt: b.createdAt.toISOString(),
      })),
    });
  });

  // Send friend request
  fastify.post("/api/friends/requests", async (request, reply) => {
    const auth = requireAuth(request);
    const body = friendRequestSchema.parse(request.body);

    const target = await prisma.user.findUnique({
      where: { usernameLower: body.username.toLowerCase() },
    });
    if (!target || target.deletedAt || target.status === "BANNED") {
      throw notFound("Player not found.");
    }
    if (target.id === auth.user.id) {
      throw badRequest("You cannot send a friend request to yourself.");
    }

    const block = await prisma.blockedUser.findFirst({
      where: {
        OR: [
          { blockerId: auth.user.id, blockedId: target.id },
          { blockerId: target.id, blockedId: auth.user.id },
        ],
      },
    });
    if (block) {
      throw forbidden("Cannot send friend request due to block settings.");
    }

    const [a, b] = canonicalPair(auth.user.id, target.id);
    const alreadyFriends = await prisma.friendship.findUnique({
      where: { userAId_userBId: { userAId: a, userBId: b } },
    });
    if (alreadyFriends) {
      throw conflict("You are already friends with this player.");
    }

    // If reverse pending request exists, auto-accept!
    const reverse = await prisma.friendRequest.findUnique({
      where: { senderId_receiverId: { senderId: target.id, receiverId: auth.user.id } },
    });
    if (reverse && reverse.status === "PENDING") {
      await prisma.$transaction(async (tx) => {
        await tx.friendRequest.update({
          where: { id: reverse.id },
          data: { status: "ACCEPTED", respondedAt: new Date() },
        });
        await tx.friendship.create({ data: { userAId: a, userBId: b } });
        await evaluateUserAchievementsTx(tx, auth.user.id);
        await evaluateUserAchievementsTx(tx, target.id);
      });
      return reply.status(201).send({ ok: true, autoAccepted: true });
    }

    const reqRecord = await prisma.friendRequest.upsert({
      where: { senderId_receiverId: { senderId: auth.user.id, receiverId: target.id } },
      update: { status: "PENDING", respondedAt: null, createdAt: new Date() },
      create: {
        senderId: auth.user.id,
        receiverId: target.id,
        status: "PENDING",
      },
    });

    return reply.status(201).send({ ok: true, requestId: reqRecord.id });
  });

  // Accept friend request
  fastify.post("/api/friends/requests/:id/accept", async (request, reply) => {
    const auth = requireAuth(request);
    const { id } = request.params as { id: string };

    const fr = await prisma.friendRequest.findUnique({ where: { id } });
    if (!fr || fr.receiverId !== auth.user.id || fr.status !== "PENDING") {
      throw notFound("Pending friend request not found.");
    }

    const [a, b] = canonicalPair(fr.senderId, fr.receiverId);
    await prisma.$transaction(async (tx) => {
      await tx.friendRequest.update({
        where: { id: fr.id },
        data: { status: "ACCEPTED", respondedAt: new Date() },
      });
      await tx.friendship.upsert({
        where: { userAId_userBId: { userAId: a, userBId: b } },
        update: {},
        create: { userAId: a, userBId: b },
      });
      await evaluateUserAchievementsTx(tx, fr.senderId);
      await evaluateUserAchievementsTx(tx, fr.receiverId);
    });

    return reply.send({ ok: true });
  });

  // Reject or cancel friend request
  fastify.post("/api/friends/requests/:id/reject", async (request, reply) => {
    const auth = requireAuth(request);
    const { id } = request.params as { id: string };

    const fr = await prisma.friendRequest.findUnique({ where: { id } });
    if (!fr || (fr.receiverId !== auth.user.id && fr.senderId !== auth.user.id)) {
      throw notFound("Friend request not found.");
    }

    await prisma.friendRequest.update({
      where: { id: fr.id },
      data: {
        status: fr.senderId === auth.user.id ? "CANCELLED" : "REJECTED",
        respondedAt: new Date(),
      },
    });

    return reply.send({ ok: true });
  });

  // Remove friend
  fastify.delete("/api/friends/:friendUserId", async (request, reply) => {
    const auth = requireAuth(request);
    const { friendUserId } = request.params as { friendUserId: string };
    const [a, b] = canonicalPair(auth.user.id, friendUserId);

    await prisma.friendship.deleteMany({
      where: { userAId: a, userBId: b },
    });

    return reply.send({ ok: true });
  });

  // Block player
  fastify.post("/api/friends/block", async (request, reply) => {
    const auth = requireAuth(request);
    const body = blockUserSchema.parse(request.body);

    const target = await prisma.user.findUnique({
      where: { usernameLower: body.username.toLowerCase() },
    });
    if (!target || target.deletedAt) {
      throw notFound("Player not found.");
    }
    if (target.id === auth.user.id) {
      throw badRequest("You cannot block yourself.");
    }

    const [a, b] = canonicalPair(auth.user.id, target.id);
    await prisma.$transaction([
      prisma.friendship.deleteMany({ where: { userAId: a, userBId: b } }),
      prisma.friendRequest.deleteMany({
        where: {
          OR: [
            { senderId: auth.user.id, receiverId: target.id },
            { senderId: target.id, receiverId: auth.user.id },
          ],
        },
      }),
      prisma.blockedUser.upsert({
        where: { blockerId_blockedId: { blockerId: auth.user.id, blockedId: target.id } },
        update: { reason: body.reason ?? null },
        create: {
          blockerId: auth.user.id,
          blockedId: target.id,
          reason: body.reason ?? null,
        },
      }),
    ]);

    return reply.status(201).send({ ok: true });
  });

  // Unblock player
  fastify.delete("/api/friends/block/:blockedUserId", async (request, reply) => {
    const auth = requireAuth(request);
    const { blockedUserId } = request.params as { blockedUserId: string };
    await prisma.blockedUser.deleteMany({
      where: { blockerId: auth.user.id, blockedId: blockedUserId },
    });
    return reply.send({ ok: true });
  });

  // Compare personal records with a friend
  fastify.get("/api/friends/compare/:username", async (request, reply) => {
    const auth = requireAuth(request);
    const { username } = request.params as { username: string };

    const target = await prisma.user.findUnique({
      where: { usernameLower: username.toLowerCase() },
      include: { stats: true, profile: true, equippedCosmetics: true },
    });
    if (!target || target.deletedAt || target.status === "BANNED") {
      throw notFound("Player not found.");
    }

    const me = await prisma.user.findUniqueOrThrow({
      where: { id: auth.user.id },
      include: { stats: true, profile: true, equippedCosmetics: true },
    });

    if (target.profile?.showStats === false && target.id !== me.id) {
      throw forbidden("This player keeps their gameplay stats private.");
    }

    return reply.send({
      comparison: {
        me: {
          username: me.username,
          level: me.stats?.level ?? 1,
          classicHighScore: me.stats?.classicHighScore ?? 0,
          hardcoreHighScore: me.stats?.hardcoreHighScore ?? 0,
          dailyHighScore: me.stats?.dailyHighScore ?? 0,
          totalGames: me.stats?.totalGames ?? 0,
          totalObstaclesPassed: me.stats?.totalObstaclesPassed ?? 0,
          avatarSlug: me.equippedCosmetics?.avatarSlug ?? "avatar-sparrow-pilot",
        },
        opponent: {
          username: target.username,
          level: target.stats?.level ?? 1,
          classicHighScore: target.stats?.classicHighScore ?? 0,
          hardcoreHighScore: target.stats?.hardcoreHighScore ?? 0,
          dailyHighScore: target.stats?.dailyHighScore ?? 0,
          totalGames: target.stats?.totalGames ?? 0,
          totalObstaclesPassed: target.stats?.totalObstaclesPassed ?? 0,
          avatarSlug: target.equippedCosmetics?.avatarSlug ?? "avatar-sparrow-pilot",
        },
      },
    });
  });
}

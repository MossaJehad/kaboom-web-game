import type { FastifyInstance } from "fastify";
import { prisma } from "@skyhop/database";
import {
  updateProfileSchema,
  updateSettingsSchema,
  updateUsernameSchema,
} from "@skyhop/shared";
import { requireAuth } from "../plugins/auth.js";
import { buildAuthUserDTO, getFullPlayerProfile } from "../services/user.service.js";
import { badRequest, conflict, notFound } from "../utils/errors.js";

export async function usersRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/api/users/me/profile", async (request, reply) => {
    const auth = requireAuth(request);
    const profile = await getFullPlayerProfile(auth.user.id, auth.user.id);
    return reply.send({ profile });
  });

  fastify.patch("/api/users/me/profile", async (request, reply) => {
    const auth = requireAuth(request);
    const body = updateProfileSchema.parse(request.body);

    // Validate selected title is actually unlocked by the player
    if (body.title !== undefined && body.title !== null && body.title !== "") {
      const existing = await prisma.userProfile.findUnique({
        where: { userId: auth.user.id },
      });
      if (!existing?.unlockedTitles.includes(body.title)) {
        throw badRequest("You have not unlocked this title yet.", "TITLE_NOT_UNLOCKED");
      }
    }

    await prisma.userProfile.upsert({
      where: { userId: auth.user.id },
      update: {
        ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
        ...(body.bio !== undefined ? { bio: body.bio } : {}),
        ...(body.title !== undefined ? { title: body.title || null } : {}),
        ...(body.isPublic !== undefined ? { isPublic: body.isPublic } : {}),
        ...(body.showStats !== undefined ? { showStats: body.showStats } : {}),
        ...(body.showCosmetics !== undefined ? { showCosmetics: body.showCosmetics } : {}),
        ...(body.showFriends !== undefined ? { showFriends: body.showFriends } : {}),
      },
      create: {
        userId: auth.user.id,
        displayName: body.displayName ?? auth.user.username,
        bio: body.bio ?? "",
      },
    });

    const user = await buildAuthUserDTO(auth.user.id);
    return reply.send({ user });
  });

  fastify.patch("/api/users/me/username", async (request, reply) => {
    const auth = requireAuth(request);
    const body = updateUsernameSchema.parse(request.body);
    const lower = body.username.toLowerCase();

    const conflictUser = await prisma.user.findFirst({
      where: {
        usernameLower: lower,
        id: { not: auth.user.id },
      },
    });
    if (conflictUser) {
      throw conflict("This username is already taken.", "USERNAME_TAKEN");
    }

    await prisma.user.update({
      where: { id: auth.user.id },
      data: {
        username: body.username,
        usernameLower: lower,
      },
    });

    const user = await buildAuthUserDTO(auth.user.id);
    return reply.send({ user });
  });

  fastify.patch("/api/users/me/settings", async (request, reply) => {
    const auth = requireAuth(request);
    const body = updateSettingsSchema.parse(request.body);

    const updated = await prisma.playerSettings.upsert({
      where: { userId: auth.user.id },
      update: body,
      create: {
        userId: auth.user.id,
        ...body,
      },
    });

    return reply.send({ settings: updated });
  });

  // Search players by username (public directory)
  fastify.get("/api/users/search", async (request, reply) => {
    const q = ((request.query as { q?: string }).q ?? "").trim().toLowerCase();
    if (q.length < 2) {
      return reply.send({ players: [] });
    }

    const viewerId = request.auth?.user.id ?? null;
    const blockedIds = new Set<string>();
    if (viewerId) {
      const blocks = await prisma.blockedUser.findMany({
        where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
      });
      for (const b of blocks) {
        blockedIds.add(b.blockerId === viewerId ? b.blockedId : b.blockerId);
      }
    }

    const users = await prisma.user.findMany({
      where: {
        usernameLower: { contains: q },
        deletedAt: null,
        status: { not: "BANNED" },
        ...(viewerId ? { id: { notIn: [viewerId, ...Array.from(blockedIds)] } } : {}),
      },
      take: 20,
      include: {
        profile: true,
        stats: true,
        equippedCosmetics: true,
      },
    });

    return reply.send({
      players: users.map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.profile?.displayName ?? u.username,
        title: u.profile?.title ?? null,
        level: u.stats?.level ?? 1,
        highestScore: u.profile?.showStats === false ? null : (u.stats?.highestScore ?? 0),
        avatarSlug: u.equippedCosmetics?.avatarSlug ?? "avatar-sparrow-pilot",
        frameSlug: u.equippedCosmetics?.frameSlug ?? "frame-classic-brass",
        equippedBirdSlug: u.equippedCosmetics?.birdSkinSlug ?? "classic-sparrow",
      })),
    });
  });

  // Public player profile by username
  fastify.get("/api/users/:username", async (request, reply) => {
    const { username } = request.params as { username: string };
    const target = await prisma.user.findUnique({
      where: { usernameLower: username.toLowerCase() },
      select: { id: true, deletedAt: true, status: true },
    });

    if (!target || target.deletedAt || target.status === "BANNED") {
      throw notFound("Player profile not found.");
    }

    const viewerId = request.auth?.user.id ?? null;
    if (viewerId && viewerId !== target.id) {
      const blocked = await prisma.blockedUser.findFirst({
        where: {
          OR: [
            { blockerId: target.id, blockedId: viewerId },
            { blockerId: viewerId, blockedId: target.id },
          ],
        },
      });
      if (blocked) {
        throw notFound("Player profile not found.");
      }
    }

    const profile = await getFullPlayerProfile(target.id, viewerId);
    return reply.send({ profile });
  });
}

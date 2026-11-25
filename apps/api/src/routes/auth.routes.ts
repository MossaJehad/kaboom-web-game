import type { FastifyInstance } from "fastify";
import { prisma } from "@skyhop/database";
import {
  changePasswordSchema,
  DEFAULT_ECONOMY_CONFIG,
  deleteAccountSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "@skyhop/shared";
import { getEnv } from "../config/env.js";
import {
  clearAuthCookies,
  requireAuth,
  setAuthCookies,
} from "../plugins/auth.js";
import { getDevOutbox, sendMail } from "../services/mailer.js";
import { buildAuthUserDTO } from "../services/user.service.js";
import {
  generateSecureToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from "../utils/crypto.js";
import { badRequest, conflict, forbidden, unauthorized } from "../utils/errors.js";

async function createSessionForUser(
  userId: string,
  userAgent: string | undefined,
  ipAddress: string | undefined
) {
  const env = getEnv();
  const rawToken = generateSecureToken(32);
  const csrfToken = generateSecureToken(24);
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.authSession.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      csrfToken,
      userAgent: userAgent?.slice(0, 255),
      ipAddress: ipAddress?.slice(0, 64),
      expiresAt,
    },
  });

  return { rawToken, csrfToken, expiresAt };
}

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // Register
  fastify.post("/api/auth/register", async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const emailLower = body.email.toLowerCase();
    const usernameLower = body.username.toLowerCase();

    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ emailLower }, { usernameLower }],
      },
      select: { emailLower: true, usernameLower: true },
    });

    if (existing) {
      if (existing.emailLower === emailLower) {
        throw conflict("An account with this email already exists.", "EMAIL_TAKEN");
      }
      throw conflict("This username is already taken.", "USERNAME_TAKEN");
    }

    const passwordHash = hashPassword(body.password);
    const defaultItems = await prisma.cosmeticItem.findMany({
      where: { isDefault: true },
      select: { id: true },
    });

    const verifyRawToken = generateSecureToken(32);
    const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Safe guest migration: migrate user preferences & record local practice best separately
    // without EVER granting unverified competitive scores, rankings, or currency!
    const migratedSettings = body.guestMigration?.settings;
    const migratedLocalBest = body.guestMigration?.localClassicBest ?? 0;

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: body.email,
          emailLower,
          username: body.username,
          usernameLower,
          passwordHash,
          role: "USER",
          status: "ACTIVE",
          profile: {
            create: {
              displayName: body.username,
              bio: "",
              unlockedTitles: [],
            },
          },
          stats: {
            create: {
              localMigratedClassicBest: Math.max(0, Math.min(9999, migratedLocalBest)),
            },
          },
          wallet: {
            create: {
              balance: DEFAULT_ECONOMY_CONFIG.newAccountCoins,
              totalEarned: DEFAULT_ECONOMY_CONFIG.newAccountCoins,
            },
          },
          settings: {
            create: migratedSettings
              ? {
                  masterVolume: migratedSettings.masterVolume ?? 0.8,
                  musicVolume: migratedSettings.musicVolume ?? 0.55,
                  sfxVolume: migratedSettings.sfxVolume ?? 0.85,
                  ambientVolume: migratedSettings.ambientVolume ?? 0.5,
                  reducedMotion: migratedSettings.reducedMotion ?? false,
                  highContrast: migratedSettings.highContrast ?? false,
                  screenShake: migratedSettings.screenShake ?? true,
                  vibration: migratedSettings.vibration ?? true,
                }
              : {},
          },
          equippedCosmetics: { create: {} },
          emailTokens: {
            create: {
              tokenHash: hashToken(verifyRawToken),
              expiresAt: verifyExpires,
            },
          },
        },
      });

      await tx.currencyTransaction.create({
        data: {
          userId: created.id,
          amount: DEFAULT_ECONOMY_CONFIG.newAccountCoins,
          balanceAfter: DEFAULT_ECONOMY_CONFIG.newAccountCoins,
          type: "CREDIT",
          source: "NEW_ACCOUNT",
          description: "Welcome bonus coins",
          idempotencyKey: `signup:${created.id}`,
        },
      });

      if (defaultItems.length > 0) {
        await tx.userInventory.createMany({
          data: defaultItems.map((d) => ({
            userId: created.id,
            cosmeticItemId: d.id,
            acquiredVia: "DEFAULT",
          })),
          skipDuplicates: true,
        });
      }

      return created;
    });

    const env = getEnv();
    const verifyUrl = `${env.APP_URL}/verify-email?token=${encodeURIComponent(verifyRawToken)}`;
    await sendMail({
      to: user.email,
      subject: "Verify your SKYHOP Arcade account",
      text: `Welcome to SKYHOP, ${user.username}! Verify your email here: ${verifyUrl}`,
      html: `<p>Welcome to <strong>SKYHOP Arcade</strong>, ${user.username}!</p><p><a href="${verifyUrl}">Verify your email address</a></p>`,
      token: verifyRawToken,
      kind: "VERIFY_EMAIL",
    });

    const session = await createSessionForUser(user.id, request.headers["user-agent"], request.ip);
    setAuthCookies(reply, session.rawToken, session.csrfToken, session.expiresAt);
    const dto = await buildAuthUserDTO(user.id);

    return reply.status(201).send({
      user: dto,
      csrfToken: session.csrfToken,
      verificationRequired: true,
      ...(env.NODE_ENV !== "production" ? { devVerificationToken: verifyRawToken } : {}),
    });
  });

  // Login
  fastify.post("/api/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const idLower = body.identifier.toLowerCase();

    const user = await prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [{ emailLower: idLower }, { usernameLower: idLower }],
      },
    });

    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      throw unauthorized("Invalid email/username or password.", "INVALID_CREDENTIALS");
    }

    if (user.status === "BANNED") {
      throw forbidden(
        user.banReason ? `This account has been banned: ${user.banReason}` : "This account has been banned.",
        "ACCOUNT_BANNED"
      );
    }

    if (user.status === "SUSPENDED" && user.suspendedUntil && user.suspendedUntil.getTime() > Date.now()) {
      throw forbidden(
        `This account is suspended until ${user.suspendedUntil.toISOString()}.`,
        "ACCOUNT_SUSPENDED"
      );
    }

    const session = await createSessionForUser(user.id, request.headers["user-agent"], request.ip);
    setAuthCookies(reply, session.rawToken, session.csrfToken, session.expiresAt);
    const dto = await buildAuthUserDTO(user.id);

    return reply.send({
      user: dto,
      csrfToken: session.csrfToken,
    });
  });

  // Logout
  fastify.post("/api/auth/logout", async (request, reply) => {
    if (request.auth) {
      await prisma.authSession.update({
        where: { id: request.auth.sessionId },
        data: { revokedAt: new Date() },
      });
    }
    clearAuthCookies(reply);
    return reply.send({ ok: true });
  });

  // Current User Session
  fastify.get("/api/auth/me", async (request, reply) => {
    if (!request.auth) {
      return reply.send({ user: null, csrfToken: null });
    }
    const dto = await buildAuthUserDTO(request.auth.user.id);
    return reply.send({
      user: dto,
      csrfToken: request.auth.csrfToken,
    });
  });

  // Verify Email
  fastify.post("/api/auth/verify-email", async (request, reply) => {
    const body = verifyEmailSchema.parse(request.body);
    const tokenHash = hashToken(body.token);

    const record = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw badRequest("Invalid or expired email verification token.", "INVALID_TOKEN");
    }

    await prisma.$transaction([
      prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      }),
    ]);

    return reply.send({ ok: true, emailVerified: true });
  });

  // Resend Verification Email
  fastify.post("/api/auth/resend-verification", async (request, reply) => {
    const auth = requireAuth(request);
    if (auth.user.emailVerifiedAt) {
      return reply.send({ ok: true, alreadyVerified: true });
    }

    const rawToken = generateSecureToken(32);
    await prisma.emailVerificationToken.create({
      data: {
        userId: auth.user.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const env = getEnv();
    const verifyUrl = `${env.APP_URL}/verify-email?token=${encodeURIComponent(rawToken)}`;
    await sendMail({
      to: auth.user.email,
      subject: "Verify your SKYHOP Arcade account",
      text: `Verify your SKYHOP account here: ${verifyUrl}`,
      html: `<p><a href="${verifyUrl}">Verify your email address</a></p>`,
      token: rawToken,
      kind: "VERIFY_EMAIL",
    });

    return reply.send({
      ok: true,
      ...(env.NODE_ENV !== "production" ? { devVerificationToken: rawToken } : {}),
    });
  });

  // Forgot Password
  fastify.post("/api/auth/forgot-password", async (request, reply) => {
    const body = forgotPasswordSchema.parse(request.body);
    const user = await prisma.user.findUnique({
      where: { emailLower: body.email.toLowerCase() },
    });

    const env = getEnv();
    let devResetToken: string | undefined;

    if (user && !user.deletedAt) {
      const rawToken = generateSecureToken(32);
      devResetToken = rawToken;
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(rawToken),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        },
      });

      const resetUrl = `${env.APP_URL}/reset-password?token=${encodeURIComponent(rawToken)}`;
      await sendMail({
        to: user.email,
        subject: "Reset your SKYHOP Arcade password",
        text: `Reset your password here (valid for 1 hour): ${resetUrl}`,
        html: `<p>Click below to reset your password (expires in 1 hour):</p><p><a href="${resetUrl}">Reset Password</a></p>`,
        token: rawToken,
        kind: "PASSWORD_RESET",
      });
    }

    // Always return identical success message to prevent email enumeration
    return reply.send({
      ok: true,
      message: "If an account with that email exists, a password reset link has been sent.",
      ...(env.NODE_ENV !== "production" && devResetToken ? { devResetToken } : {}),
    });
  });

  // Reset Password
  fastify.post("/api/auth/reset-password", async (request, reply) => {
    const body = resetPasswordSchema.parse(request.body);
    const tokenHash = hashToken(body.token);

    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw badRequest("Invalid or expired password reset token.", "INVALID_TOKEN");
    }

    const newHash = hashPassword(body.newPassword);
    await prisma.$transaction([
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash: newHash },
      }),
      // Revoke all active sessions on password reset
      prisma.authSession.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return reply.send({ ok: true });
  });

  // Change Password (Authenticated)
  fastify.post("/api/auth/change-password", async (request, reply) => {
    const auth = requireAuth(request);
    const body = changePasswordSchema.parse(request.body);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: auth.user.id } });
    if (!verifyPassword(body.currentPassword, user.passwordHash)) {
      throw badRequest("Current password is incorrect.", "WRONG_PASSWORD");
    }

    const newHash = hashPassword(body.newPassword);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: auth.user.id },
        data: { passwordHash: newHash },
      }),
      // Revoke other sessions while keeping current session active
      prisma.authSession.updateMany({
        where: {
          userId: auth.user.id,
          id: { not: auth.sessionId },
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      }),
    ]);

    return reply.send({ ok: true });
  });

  // Delete Account (Authenticated, requires password + DELETE confirmation)
  fastify.delete("/api/auth/account", async (request, reply) => {
    const auth = requireAuth(request);
    const body = deleteAccountSchema.parse(request.body);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: auth.user.id } });
    if (!verifyPassword(body.password, user.passwordHash)) {
      throw badRequest("Incorrect password.", "WRONG_PASSWORD");
    }

    const deletedSuffix = `_del_${Date.now()}`;
    await prisma.$transaction([
      prisma.authSession.updateMany({
        where: { userId: auth.user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: auth.user.id },
        data: {
          deletedAt: new Date(),
          email: `${user.email}${deletedSuffix}`,
          emailLower: `${user.emailLower}${deletedSuffix}`,
          username: `${user.username}${deletedSuffix}`,
          usernameLower: `${user.usernameLower}${deletedSuffix}`,
        },
      }),
    ]);

    clearAuthCookies(reply);
    return reply.send({ ok: true });
  });

  // Local Dev/Test Email Outbox Inspector (strictly disabled in production)
  const env = getEnv();
  if (env.NODE_ENV !== "production") {
    fastify.get("/api/auth/dev-outbox", async (request, reply) => {
      const q = request.query as { email?: string };
      const all = getDevOutbox();
      const filtered = q.email
        ? all.filter((m) => m.to.toLowerCase() === q.email!.toLowerCase())
        : all;
      return reply.send({ emails: filtered });
    });
  }
}

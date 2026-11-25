import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { prisma, type UserRole, type UserStatus } from "@skyhop/database";
import { getEnv } from "../config/env.js";
import { hashToken } from "../utils/crypto.js";
import { forbidden, unauthorized } from "../utils/errors.js";

export const SESSION_COOKIE_NAME = "skyhop_session";
export const CSRF_COOKIE_NAME = "skyhop_csrf";

export interface AuthenticatedContext {
  sessionId: string;
  csrfToken: string;
  user: {
    id: string;
    email: string;
    username: string;
    role: UserRole;
    status: UserStatus;
    emailVerifiedAt: Date | null;
    suspendedUntil: Date | null;
    banReason: string | null;
  };
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthenticatedContext | null;
  }
}

export function setAuthCookies(reply: FastifyReply, rawToken: string, csrfToken: string, expiresAt: Date): void {
  const env = getEnv();
  const common = {
    path: "/",
    sameSite: "lax" as const,
    secure: env.COOKIE_SECURE,
    expires: expiresAt,
  };
  reply.setCookie(SESSION_COOKIE_NAME, rawToken, {
    ...common,
    httpOnly: true,
  });
  reply.setCookie(CSRF_COOKIE_NAME, csrfToken, {
    ...common,
    httpOnly: false,
  });
}

export function clearAuthCookies(reply: FastifyReply): void {
  const env = getEnv();
  const common = {
    path: "/",
    sameSite: "lax" as const,
    secure: env.COOKIE_SECURE,
  };
  reply.clearCookie(SESSION_COOKIE_NAME, { ...common, httpOnly: true });
  reply.clearCookie(CSRF_COOKIE_NAME, { ...common, httpOnly: false });
}

export function requireAuth(request: FastifyRequest): AuthenticatedContext {
  if (!request.auth) {
    throw unauthorized("Please log in to continue.");
  }
  const u = request.auth.user;
  if (u.status === "BANNED") {
    throw forbidden(u.banReason ? `Account banned: ${u.banReason}` : "Account has been banned.", "ACCOUNT_BANNED");
  }
  if (u.status === "SUSPENDED" && u.suspendedUntil && u.suspendedUntil.getTime() > Date.now()) {
    throw forbidden(
      `Account suspended until ${u.suspendedUntil.toISOString()}.`,
      "ACCOUNT_SUSPENDED"
    );
  }
  return request.auth;
}

export function requireRole(request: FastifyRequest, allowed: UserRole[]): AuthenticatedContext {
  const auth = requireAuth(request);
  if (!allowed.includes(auth.user.role)) {
    throw forbidden("Administrator permissions required.", "INSUFFICIENT_ROLE");
  }
  return auth;
}

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CSRF_EXEMPT_PREFIXES = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/verify-email",
];

const authPluginImpl: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest("auth", null);

  fastify.addHook("preHandler", async (request) => {
    const rawToken = request.cookies?.[SESSION_COOKIE_NAME];
    if (!rawToken) {
      request.auth = null;
      return;
    }

    const tokenHash = hashToken(rawToken);
    const session = await prisma.authSession.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            role: true,
            status: true,
            emailVerifiedAt: true,
            suspendedUntil: true,
            banReason: true,
            deletedAt: true,
          },
        },
      },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now() ||
      session.user.deletedAt
    ) {
      request.auth = null;
      return;
    }

    // Auto-lift expired temporary suspension
    if (
      session.user.status === "SUSPENDED" &&
      session.user.suspendedUntil &&
      session.user.suspendedUntil.getTime() <= Date.now()
    ) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { status: "ACTIVE", suspendedUntil: null },
      });
      session.user.status = "ACTIVE";
      session.user.suspendedUntil = null;
    }

    request.auth = {
      sessionId: session.id,
      csrfToken: session.csrfToken,
      user: {
        id: session.user.id,
        email: session.user.email,
        username: session.user.username,
        role: session.user.role,
        status: session.user.status,
        emailVerifiedAt: session.user.emailVerifiedAt,
        suspendedUntil: session.user.suspendedUntil,
        banReason: session.user.banReason,
      },
    };

    // Enforce CSRF token header on authenticated state-changing requests
    if (MUTATION_METHODS.has(request.method)) {
      const urlPath = request.url.split("?")[0] ?? "";
      const isExempt = CSRF_EXEMPT_PREFIXES.some((prefix) => urlPath === prefix);
      if (!isExempt) {
        const headerToken = request.headers["x-csrf-token"];
        if (typeof headerToken !== "string" || headerToken !== session.csrfToken) {
          throw forbidden("Invalid or missing CSRF token.", "INVALID_CSRF_TOKEN");
        }
      }
    }
  });
};

export const authPlugin = fp(authPluginImpl, { name: "skyhop-auth" });

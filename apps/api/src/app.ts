import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { prisma } from "@skyhop/database";
import { getEnv } from "./config/env.js";
import { authPlugin } from "./plugins/auth.js";
import { registerErrorHandler } from "./plugins/errorHandler.js";
import { adminRoutes } from "./routes/admin.routes.js";
import { authRoutes } from "./routes/auth.routes.js";
import { friendsRoutes } from "./routes/friends.routes.js";
import { gameRoutes } from "./routes/game.routes.js";
import { leaderboardsRoutes } from "./routes/leaderboards.routes.js";
import { progressionRoutes } from "./routes/progression.routes.js";
import { shopRoutes } from "./routes/shop.routes.js";
import { usersRoutes } from "./routes/users.routes.js";

export interface BuildAppOptions {
  logger?: boolean;
  rateLimitMax?: number;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const env = getEnv();

  const app = Fastify({
    logger: options.logger ?? env.NODE_ENV === "development",
    trustProxy: true,
    bodyLimit: 512 * 1024, // 512KB max JSON payload (strict replay cap protection)
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  });

  const allowedOrigins = env.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean);
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (
        allowedOrigins.includes(origin) ||
        (process.env.VERCEL_URL && origin === `https://${process.env.VERCEL_URL}`) ||
        (process.env.VERCEL_PROJECT_PRODUCTION_URL &&
          origin === `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
      ) {
        return cb(null, true);
      }
      return cb(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-CSRF-Token"],
  });

  await app.register(cookie, {
    secret: env.SESSION_SECRET,
  });

  await app.register(rateLimit, {
    max: options.rateLimitMax ?? (env.NODE_ENV === "test" ? 1000 : env.RATE_LIMIT_MAX),
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
  });

  registerErrorHandler(app);
  await app.register(authPlugin);

  // Health & Readiness check
  app.get("/api/health", async (_request, reply) => {
    await prisma.$queryRaw`SELECT 1`;
    return reply.send({
      status: "ok",
      service: "skyhop-api",
      timestamp: new Date().toISOString(),
    });
  });

  // Register domain routes
  await authRoutes(app);
  await usersRoutes(app);
  await gameRoutes(app);
  await leaderboardsRoutes(app);
  await shopRoutes(app);
  await progressionRoutes(app);
  await friendsRoutes(app);
  await adminRoutes(app);

  return app;
}

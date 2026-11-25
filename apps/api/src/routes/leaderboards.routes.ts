import type { FastifyInstance } from "fastify";
import { leaderboardQuerySchema } from "@skyhop/shared";
import { queryLeaderboard } from "../services/leaderboard.service.js";

export async function leaderboardsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/api/leaderboards", async (request, reply) => {
    const query = leaderboardQuerySchema.parse(request.query);
    const result = await queryLeaderboard({
      board: query.board,
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      viewerUserId: request.auth?.user.id ?? null,
    });
    return reply.send(result);
  });
}

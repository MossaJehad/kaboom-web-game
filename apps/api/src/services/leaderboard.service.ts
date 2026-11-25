import { prisma, Prisma } from "@skyhop/database";
import type { GameModeSlug, LeaderboardEntryDTO } from "@skyhop/shared";
import { getOrCreateTodayDailyChallenge } from "./game.service.js";
import { getUtcDateKey } from "../utils/crypto.js";

export type LeaderboardBoardType =
  | "all_time"
  | "monthly"
  | "weekly"
  | "daily"
  | "daily_challenge"
  | "hardcore"
  | "friends";

interface RawLeaderboardRow {
  rank: bigint;
  userId: string;
  username: string;
  displayName: string;
  avatarSlug: string;
  frameSlug: string;
  equippedBirdSlug: string;
  score: number;
  achievedAt: Date;
  modeSlug: string;
}

export async function queryLeaderboard(params: {
  board: LeaderboardBoardType;
  page: number;
  pageSize: number;
  search?: string;
  viewerUserId: string | null;
}) {
  const { board, page, pageSize, search, viewerUserId } = params;
  const offset = (page - 1) * pageSize;

  const conditions: Prisma.Sql[] = [
    Prisma.sql`gr."isVerified" = true`,
    Prisma.sql`gr."isInvalidated" = false`,
    Prisma.sql`u."status" != 'BANNED'`,
    Prisma.sql`u."deletedAt" IS NULL`,
  ];

  // Mode & timeframe filters (Zen NEVER enters competitive leaderboards)
  if (board === "hardcore") {
    conditions.push(Prisma.sql`gr."modeSlug" = 'hardcore'`);
  } else if (board === "daily_challenge") {
    const todayChallenge = await getOrCreateTodayDailyChallenge();
    conditions.push(Prisma.sql`gr."modeSlug" = 'daily_challenge'`);
    conditions.push(Prisma.sql`gr."dailyChallengeId" = ${todayChallenge.id}`);
  } else {
    // Classic competitive rankings for all_time, monthly, weekly, daily, friends
    conditions.push(Prisma.sql`gr."modeSlug" = 'classic'`);
  }

  const now = new Date();
  if (board === "daily") {
    const startOfDay = new Date(`${getUtcDateKey(now)}T00:00:00.000Z`);
    conditions.push(Prisma.sql`gr."createdAt" >= ${startOfDay}`);
  } else if (board === "weekly") {
    const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    conditions.push(Prisma.sql`gr."createdAt" >= ${startOfWeek}`);
  } else if (board === "monthly") {
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    conditions.push(Prisma.sql`gr."createdAt" >= ${startOfMonth}`);
  } else if (board === "friends") {
    if (!viewerUserId) {
      return {
        board,
        entries: [] as LeaderboardEntryDTO[],
        total: 0,
        page,
        pageSize,
        totalPages: 0,
        personalEntry: null as LeaderboardEntryDTO | null,
      };
    }
    const friendships = await prisma.friendship.findMany({
      where: { OR: [{ userAId: viewerUserId }, { userBId: viewerUserId }] },
      select: { userAId: true, userBId: true },
    });
    const friendIds = new Set<string>([viewerUserId]);
    for (const f of friendships) {
      friendIds.add(f.userAId);
      friendIds.add(f.userBId);
    }
    conditions.push(Prisma.sql`gr."userId" IN (${Prisma.join(Array.from(friendIds))})`);
  }

  const whereClause = Prisma.join(conditions, " AND ");
  const searchPattern = search ? `%${search.toLowerCase()}%` : null;
  const searchClause = searchPattern
    ? Prisma.sql`WHERE r."usernameLower" LIKE ${searchPattern}`
    : Prisma.empty;

  // Best verified run per user with deterministic tie-breaking:
  // 1) Highest verifiedScore DESC
  // 2) Earliest achievedAt ASC (first to achieve the score ranks higher!)
  // 3) userId ASC (final deterministic tiebreaker)
  const rows = await prisma.$queryRaw<RawLeaderboardRow[]>`
    WITH best_per_user AS (
      SELECT DISTINCT ON (gr."userId")
        gr."userId",
        gr."verifiedScore" AS "score",
        gr."createdAt" AS "achievedAt",
        gr."equippedBirdSlug",
        gr."modeSlug",
        u."username",
        u."usernameLower",
        COALESCE(up."displayName", u."username") AS "displayName",
        COALESCE(ec."avatarSlug", 'avatar-sparrow-pilot') AS "avatarSlug",
        COALESCE(ec."frameSlug", 'frame-classic-brass') AS "frameSlug"
      FROM "GameResult" gr
      JOIN "User" u ON u."id" = gr."userId"
      LEFT JOIN "UserProfile" up ON up."userId" = u."id"
      LEFT JOIN "EquippedCosmetics" ec ON ec."userId" = u."id"
      WHERE ${whereClause}
      ORDER BY gr."userId", gr."verifiedScore" DESC, gr."createdAt" ASC
    ),
    ranked AS (
      SELECT
        ROW_NUMBER() OVER (ORDER BY "score" DESC, "achievedAt" ASC, "userId" ASC) AS "rank",
        *
      FROM best_per_user
    )
    SELECT
      "rank", "userId", "username", "displayName", "avatarSlug", "frameSlug",
      "equippedBirdSlug", "score", "achievedAt", "modeSlug"
    FROM ranked r
    ${searchClause}
    ORDER BY "rank" ASC
    LIMIT ${pageSize} OFFSET ${offset}
  `;

  const countRows = await prisma.$queryRaw<Array<{ total: bigint }>>`
    WITH best_per_user AS (
      SELECT DISTINCT ON (gr."userId")
        gr."userId",
        u."usernameLower"
      FROM "GameResult" gr
      JOIN "User" u ON u."id" = gr."userId"
      WHERE ${whereClause}
      ORDER BY gr."userId", gr."verifiedScore" DESC, gr."createdAt" ASC
    )
    SELECT COUNT(*)::bigint AS "total"
    FROM best_per_user r
    ${searchClause}
  `;

  const total = Number(countRows[0]?.total ?? 0n);

  let personalEntry: LeaderboardEntryDTO | null = null;
  if (viewerUserId) {
    const personalRows = await prisma.$queryRaw<RawLeaderboardRow[]>`
      WITH best_per_user AS (
        SELECT DISTINCT ON (gr."userId")
          gr."userId",
          gr."verifiedScore" AS "score",
          gr."createdAt" AS "achievedAt",
          gr."equippedBirdSlug",
          gr."modeSlug",
          u."username",
          COALESCE(up."displayName", u."username") AS "displayName",
          COALESCE(ec."avatarSlug", 'avatar-sparrow-pilot') AS "avatarSlug",
          COALESCE(ec."frameSlug", 'frame-classic-brass') AS "frameSlug"
        FROM "GameResult" gr
        JOIN "User" u ON u."id" = gr."userId"
        LEFT JOIN "UserProfile" up ON up."userId" = u."id"
        LEFT JOIN "EquippedCosmetics" ec ON ec."userId" = u."id"
        WHERE ${whereClause}
        ORDER BY gr."userId", gr."verifiedScore" DESC, gr."createdAt" ASC
      ),
      ranked AS (
        SELECT
          ROW_NUMBER() OVER (ORDER BY "score" DESC, "achievedAt" ASC, "userId" ASC) AS "rank",
          *
        FROM best_per_user
      )
      SELECT
        "rank", "userId", "username", "displayName", "avatarSlug", "frameSlug",
        "equippedBirdSlug", "score", "achievedAt", "modeSlug"
      FROM ranked
      WHERE "userId" = ${viewerUserId}
      LIMIT 1
    `;
    const p = personalRows[0];
    if (p) {
      personalEntry = {
        rank: Number(p.rank),
        userId: p.userId,
        username: p.username,
        displayName: p.displayName,
        avatarSlug: p.avatarSlug,
        frameSlug: p.frameSlug,
        equippedBirdSlug: p.equippedBirdSlug,
        score: p.score,
        achievedAt: new Date(p.achievedAt).toISOString(),
        modeSlug: p.modeSlug as GameModeSlug,
      };
    }
  }

  return {
    board,
    entries: rows.map((r) => ({
      rank: Number(r.rank),
      userId: r.userId,
      username: r.username,
      displayName: r.displayName,
      avatarSlug: r.avatarSlug,
      frameSlug: r.frameSlug,
      equippedBirdSlug: r.equippedBirdSlug,
      score: r.score,
      achievedAt: new Date(r.achievedAt).toISOString(),
      modeSlug: r.modeSlug as GameModeSlug,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    personalEntry,
  };
}

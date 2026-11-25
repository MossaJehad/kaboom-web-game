import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { LeaderboardEntryDTO } from "@skyhop/shared";
import { apiRequest } from "../api/client.js";
import { audioManager } from "../audio/audioManager.js";
import { Layout } from "../components/Layout.js";
import { LoadingScreen } from "../components/LoadingScreen.js";
import { useApp } from "../store/AppContext.js";

const BOARDS = [
  { id: "all_time", label: "All-Time" },
  { id: "monthly", label: "Monthly" },
  { id: "weekly", label: "Weekly" },
  { id: "daily", label: "Daily" },
  { id: "daily_challenge", label: "Daily Challenge" },
  { id: "hardcore", label: "Hardcore" },
  { id: "friends", label: "Friends" },
] as const;

interface LeaderboardResponse {
  board: string;
  entries: LeaderboardEntryDTO[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  personalEntry: LeaderboardEntryDTO | null;
}

export function LeaderboardsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useApp();
  const initialBoard = searchParams.get("board") || "all_time";

  const [board, setBoard] = useState(initialBoard);
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBoard = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        board,
        page: String(page),
        pageSize: "20",
      });
      if (submittedSearch.trim()) {
        params.set("search", submittedSearch.trim());
      }
      const res = await apiRequest<LeaderboardResponse>(`/api/leaderboards?${params.toString()}`);
      setData(res);
    } finally {
      setLoading(false);
    }
  }, [board, page, submittedSearch]);

  useEffect(() => {
    void fetchBoard();
  }, [fetchBoard]);

  const selectBoard = (id: string) => {
    void audioManager.playSfx("click");
    setBoard(id);
    setPage(1);
    setSearchParams({ board: id });
  };

  return (
    <Layout>
      <div className="space-y-5">
        <div className="pixel-panel p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-arcade-title text-lg text-[#f5b935]">VERIFIED LEADERBOARDS</h1>
            <p className="text-xs text-[#b8c2dc] mt-1">
              Every score is deterministically re-simulated on the backend. Earlier timestamps win ties.
            </p>
          </div>
          <Link to="/play/classic" className="pixel-btn pixel-btn-green text-xs">
            Compete Now
          </Link>
        </div>

        {/* Board Tabs */}
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Leaderboard boards">
          {BOARDS.map((b) => (
            <button
              key={b.id}
              type="button"
              data-testid={`lb-tab-${b.id}`}
              onClick={() => selectBoard(b.id)}
              className={`px-3 py-1.5 text-xs border-2 border-[#0a0d1a] cursor-pointer ${
                board === b.id
                  ? "bg-[#f5b935] text-[#121629] font-bold"
                  : "bg-[#1c2340] hover:bg-[#273158]"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>

        {/* Search & Personal Rank Banner */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setSubmittedSearch(search);
            }}
            className="lg:col-span-5 flex gap-2"
          >
            <input
              type="text"
              placeholder="Search username..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pixel-input text-xs"
            />
            <button type="submit" className="pixel-btn pixel-btn-secondary text-xs shrink-0">
              Search
            </button>
          </form>

          <div className="lg:col-span-7 pixel-panel p-3 flex items-center justify-between gap-3 text-xs">
            <span className="text-[#b8c2dc] uppercase text-[10px]">YOUR STANDING</span>
            {user ? (
              data?.personalEntry ? (
                <div data-testid="personal-rank-banner" className="flex items-center gap-3">
                  <span className="font-arcade-title text-sm text-[#f5b935]">
                    #{data.personalEntry.rank}
                  </span>
                  <span>{data.personalEntry.username}</span>
                  <span className="font-bold text-[#3ac463]">{data.personalEntry.score} PTS</span>
                </div>
              ) : (
                <span className="text-[#b8c2dc]">No verified run on this board yet.</span>
              )
            ) : (
              <Link to="/login" className="text-[#f5b935] underline">
                Log in to track your rank
              </Link>
            )}
          </div>
        </div>

        {/* Standings Table */}
        {loading ? (
          <LoadingScreen label="LOADING RANKINGS..." />
        ) : !data || data.entries.length === 0 ? (
          <div className="pixel-panel p-10 text-center space-y-3" data-testid="leaderboard-empty">
            <h2 className="font-arcade-title text-sm text-[#f5b935]">NO VERIFIED SCORES YET</h2>
            <p className="text-xs text-[#b8c2dc] max-w-md mx-auto">
              {board === "friends" && !user
                ? "Sign in and add friends to compare verified scores on your Friends leaderboard."
                : "SKYHOP never displays fake or bot scores. Play a verified round to claim the #1 spot!"}
            </p>
            <Link to={`/play/${board === "hardcore" ? "hardcore" : board === "daily_challenge" ? "daily_challenge" : "classic"}`} className="pixel-btn pixel-btn-green text-xs">
              Claim #1 Now
            </Link>
          </div>
        ) : (
          <div className="pixel-panel overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#141930] border-b-2 border-[#0a0d1a] text-[#b8c2dc] uppercase text-[10px]">
                  <th className="p-3">Rank</th>
                  <th className="p-3">Pilot</th>
                  <th className="p-3">Bird</th>
                  <th className="p-3 text-right">Score</th>
                  <th className="p-3 text-right hidden sm:table-cell">Achieved</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((entry) => {
                  const isMe = user?.id === entry.userId;
                  const topClass =
                    entry.rank === 1
                      ? "bg-[#f5b935]/15"
                      : entry.rank === 2
                        ? "bg-[#cbd5e1]/10"
                        : entry.rank === 3
                          ? "bg-[#d97706]/10"
                          : "";
                  return (
                    <tr
                      key={`${entry.userId}-${entry.rank}`}
                      data-testid={`lb-row-${entry.username}`}
                      className={`border-b border-[#0a0d1a]/60 ${topClass} ${isMe ? "outline-2 outline-[#3ac463]" : ""}`}
                    >
                      <td className="p-3 font-arcade-title text-xs">
                        <span
                          className={
                            entry.rank === 1
                              ? "text-[#f5b935]"
                              : entry.rank === 2
                                ? "text-[#e2e8f0]"
                                : entry.rank === 3
                                  ? "text-[#fb923c]"
                                  : "text-[#b8c2dc]"
                          }
                        >
                          #{entry.rank}
                        </span>
                      </td>
                      <td className="p-3">
                        <Link
                          to={`/players/${entry.username}`}
                          className="flex items-center gap-2.5 hover:text-[#f5b935]"
                        >
                          <img
                            src={`/assets/avatars/${entry.avatarSlug}.png`}
                            alt={entry.username}
                            className="w-8 h-8 pixel-art border-2 border-[#0a0d1a]"
                          />
                          <div>
                            <div className="font-bold">{entry.displayName}</div>
                            <div className="text-[10px] text-[#b8c2dc]">@{entry.username}</div>
                          </div>
                        </Link>
                      </td>
                      <td className="p-3">
                        <img
                          src={`/assets/birds/${entry.equippedBirdSlug}-preview.png`}
                          alt={entry.equippedBirdSlug}
                          title={entry.equippedBirdSlug}
                          className="w-10 h-8 pixel-art object-contain"
                        />
                      </td>
                      <td className="p-3 text-right font-arcade-title text-sm text-[#3ac463]">
                        {entry.score}
                      </td>
                      <td className="p-3 text-right text-[#b8c2dc] hidden sm:table-cell">
                        {new Date(entry.achievedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {data.totalPages > 1 && (
              <div className="p-3 flex items-center justify-between border-t-2 border-[#0a0d1a] text-xs">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="pixel-btn pixel-btn-secondary text-[11px]"
                >
                  Prev
                </button>
                <span>
                  Page {data.page} of {data.totalPages} ({data.total} pilots)
                </span>
                <button
                  type="button"
                  disabled={page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="pixel-btn pixel-btn-secondary text-[11px]"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}

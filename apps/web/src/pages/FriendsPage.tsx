import React, { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiRequest, ApiClientError } from "../api/client.js";
import { Layout } from "../components/Layout.js";
import { LoadingScreen } from "../components/LoadingScreen.js";
import { useApp } from "../store/AppContext.js";

interface FriendsPayload {
  friends: Array<{
    userId: string;
    username: string;
    displayName: string;
    title: string | null;
    level: number;
    classicHighScore: number | null;
    hardcoreHighScore: number | null;
    avatarSlug: string;
    equippedBirdSlug: string;
    since: string;
  }>;
  incomingRequests: Array<{
    id: string;
    fromUserId: string;
    username: string;
    displayName: string;
    level: number;
    avatarSlug: string;
  }>;
  outgoingRequests: Array<{
    id: string;
    toUserId: string;
    username: string;
    displayName: string;
  }>;
  blockedUsers: Array<{
    userId: string;
    username: string;
    displayName: string;
  }>;
}

interface SearchPlayer {
  id: string;
  username: string;
  displayName: string;
  level: number;
  highestScore: number | null;
  avatarSlug: string;
}

interface CompareStats {
  me: { username: string; level: number; classicHighScore: number; hardcoreHighScore: number; dailyHighScore: number; totalGames: number; totalObstaclesPassed: number };
  opponent: { username: string; level: number; classicHighScore: number; hardcoreHighScore: number; dailyHighScore: number; totalGames: number; totalObstaclesPassed: number };
}

export function FriendsPage() {
  const { user, pushToast } = useApp();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<FriendsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchPlayer[]>([]);
  const [comparison, setComparison] = useState<CompareStats | null>(null);

  const userId = user?.id ?? null;

  const loadFriends = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest<FriendsPayload>("/api/friends");
      setData(res);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadFriends();
  }, [loadFriends]);

  const compareWith = useCallback(
    async (username: string) => {
      try {
        const res = await apiRequest<{ comparison: CompareStats }>(
          `/api/friends/compare/${encodeURIComponent(username)}`
        );
        setComparison(res.comparison);
      } catch (err) {
        pushToast(err instanceof ApiClientError ? err.message : "Could not compare records.", "error");
      }
    },
    [pushToast]
  );

  useEffect(() => {
    const target = searchParams.get("compare");
    if (target && user) {
      void compareWith(target);
    }
  }, [searchParams, user, compareWith]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length < 2) return;
    const res = await apiRequest<{ players: SearchPlayer[] }>(
      `/api/users/search?q=${encodeURIComponent(query.trim())}`
    );
    setResults(res.players);
  };

  const sendRequest = async (username: string) => {
    try {
      await apiRequest("/api/friends/requests", { method: "POST", body: { username } });
      pushToast(`Friend request sent to ${username}!`, "success");
      await loadFriends();
    } catch (err) {
      pushToast(err instanceof ApiClientError ? err.message : "Failed to send request.", "error");
    }
  };

  const acceptReq = async (id: string) => {
    await apiRequest(`/api/friends/requests/${id}/accept`, { method: "POST" });
    pushToast("Friend request accepted!", "success");
    await loadFriends();
  };

  const rejectReq = async (id: string) => {
    await apiRequest(`/api/friends/requests/${id}/reject`, { method: "POST" });
    pushToast("Request dismissed.", "info");
    await loadFriends();
  };

  const removeFriend = async (friendUserId: string) => {
    await apiRequest(`/api/friends/${friendUserId}`, { method: "DELETE" });
    pushToast("Friend removed.", "info");
    await loadFriends();
  };

  const blockPlayer = async (username: string) => {
    await apiRequest("/api/friends/block", { method: "POST", body: { username } });
    pushToast(`Blocked ${username}.`, "warning");
    await loadFriends();
  };

  const unblockPlayer = async (blockedUserId: string) => {
    await apiRequest(`/api/friends/block/${blockedUserId}`, { method: "DELETE" });
    pushToast("Player unblocked.", "info");
    await loadFriends();
  };

  if (!user) {
    return (
      <Layout>
        <div className="pixel-panel max-w-md mx-auto p-6 text-center space-y-4">
          <h1 className="font-arcade-title text-base text-[#f5b935]">FRIENDS &amp; RIVALS</h1>
          <p className="text-xs text-[#b8c2dc]">Sign in to add friends, compare records, and compete on Friends Leaderboards.</p>
          <Link to="/login" className="pixel-btn pixel-btn-primary text-xs">Sign In</Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-5">
        <div className="pixel-panel p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-arcade-title text-lg text-[#f5b935]">FRIENDS &amp; RIVALS</h1>
            <p className="text-xs text-[#b8c2dc] mt-1">
              Find flyers, compare verified high scores, and battle on the Friends Leaderboard.
            </p>
          </div>
          <Link to="/leaderboards?board=friends" className="pixel-btn pixel-btn-sky text-xs">
            Friends Leaderboard
          </Link>
        </div>

        {/* Search Players */}
        <div className="pixel-panel p-4 space-y-3">
          <h2 className="font-arcade-title text-xs text-[#38a3f1]">FIND PILOTS</h2>
          <form onSubmit={handleSearch} className="flex gap-2 max-w-lg">
            <input
              type="text"
              placeholder="Search username (min 2 chars)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pixel-input text-xs"
            />
            <button type="submit" className="pixel-btn pixel-btn-primary text-xs shrink-0">
              Search
            </button>
          </form>

          {results.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-2">
              {results.map((p) => (
                <div key={p.id} className="pixel-panel-inset p-3 flex items-center justify-between gap-2 text-xs">
                  <Link to={`/players/${p.username}`} className="flex items-center gap-2 min-w-0">
                    <img src={`/assets/avatars/${p.avatarSlug}.png`} alt={p.username} className="w-8 h-8 pixel-art" />
                    <div className="truncate">
                      <div className="font-bold truncate">{p.displayName}</div>
                      <div className="text-[10px] text-[#b8c2dc]">@{p.username} &bull; LV {p.level}</div>
                    </div>
                  </Link>
                  <div className="flex gap-1 shrink-0">
                    <button type="button" onClick={() => void sendRequest(p.username)} className="pixel-btn pixel-btn-green text-[10px] px-2 py-1">
                      Add
                    </button>
                    <button type="button" onClick={() => void blockPlayer(p.username)} className="pixel-btn pixel-btn-red text-[10px] px-2 py-1">
                      Block
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Record Comparison Modal/Panel */}
        {comparison && (
          <div className="pixel-panel p-4 space-y-3 border-[#38a3f1]">
            <div className="flex items-center justify-between">
              <h2 className="font-arcade-title text-xs text-[#38a3f1]">
                HEAD-TO-HEAD: {comparison.me.username} VS {comparison.opponent.username}
              </h2>
              <button type="button" onClick={() => setComparison(null)} className="text-xs underline cursor-pointer">
                Close
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs text-center">
              <div className="font-bold text-[#f5b935]">{comparison.me.username}</div>
              <div className="text-[#b8c2dc]">STAT</div>
              <div className="font-bold text-[#38a3f1]">{comparison.opponent.username}</div>
              {[
                ["Level", comparison.me.level, comparison.opponent.level],
                ["Classic Best", comparison.me.classicHighScore, comparison.opponent.classicHighScore],
                ["Hardcore Best", comparison.me.hardcoreHighScore, comparison.opponent.hardcoreHighScore],
                ["Daily Best", comparison.me.dailyHighScore, comparison.opponent.dailyHighScore],
                ["Total Games", comparison.me.totalGames, comparison.opponent.totalGames],
                ["Total Obstacles", comparison.me.totalObstaclesPassed, comparison.opponent.totalObstaclesPassed],
              ].map(([label, a, b]) => (
                <React.Fragment key={String(label)}>
                  <div className={`pixel-panel-inset py-1.5 ${Number(a) >= Number(b) ? "text-[#3ac463] font-bold" : ""}`}>{a}</div>
                  <div className="py-1.5 text-[#b8c2dc]">{label}</div>
                  <div className={`pixel-panel-inset py-1.5 ${Number(b) >= Number(a) ? "text-[#3ac463] font-bold" : ""}`}>{b}</div>
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {loading || !data ? (
          <LoadingScreen label="LOADING FRIENDS LIST..." />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Friends Roster */}
            <div className="lg:col-span-7 pixel-panel p-4 space-y-3">
              <h2 className="font-arcade-title text-xs text-[#3ac463]">FRIENDS ({data.friends.length})</h2>
              {data.friends.length === 0 ? (
                <p className="text-xs text-[#b8c2dc]">No friends added yet. Search for a pilot above!</p>
              ) : (
                <div className="space-y-2.5">
                  {data.friends.map((f) => (
                    <div key={f.userId} className="pixel-panel-inset p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <Link to={`/players/${f.username}`} className="flex items-center gap-2.5">
                        <img src={`/assets/avatars/${f.avatarSlug}.png`} alt={f.username} className="w-10 h-10 pixel-art border border-[#0a0d1a]" />
                        <div>
                          <div className="font-bold">{f.displayName} <span className="text-[#38a3f1]">LV {f.level}</span></div>
                          <div className="text-[10px] text-[#b8c2dc]">
                            @{f.username} &bull; Classic Best: {f.classicHighScore ?? "Hidden"}
                          </div>
                        </div>
                      </Link>
                      <div className="flex gap-1.5">
                        <button type="button" onClick={() => void compareWith(f.username)} className="pixel-btn pixel-btn-sky text-[10px] px-2 py-1">
                          Compare
                        </button>
                        <button type="button" onClick={() => void removeFriend(f.userId)} className="pixel-btn pixel-btn-secondary text-[10px] px-2 py-1">
                          Remove
                        </button>
                        <button type="button" onClick={() => void blockPlayer(f.username)} className="pixel-btn pixel-btn-red text-[10px] px-2 py-1">
                          Block
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Requests & Blocked */}
            <div className="lg:col-span-5 space-y-4">
              <div className="pixel-panel p-4 space-y-3">
                <h2 className="font-arcade-title text-xs text-[#f5b935]">
                  INCOMING REQUESTS ({data.incomingRequests.length})
                </h2>
                {data.incomingRequests.length === 0 ? (
                  <p className="text-xs text-[#b8c2dc]">No pending incoming requests.</p>
                ) : (
                  data.incomingRequests.map((r) => (
                    <div key={r.id} className="pixel-panel-inset p-2.5 flex items-center justify-between text-xs">
                      <span>@{r.username} (LV {r.level})</span>
                      <div className="flex gap-1.5">
                        <button type="button" onClick={() => void acceptReq(r.id)} className="pixel-btn pixel-btn-green text-[10px] px-2 py-1">Accept</button>
                        <button type="button" onClick={() => void rejectReq(r.id)} className="pixel-btn pixel-btn-red text-[10px] px-2 py-1">Reject</button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="pixel-panel p-4 space-y-3">
                <h2 className="font-arcade-title text-xs text-[#b8c2dc]">
                  OUTGOING ({data.outgoingRequests.length}) &amp; BLOCKED ({data.blockedUsers.length})
                </h2>
                {data.outgoingRequests.map((r) => (
                  <div key={r.id} className="pixel-panel-inset p-2 flex items-center justify-between text-xs">
                    <span>Pending: @{r.username}</span>
                    <button type="button" onClick={() => void rejectReq(r.id)} className="pixel-btn pixel-btn-secondary text-[10px] px-2 py-0.5">Cancel</button>
                  </div>
                ))}
                {data.blockedUsers.map((b) => (
                  <div key={b.userId} className="pixel-panel-inset p-2 flex items-center justify-between text-xs">
                    <span>Blocked: @{b.username}</span>
                    <button type="button" onClick={() => void unblockPlayer(b.userId)} className="pixel-btn pixel-btn-secondary text-[10px] px-2 py-0.5">Unblock</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

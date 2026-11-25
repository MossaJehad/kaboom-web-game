import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest, ApiClientError } from "../api/client.js";
import { audioManager } from "../audio/audioManager.js";
import { Layout } from "../components/Layout.js";
import { LoadingScreen } from "../components/LoadingScreen.js";
import { useApp } from "../store/AppContext.js";

interface AchievementRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  iconKey: string;
  targetValue: number;
  rewardCoins: number;
  rewardXp: number;
  rewardTitle: string | null;
  progress: number;
  unlocked: boolean;
  unlockedAt: string | null;
  claimed: boolean;
  claimedAt: string | null;
}

const ICON_BADGES: Record<string, string> = {
  wing: "WNG",
  star: "STR",
  medal: "MDL",
  trophy: "TRP",
  crown: "CRN",
  flame: "FLM",
  leaf: "ZEN",
  gamepad: "PLY",
  pillar: "GAP",
  calendar: "DAY",
  bolt: "CBK",
  bag: "SHP",
  bird: "BRD",
  map: "MAP",
  globe: "WLD",
  coin: "CIN",
  level: "LVL",
  friends: "FRD",
};

export function AchievementsPage() {
  const { user, pushToast, updateWalletBalanceLocal, refreshUser } = useApp();
  const [rows, setRows] = useState<AchievementRow[]>([]);
  const [category, setCategory] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);

  const userId = user?.id ?? null;

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest<{ achievements: AchievementRow[] }>("/api/achievements");
      setRows(res.achievements);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = useMemo(
    () => ["ALL", ...Array.from(new Set(rows.map((r) => r.category)))],
    [rows]
  );

  const filtered = useMemo(
    () => rows.filter((r) => category === "ALL" || r.category === category),
    [rows, category]
  );

  const unlockedCount = rows.filter((r) => r.unlocked).length;

  const handleClaim = async (slug: string) => {
    setClaiming(slug);
    try {
      const res = await apiRequest<{
        coinsAwarded: number;
        xpAwarded: number;
        newWalletBalance: number;
      }>(`/api/achievements/${slug}/claim`, { method: "POST" });
      void audioManager.playSfx("achievement");
      updateWalletBalanceLocal(res.newWalletBalance);
      setRows((prev) =>
        prev.map((r) => (r.slug === slug ? { ...r, claimed: true, claimedAt: new Date().toISOString() } : r))
      );
      pushToast(`Claimed +${res.coinsAwarded} Coins & +${res.xpAwarded} XP!`, "success");
      void refreshUser();
    } catch (err) {
      pushToast(err instanceof ApiClientError ? err.message : "Could not claim reward.", "error");
    } finally {
      setClaiming(null);
    }
  };

  if (!user) {
    return (
      <Layout>
        <div className="pixel-panel max-w-md mx-auto p-6 text-center space-y-4">
          <h1 className="font-arcade-title text-base text-[#f5b935]">ACHIEVEMENTS</h1>
          <p className="text-xs text-[#b8c2dc]">Sign in to track 32 milestones and claim up to 250 coins each.</p>
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
            <h1 className="font-arcade-title text-lg text-[#f5b935]">TROPHY ROOM ({unlockedCount}/{rows.length})</h1>
            <p className="text-xs text-[#b8c2dc] mt-1">
              Complete arcade milestones to unlock bonus Coins, XP, and exclusive player titles.
            </p>
          </div>
          <Link to="/play/classic" className="pixel-btn pixel-btn-green text-xs">Play to Unlock</Link>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`px-2.5 py-1 text-xs border-2 border-[#0a0d1a] cursor-pointer ${
                category === cat ? "bg-[#f5b935] text-[#121629] font-bold" : "bg-[#1c2340]"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {loading ? (
          <LoadingScreen label="LOADING ACHIEVEMENTS..." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filtered.map((a) => {
              const pct = Math.min(100, Math.round((a.progress / Math.max(1, a.targetValue)) * 100));
              return (
                <div
                  key={a.id}
                  data-testid={`achievement-${a.slug}`}
                  className={`pixel-panel p-4 flex flex-col justify-between gap-3 ${
                    a.unlocked ? "border-[#f5b935]" : ""
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`w-10 h-10 flex items-center justify-center font-arcade-title text-[10px] border-2 border-[#0a0d1a] shrink-0 ${
                            a.unlocked ? "bg-[#f5b935] text-[#121629]" : "bg-[#141930] text-[#b8c2dc]"
                          }`}
                        >
                          {ICON_BADGES[a.iconKey] ?? "ACH"}
                        </span>
                        <div>
                          <h2 className="font-arcade-title text-xs text-[#fef8e6]">{a.name}</h2>
                          <span className="text-[10px] text-[#38a3f1]">{a.category}</span>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-[#f5b935] shrink-0">+{a.rewardCoins} C</span>
                    </div>

                    <p className="text-xs text-[#b8c2dc]">{a.description}</p>
                    {a.rewardTitle && (
                      <div className="text-[10px] text-[#3ac463]">Unlocks Title: &ldquo;{a.rewardTitle}&rdquo;</div>
                    )}

                    <div className="space-y-1 pt-1">
                      <div className="h-3 pixel-panel-inset overflow-hidden">
                        <div
                          className={a.unlocked ? "h-full bg-[#3ac463]" : "h-full bg-[#38a3f1]"}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-[#b8c2dc]">
                        <span>
                          {a.progress.toLocaleString()} / {a.targetValue.toLocaleString()}
                        </span>
                        <span>+{a.rewardXp} XP</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t-2 border-[#0a0d1a]">
                    {a.claimed ? (
                      <div className="text-center text-[11px] text-[#3ac463] font-bold">
                        CLAIMED {a.unlockedAt ? `(${new Date(a.unlockedAt).toLocaleDateString()})` : ""}
                      </div>
                    ) : a.unlocked ? (
                      <button
                        type="button"
                        data-testid={`claim-achievement-${a.slug}`}
                        disabled={claiming === a.slug}
                        onClick={() => void handleClaim(a.slug)}
                        className="pixel-btn pixel-btn-primary text-xs w-full"
                      >
                        {claiming === a.slug ? "CLAIMING..." : `CLAIM +${a.rewardCoins} COINS`}
                      </button>
                    ) : (
                      <div className="text-center text-[11px] text-[#b8c2dc]">IN PROGRESS ({pct}%)</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}

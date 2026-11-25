import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest, ApiClientError } from "../api/client.js";
import { audioManager } from "../audio/audioManager.js";
import { Layout } from "../components/Layout.js";
import { LoadingScreen } from "../components/LoadingScreen.js";
import { useApp } from "../store/AppContext.js";

interface MissionItem {
  id: string;
  slug: string;
  name: string;
  description: string;
  cadence: "DAILY" | "WEEKLY";
  targetValue: number;
  progress: number;
  rewardCoins: number;
  rewardXp: number;
  completed: boolean;
  claimed: boolean;
  expiresAt: string;
  msRemaining: number;
}

function formatTimer(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  return `${h}h ${m}m ${s % 60}s`;
}

export function MissionsPage() {
  const { user, pushToast, updateWalletBalanceLocal, refreshUser } = useApp();
  const [missions, setMissions] = useState<MissionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const userId = user?.id ?? null;

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest<{ missions: MissionItem[] }>("/api/missions");
      setMissions(res.missions);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = window.setInterval(() => {
      setMissions((prev) => prev.map((m) => ({ ...m, msRemaining: Math.max(0, m.msRemaining - 1000) })));
    }, 1000);
    return () => window.clearInterval(t);
  }, []);

  const handleClaim = async (id: string) => {
    setClaimingId(id);
    try {
      const res = await apiRequest<{
        coinsAwarded: number;
        xpAwarded: number;
        newWalletBalance: number;
      }>(`/api/missions/${id}/claim`, { method: "POST" });
      void audioManager.playSfx("coin");
      updateWalletBalanceLocal(res.newWalletBalance);
      setMissions((prev) => prev.map((m) => (m.id === id ? { ...m, claimed: true } : m)));
      pushToast(`Mission reward claimed: +${res.coinsAwarded} C & +${res.xpAwarded} XP!`, "success");
      void refreshUser();
    } catch (err) {
      pushToast(err instanceof ApiClientError ? err.message : "Could not claim mission.", "error");
    } finally {
      setClaimingId(null);
    }
  };

  if (!user) {
    return (
      <Layout>
        <div className="pixel-panel max-w-md mx-auto p-6 text-center space-y-4">
          <h1 className="font-arcade-title text-base text-[#f5b935]">DAILY &amp; WEEKLY MISSIONS</h1>
          <p className="text-xs text-[#b8c2dc]">Sign in to track rotating missions powered by verified gameplay.</p>
          <Link to="/login" className="pixel-btn pixel-btn-primary text-xs">Sign In</Link>
        </div>
      </Layout>
    );
  }

  const daily = missions.filter((m) => m.cadence === "DAILY");
  const weekly = missions.filter((m) => m.cadence === "WEEKLY");

  const renderGroup = (title: string, accent: string, list: MissionItem[]) => (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-arcade-title text-sm" style={{ color: accent }}>{title}</h2>
        {list[0] && (
          <span className="text-xs px-2 py-0.5 bg-[#141930] border border-[#0a0d1a] text-[#b8c2dc]">
            RESETS IN {formatTimer(list[0].msRemaining)}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {list.map((m) => {
          const pct = Math.min(100, Math.round((m.progress / Math.max(1, m.targetValue)) * 100));
          return (
            <div key={m.id} className="pixel-panel p-4 flex flex-col justify-between gap-3">
              <div className="space-y-2">
                <div className="flex justify-between gap-2">
                  <h3 className="font-arcade-title text-xs text-[#fef8e6]">{m.name}</h3>
                  <span className="text-xs font-bold text-[#f5b935] shrink-0">+{m.rewardCoins} C</span>
                </div>
                <p className="text-xs text-[#b8c2dc]">{m.description}</p>
                <div className="space-y-1 pt-1">
                  <div className="h-3 pixel-panel-inset overflow-hidden">
                    <div
                      className={m.completed ? "h-full bg-[#3ac463]" : "h-full bg-[#38a3f1]"}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-[#b8c2dc]">
                    <span>{m.progress} / {m.targetValue}</span>
                    <span>+{m.rewardXp} XP</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t-2 border-[#0a0d1a]">
                {m.claimed ? (
                  <div className="text-center text-xs text-[#3ac463] font-bold">CLAIMED</div>
                ) : m.completed ? (
                  <button
                    type="button"
                    disabled={claimingId === m.id}
                    onClick={() => void handleClaim(m.id)}
                    className="pixel-btn pixel-btn-primary text-xs w-full"
                  >
                    {claimingId === m.id ? "CLAIMING..." : "CLAIM REWARD"}
                  </button>
                ) : (
                  <Link to="/play/classic" className="pixel-btn pixel-btn-secondary text-[11px] w-full">
                    PLAY ({pct}%)
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );

  return (
    <Layout>
      <div className="space-y-6">
        <div className="pixel-panel p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-arcade-title text-lg text-[#f5b935]">MISSIONS BOARD</h1>
            <p className="text-xs text-[#b8c2dc] mt-1">
              Automatically rotating server-controlled objectives tracked from verified sessions.
            </p>
          </div>
          <Link to="/play/daily_challenge" className="pixel-btn pixel-btn-sky text-xs">
            Daily Challenge
          </Link>
        </div>

        {loading ? (
          <LoadingScreen label="LOADING MISSIONS..." />
        ) : (
          <>
            {renderGroup("DAILY MISSIONS", "#38a3f1", daily)}
            {renderGroup("WEEKLY MISSIONS", "#f5b935", weekly)}
          </>
        )}
      </div>
    </Layout>
  );
}

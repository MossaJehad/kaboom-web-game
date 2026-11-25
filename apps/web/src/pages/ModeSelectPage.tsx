import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { GameModeSlug } from "@skyhop/shared";
import { apiRequest } from "../api/client.js";
import { audioManager } from "../audio/audioManager.js";
import { Layout } from "../components/Layout.js";

interface ModeEntry {
  slug: GameModeSlug;
  name: string;
  description: string;
  isRanked: boolean;
  allowPause: boolean;
}

interface DailyInfo {
  challengeDate: string;
  targetScore: number;
  rewardCoins: number;
  rewardXp: number;
  msUntilReset: number;
  userCompletedToday: boolean;
  userBestToday: number;
}

const MODE_STYLE: Record<GameModeSlug, { badge: string; btn: string; difficulty: string }> = {
  classic: { badge: "bg-[#3ac463] text-[#091c0e]", btn: "pixel-btn-green", difficulty: "STANDARD" },
  hardcore: { badge: "bg-[#e84545] text-white", btn: "pixel-btn-red", difficulty: "EXTREME" },
  zen: { badge: "bg-[#38a3f1] text-[#081524]", btn: "pixel-btn-sky", difficulty: "RELAXED" },
  daily_challenge: { badge: "bg-[#f5b935] text-[#121629]", btn: "pixel-btn-primary", difficulty: "DAILY SEED" },
};

function fmtMs(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function ModeSelectPage() {
  const [modes, setModes] = useState<ModeEntry[]>([]);
  const [daily, setDaily] = useState<DailyInfo | null>(null);
  const [msLeft, setMsLeft] = useState(0);

  useEffect(() => {
    apiRequest<{ modes: ModeEntry[] }>("/api/game/modes")
      .then((res) => setModes(res.modes))
      .catch(() => {
        setModes([
          { slug: "classic", name: "Classic", description: "Traditional endless arcade flight.", isRanked: true, allowPause: true },
          { slug: "hardcore", name: "Hardcore", description: "Narrow gaps, high speed, no pausing.", isRanked: true, allowPause: false },
          { slug: "zen", name: "Zen", description: "Wide gaps and calm flight. Unranked.", isRanked: false, allowPause: true },
          { slug: "daily_challenge", name: "Daily Challenge", description: "One shared deterministic obstacle course every 24h.", isRanked: true, allowPause: false },
        ]);
      });

    apiRequest<{ dailyChallenge: DailyInfo }>("/api/game/daily-challenge")
      .then((res) => {
        setDaily(res.dailyChallenge);
        setMsLeft(res.dailyChallenge.msUntilReset);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!daily) return;
    const t = window.setInterval(() => setMsLeft((p) => Math.max(0, p - 1000)), 1000);
    return () => window.clearInterval(t);
  }, [daily]);

  return (
    <Layout>
      <div className="space-y-5">
        <div className="pixel-panel p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-arcade-title text-lg text-[#f5b935]">SELECT GAME MODE</h1>
            <p className="text-xs text-[#b8c2dc] mt-1">
              Each competitive mode runs an independent server-verified leaderboard and physics curve.
            </p>
          </div>
          <Link to="/leaderboards" className="pixel-btn pixel-btn-secondary text-xs">
            View Leaderboards
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {modes.map((m) => {
            const st = MODE_STYLE[m.slug] ?? MODE_STYLE.classic;
            return (
              <div key={m.slug} className="pixel-panel p-5 flex flex-col justify-between gap-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-arcade-title text-base text-[#fef8e6]">{m.name}</h2>
                    <span className={`px-2 py-0.5 text-[10px] font-bold border border-[#0a0d1a] ${st.badge}`}>
                      {st.difficulty}
                    </span>
                  </div>
                  <p className="text-xs text-[#b8c2dc] leading-relaxed">{m.description}</p>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="pixel-panel-inset px-2.5 py-1.5">
                      Ranking:{" "}
                      <strong className={m.isRanked ? "text-[#3ac463]" : "text-[#b8c2dc]"}>
                        {m.isRanked ? "COMPETITIVE" : "UNRANKED"}
                      </strong>
                    </div>
                    <div className="pixel-panel-inset px-2.5 py-1.5">
                      Pause:{" "}
                      <strong className={m.allowPause ? "text-[#38a3f1]" : "text-[#e84545]"}>
                        {m.allowPause ? "ALLOWED" : "DISABLED"}
                      </strong>
                    </div>
                  </div>

                  {m.slug === "daily_challenge" && daily && (
                    <div className="pixel-panel-inset p-3 text-xs space-y-1 border-l-4 border-[#f5b935]">
                      <div className="flex justify-between">
                        <span className="text-[#b8c2dc]">Challenge Date:</span>
                        <strong>{daily.challengeDate}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#b8c2dc]">Target Score:</span>
                        <strong className="text-[#f5b935]">{daily.targetScore} pts (+{daily.rewardCoins} C)</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#b8c2dc]">Next Reset:</span>
                        <strong className="text-[#38a3f1]">{fmtMs(msLeft)}</strong>
                      </div>
                    </div>
                  )}
                </div>

                <Link
                  to={`/play/${m.slug}`}
                  onClick={() => void audioManager.playSfx("click")}
                  data-testid={`launch-mode-${m.slug}`}
                  className={`pixel-btn ${st.btn} text-xs w-full py-2.5`}
                >
                  LAUNCH {m.name.toUpperCase()}
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}

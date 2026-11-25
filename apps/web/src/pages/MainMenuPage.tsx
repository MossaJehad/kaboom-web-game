import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../api/client.js";
import { audioManager } from "../audio/audioManager.js";
import { CosmeticPreviewStage } from "../components/CosmeticPreviewStage.js";
import { Layout } from "../components/Layout.js";
import { useApp } from "../store/AppContext.js";

interface DailyChallengeInfo {
  challengeDate: string;
  targetScore: number;
  rewardCoins: number;
  rewardXp: number;
  sceneSlug: string;
  nextResetAt: string;
  msUntilReset: number;
  userCompletedToday: boolean;
  userBestToday: number;
}

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function MainMenuPage() {
  const { user, activeLoadout, guestState } = useApp();
  const [daily, setDaily] = useState<DailyChallengeInfo | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);

  useEffect(() => {
    apiRequest<{ dailyChallenge: DailyChallengeInfo }>("/api/game/daily-challenge")
      .then((res) => {
        setDaily(res.dailyChallenge);
        setRemainingMs(res.dailyChallenge.msUntilReset);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!daily) return;
    const timer = window.setInterval(() => {
      setRemainingMs((prev) => Math.max(0, prev - 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [daily]);

  const clickSfx = () => void audioManager.playSfx("click");

  return (
    <Layout>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Arcade Marquee & Live Equipped Stage */}
        <section className="lg:col-span-7 pixel-panel p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#0a0d1a] pb-4">
            <div>
              <p className="text-[11px] uppercase text-[#38a3f1] tracking-widest">
                INSERT COIN &bull; KABOOM ENGINE
              </p>
              <h1 className="font-arcade-title text-2xl sm:text-3xl text-[#f5b935] mt-1">
                SKYHOP ARCADE
              </h1>
            </div>
            <span className="px-2.5 py-1 bg-[#141930] border-2 border-[#0a0d1a] text-xs text-[#3ac463]">
              60 TPS VERIFIED
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <CosmeticPreviewStage
              birdSlug={activeLoadout.birdSkin}
              sceneSlug={activeLoadout.scene}
              obstacleSlug={activeLoadout.obstacleSkin}
              groundSlug={activeLoadout.groundTexture}
              trailSlug={activeLoadout.particleTrail}
              width={320}
              height={210}
              className="w-full sm:w-[320px] shrink-0"
            />
            <div className="flex-1 w-full space-y-3">
              <div className="pixel-panel-inset p-3 text-xs space-y-1.5">
                <div className="text-[#b8c2dc] uppercase text-[10px]">Active Loadout</div>
                <div className="flex justify-between">
                  <span className="text-[#b8c2dc]">Flyer:</span>
                  <span className="text-[#f5b935] font-bold">{activeLoadout.birdSkin}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#b8c2dc]">World:</span>
                  <span className="text-[#38a3f1] font-bold">{activeLoadout.scene}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#b8c2dc]">Trail:</span>
                  <span>{activeLoadout.particleTrail}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                <Link
                  to="/play/classic"
                  onClick={clickSfx}
                  data-testid="menu-play-classic"
                  className="pixel-btn pixel-btn-green text-sm py-3 w-full"
                >
                  PLAY CLASSIC
                </Link>
                <div className="grid grid-cols-2 gap-2">
                  <Link to="/modes" onClick={clickSfx} className="pixel-btn pixel-btn-primary text-xs">
                    ALL MODES
                  </Link>
                  <Link to="/inventory" onClick={clickSfx} className="pixel-btn pixel-btn-secondary text-xs">
                    WARDROBE
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Arcade Actions */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t-2 border-[#0a0d1a]">
            <Link to="/shop" onClick={clickSfx} className="pixel-btn pixel-btn-secondary text-xs">
              SHOP
            </Link>
            <Link to="/leaderboards" onClick={clickSfx} className="pixel-btn pixel-btn-secondary text-xs">
              LEADERBOARDS
            </Link>
            <Link to="/missions" onClick={clickSfx} className="pixel-btn pixel-btn-secondary text-xs">
              MISSIONS
            </Link>
            <Link to="/achievements" onClick={clickSfx} className="pixel-btn pixel-btn-secondary text-xs">
              ACHIEVEMENTS
            </Link>
          </div>
        </section>

        {/* Right: Player Card & Daily Challenge */}
        <aside className="lg:col-span-5 space-y-5">
          {/* Player Status Panel */}
          <div className="pixel-panel p-4 space-y-3">
            {user ? (
              <>
                <div className="flex items-center gap-3">
                  <img
                    src={`/assets/avatars/${user.equipped.avatar}.png`}
                    alt={user.username}
                    className="w-14 h-14 pixel-art border-[3px] border-[#0a0d1a]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="font-arcade-title text-sm truncate text-[#fef8e6]">
                        {user.profile.displayName}
                      </h2>
                      <span className="px-1.5 py-0.5 text-[10px] bg-[#38a3f1] text-[#091224] font-bold">
                        LV {user.level}
                      </span>
                    </div>
                    <p className="text-xs text-[#b8c2dc]">
                      @{user.username} {user.profile.title ? `• ${user.profile.title}` : ""}
                    </p>
                    <div className="mt-2 h-3 pixel-panel-inset overflow-hidden">
                      <div
                        className="h-full bg-[#3ac463]"
                        style={{ width: `${user.levelProgressPercent}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-[#b8c2dc] mt-1">
                      <span>XP {user.currentLevelXp} / {user.nextLevelXp}</span>
                      <span className="text-[#f5b935] font-bold">{user.walletBalance.toLocaleString()} COINS</span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-2 border-t-2 border-[#0a0d1a]">
                  <Link to="/profile" onClick={clickSfx} className="pixel-btn pixel-btn-secondary text-[11px] py-1.5">
                    Profile
                  </Link>
                  <Link to="/wallet" onClick={clickSfx} className="pixel-btn pixel-btn-secondary text-[11px] py-1.5">
                    Wallet
                  </Link>
                  <Link to="/friends" onClick={clickSfx} className="pixel-btn pixel-btn-secondary text-[11px] py-1.5">
                    Friends
                  </Link>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <h2 className="font-arcade-title text-xs text-[#f5b935]">GUEST PILOT MODE</h2>
                <p className="text-xs text-[#b8c2dc] leading-relaxed">
                  Fly right away with zero signup! Create a free account to compete on verified global leaderboards, earn coins, unlock 15 bird skins, and explore 12 worlds.
                </p>
                <div className="pixel-panel-inset p-2.5 flex justify-between text-xs">
                  <span className="text-[#b8c2dc]">Local Practice Best:</span>
                  <span className="font-bold text-[#3ac463]">{guestState.bestScores.classic ?? 0}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Link to="/register" onClick={clickSfx} className="pixel-btn pixel-btn-primary text-xs">
                    Register (+100 C)
                  </Link>
                  <Link to="/login" onClick={clickSfx} className="pixel-btn pixel-btn-secondary text-xs">
                    Sign In
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Daily Challenge Card */}
          <div className="pixel-panel p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-arcade-title text-xs text-[#38a3f1]">DAILY CHALLENGE</h2>
              <span className="text-[11px] px-2 py-0.5 bg-[#141930] border border-[#0a0d1a] text-[#f5b935]">
                RESET {formatCountdown(remainingMs)}
              </span>
            </div>
            {daily ? (
              <>
                <p className="text-xs text-[#b8c2dc]">
                  Shared deterministic course for <strong className="text-[#fef8e6]">{daily.challengeDate}</strong>.
                  Score <strong className="text-[#f5b935]">{daily.targetScore}+</strong> to claim{" "}
                  <strong className="text-[#3ac463]">{daily.rewardCoins} coins</strong> &amp; {daily.rewardXp} XP.
                </p>
                <div className="flex items-center justify-between text-xs pixel-panel-inset px-3 py-2">
                  <span>Your Today Best: <strong>{daily.userBestToday}</strong></span>
                  <span className={daily.userCompletedToday ? "text-[#3ac463] font-bold" : "text-[#b8c2dc]"}>
                    {daily.userCompletedToday ? "COMPLETED" : `GOAL: ${daily.targetScore}`}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Link to="/play/daily_challenge" onClick={clickSfx} className="pixel-btn pixel-btn-sky text-xs">
                    PLAY DAILY
                  </Link>
                  <Link to="/leaderboards?board=daily_challenge" onClick={clickSfx} className="pixel-btn pixel-btn-secondary text-xs">
                    DAILY RANKS
                  </Link>
                </div>
              </>
            ) : (
              <p className="text-xs text-[#b8c2dc]">Loading today&apos;s deterministic challenge...</p>
            )}
          </div>

          {/* Quick Links */}
          <div className="pixel-panel p-3.5 grid grid-cols-2 gap-2 text-xs">
            <Link to="/preview" onClick={clickSfx} className="pixel-btn pixel-btn-secondary text-[11px]">
              Cosmetic Studio
            </Link>
            <Link to="/how-to-play" onClick={clickSfx} className="pixel-btn pixel-btn-secondary text-[11px]">
              How to Play
            </Link>
          </div>
        </aside>
      </div>
    </Layout>
  );
}

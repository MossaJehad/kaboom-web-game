import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  DEFAULT_MODE_CONFIGS,
  GAME_MODE_SLUGS,
  SCENE_CONFIGS,
  type GameModeSlug,
  type GameState,
  type ModePhysicsConfig,
  type SessionRewardSummaryDTO,
} from "@skyhop/shared";
import { apiRequest, ApiClientError } from "../api/client.js";
import { audioManager } from "../audio/audioManager.js";
import { Layout } from "../components/Layout.js";
import { KaboomGameAdapter } from "../engine/kaboomAdapter.js";
import type { EngineRunOutcome, IGameEngineAdapter } from "../engine/types.js";
import { useApp } from "../store/AppContext.js";

interface StartedSessionResponse {
  session: {
    sessionId: string;
    modeSlug: GameModeSlug;
    seed: string;
    configVersion: number;
    physicsConfig: ModePhysicsConfig;
    expiresAt: string;
    dailyChallenge: { targetScore: number; challengeDate: string; sceneSlug: string } | null;
  };
}

const MODE_LABELS: Record<GameModeSlug, string> = {
  classic: "CLASSIC",
  hardcore: "HARDCORE",
  zen: "ZEN",
  daily_challenge: "DAILY CHALLENGE",
};

export function PlayPage() {
  const params = useParams<{ mode?: string }>();
  const navigate = useNavigate();
  const mode: GameModeSlug = GAME_MODE_SLUGS.includes(params.mode as GameModeSlug)
    ? (params.mode as GameModeSlug)
    : "classic";

  const {
    user,
    isOnline,
    activeLoadout,
    activeSettings,
    guestState,
    pushToast,
    recordGuestRun,
    refreshUser,
    updateWalletBalanceLocal,
  } = useApp();

  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const adapterRef = useRef<IGameEngineAdapter | null>(null);

  const [gameState, setGameState] = useState<GameState>("LOADING");
  const [score, setScore] = useState(0);
  const [countdownNum, setCountdownNum] = useState(0);
  const [fps, setFps] = useState(60);
  const [musicOn, setMusicOn] = useState(false);
  const [isVerifiedMode, setIsVerifiedMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastOutcome, setLastOutcome] = useState<EngineRunOutcome | null>(null);
  const [summary, setSummary] = useState<SessionRewardSummaryDTO | null>(null);
  const [sessionPreparing, setSessionPreparing] = useState(false);

  const modeConfig = DEFAULT_MODE_CONFIGS[mode];

  // Prepare either a server-backed verified session (logged-in & online) or local practice session
  const prepareNewSession = useCallback(
    async (withCountdown = false) => {
      const adapter = adapterRef.current;
      if (!adapter) return;
      setSessionPreparing(true);
      setSubmitError(null);
      setSummary(null);
      setLastOutcome(null);
      setScore(0);

      if (user && isOnline) {
        try {
          const res = await apiRequest<StartedSessionResponse>("/api/game/sessions/start", {
            method: "POST",
            body: { mode },
          });
          setIsVerifiedMode(true);
          adapter.prepareSession({
            sessionId: res.session.sessionId,
            mode,
            seed: res.session.seed,
            physicsConfig: res.session.physicsConfig,
            countdownEnabled: withCountdown,
          });
          setSessionPreparing(false);
          return;
        } catch (err) {
          const msg = err instanceof ApiClientError ? err.message : "Could not start ranked session.";
          pushToast(`${msg} Falling back to local practice.`, "warning");
        }
      }

      // Guest or offline practice run
      setIsVerifiedMode(false);
      adapter.prepareSession({
        sessionId: null,
        mode,
        seed: `guest-${mode}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        physicsConfig: DEFAULT_MODE_CONFIGS[mode],
        countdownEnabled: withCountdown,
      });
      setSessionPreparing(false);
    },
    [user, isOnline, mode, pushToast]
  );

  // Submit verified replay to backend on game completion
  const handleRunFinished = useCallback(
    async (outcome: EngineRunOutcome) => {
      setLastOutcome(outcome);
      void audioManager.playSfx("hit");
      window.setTimeout(() => void audioManager.playSfx("die"), 120);

      if (!outcome.sessionId || !user) {
        recordGuestRun(outcome.mode, outcome.score);
        return;
      }

      setSubmitting(true);
      setSubmitError(null);
      try {
        const res = await apiRequest<{ summary: SessionRewardSummaryDTO }>("/api/game/sessions/submit", {
          method: "POST",
          body: {
            sessionId: outcome.sessionId,
            flapTicks: outcome.flapTicks,
            totalTicks: outcome.totalTicks,
            clientClaimedScore: outcome.score,
            pauseDurationMs: outcome.pauseDurationMs,
          },
        });
        setSummary(res.summary);
        updateWalletBalanceLocal(res.summary.newWalletBalance);
        if (res.summary.coinsBreakdown.total > 0) {
          void audioManager.playSfx("coin");
        }
        if (res.summary.leveledUp) {
          void audioManager.playSfx("levelup");
          pushToast(`LEVEL UP! You reached Level ${res.summary.newLevel}!`, "success");
        }
        if (res.summary.newlyUnlockedAchievements.length > 0) {
          void audioManager.playSfx("achievement");
          pushToast(
            `Achievement unlocked: ${res.summary.newlyUnlockedAchievements.map((a) => a.name).join(", ")}`,
            "success"
          );
        }
        void refreshUser();
      } catch (err) {
        const msg =
          err instanceof ApiClientError
            ? err.message
            : "Connection lost while verifying score. Practice freely and try again when back online.";
        setSubmitError(msg);
      } finally {
        setSubmitting(false);
      }
    },
    [user, recordGuestRun, updateWalletBalanceLocal, pushToast, refreshUser]
  );

  const handleRunFinishedRef = useRef(handleRunFinished);
  handleRunFinishedRef.current = handleRunFinished;

  // Mount isolated Kaboom.js engine adapter once and cleanly teardown on unmount
  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;

    const adapter = new KaboomGameAdapter();
    adapterRef.current = adapter;

    let cancelled = false;
    void adapter
      .mount(host, {
        onStateChange: (next) => {
          if (!cancelled) setGameState(next);
        },
        onScoreChange: (s) => {
          if (!cancelled) {
            setScore(s);
            if (s > 0) void audioManager.playSfx("score");
          }
        },
        onCountdownTick: (n) => {
          if (!cancelled) {
            setCountdownNum(n);
            void audioManager.playSfx(n > 0 ? "countdown" : "go");
          }
        },
        onFlap: () => {
          void audioManager.playSfx("flap");
        },
        onRunFinished: (outcome) => {
          if (!cancelled) void handleRunFinishedRef.current(outcome);
        },
        onFpsUpdate: (val) => {
          if (!cancelled) setFps(val);
        },
      })
      .then(() => {
        if (!cancelled) {
          void prepareNewSession(false);
        }
      });

    return () => {
      cancelled = true;
      audioManager.stopSceneAmbient();
      audioManager.stopMusic();
      adapter.unmount();
      adapterRef.current = null;
    };
    // Mount once per page lifecycle; mode & cosmetics handled reactively below
  }, []);

  // Re-prepare session when switching mode or auth state changes
  const prevModeRef = useRef(mode);
  const prevUserIdRef = useRef(user?.id ?? null);
  useEffect(() => {
    const currentUid = user?.id ?? null;
    if (prevModeRef.current !== mode || prevUserIdRef.current !== currentUid) {
      prevModeRef.current = mode;
      prevUserIdRef.current = currentUid;
      void prepareNewSession(false);
    }
  }, [mode, user?.id, prepareNewSession]);

  // Sync equipped cosmetics & scene ambient audio to engine adapter
  useEffect(() => {
    const adapter = adapterRef.current;
    if (!adapter) return;
    void adapter.loadCosmetics(activeLoadout);
    const sceneCfg = SCENE_CONFIGS[activeLoadout.scene] ?? SCENE_CONFIGS["sunny-meadow"]!;
    if (musicOn) {
      void audioManager.playSceneAmbient(sceneCfg.ambientAudioKey);
    }
  }, [activeLoadout, musicOn]);

  // Sync settings
  useEffect(() => {
    adapterRef.current?.updateSettings(activeSettings);
  }, [activeSettings]);

  const handleInstantRestart = async (withCountdown = false) => {
    void audioManager.playSfx("click");
    adapterRef.current?.beginRestart();
    await prepareNewSession(withCountdown);
  };

  const toggleMusic = () => {
    audioManager.unlock();
    const sceneCfg = SCENE_CONFIGS[activeLoadout.scene] ?? SCENE_CONFIGS["sunny-meadow"]!;
    if (musicOn) {
      audioManager.stopMusic();
      audioManager.stopSceneAmbient();
      setMusicOn(false);
    } else {
      void audioManager.startMusic();
      void audioManager.playSceneAmbient(sceneCfg.ambientAudioKey);
      setMusicOn(true);
    }
  };

  return (
    <Layout compact>
      <div className="flex-1 flex flex-col items-center justify-center px-2 py-3 sm:py-4 gap-3">
        {/* Top Compact Arcade HUD Strip */}
        <div className="w-full max-w-[440px] flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="px-2 py-1 bg-[#1c2340] border-2 border-[#0a0d1a] font-bold text-[#f5b935]">
              {MODE_LABELS[mode]}
            </span>
            <span
              className={`px-2 py-1 border-2 border-[#0a0d1a] text-[10px] font-bold ${
                isVerifiedMode
                  ? "bg-[#1e7a3b] text-white"
                  : "bg-[#334155] text-[#cbd5e1]"
              }`}
            >
              {isVerifiedMode ? "RANKED" : "PRACTICE"}
            </span>
            {activeSettings.showFps && (
              <span className="px-1.5 py-1 bg-[#141930] border-2 border-[#0a0d1a] text-[10px] text-[#38a3f1]">
                {fps} FPS
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleMusic}
              className="px-2 py-1 bg-[#232c50] border-2 border-[#0a0d1a] text-[11px] hover:bg-[#313d6e] cursor-pointer"
            >
              {musicOn ? "BGM: ON" : "BGM: OFF"}
            </button>
            {modeConfig.allowPause && (gameState === "PLAYING" || gameState === "PAUSED") && (
              <button
                type="button"
                data-testid="pause-toggle-btn"
                onClick={() => {
                  void audioManager.playSfx("click");
                  if (gameState === "PLAYING") adapterRef.current?.pause();
                  else adapterRef.current?.resume();
                }}
                className="px-2.5 py-1 bg-[#f5b935] text-[#121629] font-bold border-2 border-[#0a0d1a] text-[11px] cursor-pointer"
              >
                {gameState === "PAUSED" ? "RESUME" : "PAUSE"}
              </button>
            )}
          </div>
        </div>

        {/* Fixed-Aspect Responsive Arcade Cabinet Viewport (400x600 logical space, zero distortion) */}
        <div
          className="relative w-full max-w-[420px] aspect-[2/3] max-h-[76vh] border-[4px] border-[#0a0d1a] shadow-[6px_6px_0_#000] bg-[#121629] overflow-hidden select-none touch-none"
          data-testid="game-stage-container"
          data-game-state={gameState}
          data-current-score={score}
        >
          <div
            ref={canvasHostRef}
            className="w-full h-full"
          />

          {/* LOADING OVERLAY */}
          {(gameState === "LOADING" || sessionPreparing) && (
            <div className="absolute inset-0 bg-[#121629]/90 flex flex-col items-center justify-center gap-3 p-4 text-center">
              <p className="font-arcade-title text-xs text-[#f5b935]">LOADING FLIGHT...</p>
            </div>
          )}

          {/* READY OVERLAY */}
          {gameState === "READY" && !sessionPreparing && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-between py-10 px-4 text-center">
              <div className="pixel-panel px-4 py-2">
                <p className="font-arcade-title text-xs text-[#f5b935]">GET READY!</p>
                <p className="text-[11px] text-[#b8c2dc] mt-1">
                  {activeLoadout.birdSkin} &bull; {activeLoadout.scene}
                </p>
              </div>

              <div className="space-y-2 pointer-events-auto">
                <button
                  type="button"
                  data-testid="tap-to-fly-btn"
                  onClick={() => {
                    audioManager.unlock();
                    adapterRef.current?.triggerFlap();
                  }}
                  className="pixel-btn pixel-btn-green text-xs px-5 py-2.5"
                >
                  TAP / CLICK / {activeSettings.flapKey} TO FLY
                </button>
                <div>
                  <button
                    type="button"
                    onClick={() => void handleInstantRestart(true)}
                    className="text-[10px] underline text-[#fef8e6] bg-[#121629]/75 px-2 py-1 cursor-pointer"
                  >
                    Start with 3-2-1 Countdown
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* COUNTDOWN OVERLAY */}
          {gameState === "COUNTDOWN" && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center bg-black/25">
              <span className="font-arcade-title text-5xl text-[#f5b935] drop-shadow-[4px_4px_0_#000]">
                {countdownNum > 0 ? countdownNum : "GO!"}
              </span>
            </div>
          )}

          {/* PAUSE MENU OVERLAY */}
          {gameState === "PAUSED" && (
            <div className="absolute inset-0 bg-[#0b0e1c]/85 flex items-center justify-center p-5">
              <div className="pixel-panel w-full max-w-[300px] p-5 space-y-3 text-center">
                <h2 className="font-arcade-title text-base text-[#f5b935]">PAUSED</h2>
                <p className="text-xs text-[#b8c2dc]">Current Score: {score}</p>
                <div className="flex flex-col gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      void audioManager.playSfx("click");
                      adapterRef.current?.resume();
                    }}
                    className="pixel-btn pixel-btn-green text-xs w-full"
                  >
                    Resume Flight
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleInstantRestart(false)}
                    className="pixel-btn pixel-btn-primary text-xs w-full"
                  >
                    Restart Now
                  </button>
                  <Link to="/modes" className="pixel-btn pixel-btn-secondary text-xs w-full">
                    Switch Mode
                  </Link>
                  <Link to="/settings" className="pixel-btn pixel-btn-secondary text-xs w-full">
                    Settings
                  </Link>
                  <Link to="/" className="pixel-btn pixel-btn-secondary text-xs w-full">
                    Main Menu
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* GAME OVER BRIEF BANNER */}
          {gameState === "GAME_OVER" && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="pixel-panel px-6 py-3 bg-[#941f27]">
                <span className="font-arcade-title text-lg text-white">GAME OVER</span>
              </div>
            </div>
          )}

          {/* RESULTS & REWARDS OVERLAY */}
          {gameState === "RESULTS" && (
            <div
              className="absolute inset-0 bg-[#0b0e1c]/90 flex items-center justify-center p-3 overflow-y-auto"
              data-testid="results-overlay"
            >
              <div className="pixel-panel w-full max-w-[345px] p-4 space-y-3">
                <div className="text-center border-b-2 border-[#0a0d1a] pb-2">
                  <h2 className="font-arcade-title text-sm text-[#f5b935]">FLIGHT COMPLETE</h2>
                  {summary?.isPersonalRecord && (
                    <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-bold bg-[#3ac463] text-[#091e10]">
                      NEW PERSONAL RECORD!
                    </span>
                  )}
                </div>

                {/* Score Grid */}
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="pixel-panel-inset p-2.5">
                    <div className="text-[10px] text-[#b8c2dc]">SCORE</div>
                    <div
                      data-testid="results-verified-score"
                      className="font-arcade-title text-xl text-[#fef8e6] mt-1"
                    >
                      {summary ? summary.verifiedScore : (lastOutcome?.score ?? score)}
                    </div>
                  </div>
                  <div className="pixel-panel-inset p-2.5">
                    <div className="text-[10px] text-[#b8c2dc]">
                      {user ? "COINS EARNED" : "LOCAL BEST"}
                    </div>
                    <div
                      data-testid="results-coins-earned"
                      className="font-arcade-title text-xl text-[#f5b935] mt-1"
                    >
                      {user
                        ? submitting
                          ? "..."
                          : `+${summary?.coinsBreakdown.total ?? 0}`
                        : (guestState.bestScores[mode] ?? 0)}
                    </div>
                  </div>
                </div>

                {/* Verification Status & Reward Breakdown */}
                {submitting && (
                  <div className="pixel-panel-inset p-2.5 text-center text-xs text-[#38a3f1]">
                    Verifying deterministic replay on server...
                  </div>
                )}

                {submitError && (
                  <div className="p-2.5 bg-[#941f27]/80 border-2 border-[#0a0d1a] text-[11px] text-white">
                    {submitError}
                  </div>
                )}

                {summary && (
                  <div className="pixel-panel-inset p-2.5 text-[11px] space-y-1">
                    <div className="flex justify-between">
                      <span className="text-[#b8c2dc]">XP Gained:</span>
                      <span className="text-[#38a3f1] font-bold">
                        +{summary.xpAwarded} XP (LV {summary.newLevel})
                      </span>
                    </div>
                    {summary.coinsBreakdown.obstacles > 0 && (
                      <div className="flex justify-between">
                        <span className="text-[#b8c2dc]">Obstacles Bonus:</span>
                        <span className="text-[#f5b935]">+{summary.coinsBreakdown.obstacles} C</span>
                      </div>
                    )}
                    {summary.coinsBreakdown.firstGameOfDay > 0 && (
                      <div className="flex justify-between">
                        <span className="text-[#b8c2dc]">First Game Today:</span>
                        <span className="text-[#f5b935]">+{summary.coinsBreakdown.firstGameOfDay} C</span>
                      </div>
                    )}
                    {summary.coinsBreakdown.personalRecord > 0 && (
                      <div className="flex justify-between">
                        <span className="text-[#b8c2dc]">Personal Record:</span>
                        <span className="text-[#f5b935]">+{summary.coinsBreakdown.personalRecord} C</span>
                      </div>
                    )}
                    {summary.coinsBreakdown.dailyChallenge > 0 && (
                      <div className="flex justify-between">
                        <span className="text-[#b8c2dc]">Daily Challenge Clear:</span>
                        <span className="text-[#3ac463]">+{summary.coinsBreakdown.dailyChallenge} C</span>
                      </div>
                    )}
                    {summary.coinsBreakdown.levelUps > 0 && (
                      <div className="flex justify-between">
                        <span className="text-[#b8c2dc]">Level-Up Bonus:</span>
                        <span className="text-[#3ac463]">+{summary.coinsBreakdown.levelUps} C</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-1 border-t border-[#2d375c]">
                      <span className="text-[#b8c2dc]">Wallet Balance:</span>
                      <strong className="text-[#f5b935]">{summary.newWalletBalance.toLocaleString()} C</strong>
                    </div>
                  </div>
                )}

                {!user && (
                  <div className="pixel-panel-inset p-2.5 text-[11px] text-[#b8c2dc]">
                    Playing in Guest mode.{" "}
                    <Link to="/register" className="text-[#f5b935] underline font-bold">
                      Create an account
                    </Link>{" "}
                    to submit verified scores and earn coins!
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    data-testid="instant-restart-btn"
                    onClick={() => void handleInstantRestart(false)}
                    className="pixel-btn pixel-btn-green text-xs col-span-2 py-2.5"
                  >
                    PLAY AGAIN
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate("/shop")}
                    className="pixel-btn pixel-btn-primary text-[11px]"
                  >
                    SHOP
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate("/leaderboards")}
                    className="pixel-btn pixel-btn-sky text-[11px]"
                  >
                    RANKS
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Mode Quick Switcher Below Cabinet */}
        <div className="w-full max-w-[440px] grid grid-cols-4 gap-1.5 text-[10px]">
          {GAME_MODE_SLUGS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                void audioManager.playSfx("click");
                navigate(`/play/${m}`);
              }}
              className={`py-1.5 px-1 border-2 border-[#0a0d1a] uppercase font-bold cursor-pointer ${
                mode === m
                  ? "bg-[#f5b935] text-[#121629]"
                  : "bg-[#1c2340] text-[#b8c2dc] hover:bg-[#273158]"
              }`}
            >
              {m === "daily_challenge" ? "DAILY" : m}
            </button>
          ))}
        </div>
      </div>
    </Layout>
  );
}

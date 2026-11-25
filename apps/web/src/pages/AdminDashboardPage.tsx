import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  COSMETIC_CATEGORIES,
  COSMETIC_RARITIES,
  DEFAULT_MODE_CONFIGS,
  GAME_MODE_SLUGS,
  type CosmeticCategory,
  type CosmeticRarity,
  type GameModeSlug,
} from "@skyhop/shared";
import { apiRequest, ApiClientError } from "../api/client.js";
import { Layout } from "../components/Layout.js";
import { LoadingScreen } from "../components/LoadingScreen.js";
import { useApp } from "../store/AppContext.js";

type AdminTab =
  | "analytics"
  | "users"
  | "replays"
  | "economy"
  | "cosmetics"
  | "content"
  | "configs"
  | "audit";

export function AdminDashboardPage() {
  const { user, pushToast } = useApp();
  const [tab, setTab] = useState<AdminTab>("analytics");
  const [loading, setLoading] = useState(false);

  // Real backend states
  const [analytics, setAnalytics] = useState<Record<string, any> | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [replays, setReplays] = useState<any[]>([]);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [selectedReplay, setSelectedReplay] = useState<any | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [cosmetics, setCosmetics] = useState<any[]>([]);
  const [challenges, setChallenges] = useState<any[]>([]);
  const [missions, setMissions] = useState<any[]>([]);
  const [achievements, setAchievements] = useState<any[]>([]);
  const [configs, setConfigs] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Inline forms
  const [coinAdjTarget, setCoinAdjTarget] = useState<{ id: string; username: string } | null>(null);
  const [coinAdjAmount, setCoinAdjAmount] = useState(100);
  const [coinAdjReason, setCoinAdjReason] = useState("");

  const [newCosmetic, setNewCosmetic] = useState({
    slug: "",
    name: "",
    description: "",
    category: "BIRD_SKIN" as CosmeticCategory,
    rarity: "RARE" as CosmeticRarity,
    price: 500,
    isAvailable: true,
    requiredLevel: 1,
    previewUrl: "/assets/birds/classic-sparrow-preview.png",
  });

  const [dailyForm, setDailyForm] = useState({
    challengeDate: new Date().toISOString().slice(0, 10),
    targetScore: 10,
    rewardCoins: 25,
    rewardXp: 50,
    sceneSlug: "sunny-meadow",
  });

  const [cfgMode, setCfgMode] = useState<GameModeSlug>("classic");
  const [cfgBaseSpeed, setCfgBaseSpeed] = useState(DEFAULT_MODE_CONFIGS.classic.baseSpeed);
  const [cfgBaseGap, setCfgBaseGap] = useState(DEFAULT_MODE_CONFIGS.classic.baseGap);
  const [cfgNotes, setCfgNotes] = useState("");

  const isStaff = user && (user.role === "ADMIN" || user.role === "MODERATOR");

  const loadTab = useCallback(async () => {
    if (!isStaff) return;
    setLoading(true);
    try {
      if (tab === "analytics") {
        const res = await apiRequest<{ analytics: Record<string, any> }>("/api/admin/analytics");
        setAnalytics(res.analytics);
      } else if (tab === "users") {
        const res = await apiRequest<{ users: any[] }>(
          `/api/admin/users?search=${encodeURIComponent(userSearch)}`
        );
        setUsers(res.users);
      } else if (tab === "replays") {
        const res = await apiRequest<{ replays: any[] }>(
          `/api/admin/replays?flaggedOnly=${flaggedOnly}`
        );
        setReplays(res.replays);
      } else if (tab === "economy") {
        const res = await apiRequest<{ transactions: any[] }>("/api/admin/transactions");
        setTransactions(res.transactions);
      } else if (tab === "cosmetics") {
        const res = await apiRequest<{ items: any[] }>("/api/admin/cosmetics");
        setCosmetics(res.items);
      } else if (tab === "content") {
        const [dc, ms, ac] = await Promise.all([
          apiRequest<{ challenges: any[] }>("/api/admin/daily-challenges"),
          user?.role === "ADMIN" ? apiRequest<{ missions: any[] }>("/api/admin/missions") : Promise.resolve({ missions: [] }),
          user?.role === "ADMIN" ? apiRequest<{ achievements: any[] }>("/api/admin/achievements") : Promise.resolve({ achievements: [] }),
        ]);
        setChallenges(dc.challenges);
        setMissions(ms.missions);
        setAchievements(ac.achievements);
      } else if (tab === "configs") {
        const res = await apiRequest<{ configurations: any[] }>("/api/admin/configurations");
        setConfigs(res.configurations);
      } else if (tab === "audit") {
        const res = await apiRequest<{ logs: any[] }>("/api/admin/audit-logs");
        setAuditLogs(res.logs);
      }
    } catch (err) {
      pushToast(err instanceof ApiClientError ? err.message : "Failed to load admin data.", "error");
    } finally {
      setLoading(false);
    }
  }, [isStaff, tab, userSearch, flaggedOnly, user?.role, pushToast]);

  useEffect(() => {
    void loadTab();
  }, [loadTab]);

  if (!isStaff) {
    return (
      <Layout>
        <div className="pixel-panel max-w-md mx-auto p-6 text-center space-y-4">
          <h1 className="font-arcade-title text-base text-[#e84545]">ACCESS RESTRICTED</h1>
          <p className="text-xs text-[#b8c2dc]">
            Administrator or Moderator role required to inspect SKYHOP operations.
          </p>
          <Link to="/" className="pixel-btn pixel-btn-secondary text-xs">Return Home</Link>
        </div>
      </Layout>
    );
  }

  const moderateUser = async (id: string, action: string) => {
    const reason = window.prompt(`Reason for ${action}:`) ?? "";
    if (reason.trim().length < 3) return;
    try {
      await apiRequest(`/api/admin/users/${id}/moderate`, {
        method: "POST",
        body: { action, reason, durationHours: action === "SUSPEND" ? 24 : undefined },
      });
      pushToast(`Applied ${action} successfully.`, "success");
      await loadTab();
    } catch (err) {
      pushToast(err instanceof ApiClientError ? err.message : "Moderation failed.", "error");
    }
  };

  const submitCurrencyAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coinAdjTarget) return;
    try {
      await apiRequest(`/api/admin/users/${coinAdjTarget.id}/currency`, {
        method: "POST",
        body: { amount: Number(coinAdjAmount), reason: coinAdjReason },
      });
      pushToast(`Adjusted coins for ${coinAdjTarget.username}.`, "success");
      setCoinAdjTarget(null);
      setCoinAdjReason("");
      await loadTab();
    } catch (err) {
      pushToast(err instanceof ApiClientError ? err.message : "Adjustment failed.", "error");
    }
  };

  const invalidateResult = async (resultId: string) => {
    const reason = window.prompt("Invalidation reason:", "Confirmed replay anomaly") ?? "";
    if (!reason.trim()) return;
    try {
      await apiRequest(`/api/admin/results/${resultId}/invalidate`, {
        method: "POST",
        body: { reason },
      });
      pushToast("Score invalidated and leaderboards recalculated.", "success");
      await loadTab();
    } catch (err) {
      pushToast(err instanceof ApiClientError ? err.message : "Invalidation failed.", "error");
    }
  };

  const toggleCosmeticAvailability = async (item: any) => {
    try {
      await apiRequest("/api/admin/cosmetics", {
        method: "POST",
        body: {
          slug: item.slug,
          name: item.name,
          description: item.description,
          category: item.category,
          rarity: item.rarity,
          price: item.price,
          isAvailable: !item.isAvailable,
          requiredLevel: item.requiredLevel,
        },
      });
      pushToast(`Updated availability for ${item.name}.`, "success");
      await loadTab();
    } catch (err) {
      pushToast(err instanceof ApiClientError ? err.message : "Failed to update item.", "error");
    }
  };

  const updateCosmeticPrice = async (item: any) => {
    const raw = window.prompt(`New price in Coins for ${item.name}:`, String(item.price));
    if (raw === null) return;
    const price = Number(raw);
    if (!Number.isInteger(price) || price < 0) return;
    try {
      await apiRequest("/api/admin/cosmetics", {
        method: "POST",
        body: {
          slug: item.slug,
          name: item.name,
          description: item.description,
          category: item.category,
          rarity: item.rarity,
          price,
          isAvailable: item.isAvailable,
          requiredLevel: item.requiredLevel,
        },
      });
      pushToast(`Updated ${item.name} price to ${price} C.`, "success");
      await loadTab();
    } catch (err) {
      pushToast(err instanceof ApiClientError ? err.message : "Price update failed.", "error");
    }
  };

  const saveNewCosmetic = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest("/api/admin/cosmetics", {
        method: "POST",
        body: { ...newCosmetic, price: Number(newCosmetic.price), requiredLevel: Number(newCosmetic.requiredLevel) },
      });
      pushToast("Cosmetic saved to catalog!", "success");
      setNewCosmetic({ ...newCosmetic, slug: "", name: "", description: "" });
      await loadTab();
    } catch (err) {
      pushToast(err instanceof ApiClientError ? err.message : "Failed to save cosmetic.", "error");
    }
  };

  const saveDailyChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest("/api/admin/daily-challenges", {
        method: "POST",
        body: {
          ...dailyForm,
          targetScore: Number(dailyForm.targetScore),
          rewardCoins: Number(dailyForm.rewardCoins),
          rewardXp: Number(dailyForm.rewardXp),
        },
      });
      pushToast("Daily challenge scheduled!", "success");
      await loadTab();
    } catch (err) {
      pushToast(err instanceof ApiClientError ? err.message : "Failed to save daily challenge.", "error");
    }
  };

  const publishNewConfigVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest("/api/admin/configurations", {
        method: "POST",
        body: {
          modeSlug: cfgMode,
          physicsConfig: {
            ...DEFAULT_MODE_CONFIGS[cfgMode],
            baseSpeed: Number(cfgBaseSpeed),
            baseGap: Number(cfgBaseGap),
          },
          notes: cfgNotes || `Difficulty update for ${cfgMode}`,
        },
      });
      pushToast("Published new versioned game config (prior sessions remain verifiable).", "success");
      setCfgNotes("");
      await loadTab();
    } catch (err) {
      pushToast(err instanceof ApiClientError ? err.message : "Config publish failed.", "error");
    }
  };

  return (
    <Layout>
      <div className="space-y-5">
        <div className="pixel-panel p-4 flex flex-wrap items-center justify-between gap-3 border-[#e84545]">
          <div>
            <h1 className="font-arcade-title text-lg text-[#e84545]">ADMIN OPERATIONS CONSOLE</h1>
            <p className="text-xs text-[#b8c2dc] mt-1">
              Signed in as <strong>{user.username}</strong> ({user.role}). All mutations are recorded in AuditLog.
            </p>
          </div>
          <button type="button" onClick={() => void loadTab()} className="pixel-btn pixel-btn-secondary text-xs">
            Refresh
          </button>
        </div>

        {/* Admin Tabs */}
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["analytics", "Analytics"],
              ["users", "Players"],
              ["replays", "Replays & Anti-Cheat"],
              ["economy", "Transactions"],
              ["cosmetics", "Cosmetics"],
              ["content", "Daily / Quests"],
              ["configs", "Difficulty Versions"],
              ["audit", "Audit Logs"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`px-3 py-1.5 text-xs border-2 border-[#0a0d1a] cursor-pointer ${
                tab === id ? "bg-[#e84545] text-white font-bold" : "bg-[#1c2340]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <LoadingScreen label="QUERYING DATABASE..." />
        ) : (
          <>
            {/* ANALYTICS */}
            {tab === "analytics" && analytics && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    ["Total Players", analytics.totalUsers],
                    ["New Players (24h)", analytics.newUsers24h],
                    ["Verified Runs", analytics.totalGames],
                    ["Runs (24h)", analytics.games24h],
                    ["Flagged Runs", analytics.flaggedResults],
                    ["Invalidated Runs", analytics.invalidatedResults],
                    ["Shop Purchases", analytics.totalPurchases],
                    ["Circulating Coins", analytics.economy?.circulatingCoins?.toLocaleString()],
                  ].map(([k, v]) => (
                    <div key={String(k)} className="pixel-panel p-4">
                      <div className="text-[10px] text-[#b8c2dc] uppercase">{k}</div>
                      <div className="font-arcade-title text-lg text-[#f5b935] mt-1">{v}</div>
                    </div>
                  ))}
                </div>
                <div className="pixel-panel p-4 space-y-2 text-xs">
                  <h2 className="font-arcade-title text-xs text-[#38a3f1]">7-DAY MODE ACTIVITY</h2>
                  {analytics.modeBreakdown7d?.length ? (
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                      {analytics.modeBreakdown7d.map((m: any) => (
                        <div key={m.modeSlug} className="pixel-panel-inset p-3">
                          <div className="font-bold uppercase">{m.modeSlug}</div>
                          <div>Runs: {m.games}</div>
                          <div>Avg Score: {m.avgScore}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[#b8c2dc]">No runs recorded in the past 7 days.</p>
                  )}
                </div>
              </div>
            )}

            {/* USERS & MODERATION */}
            {tab === "users" && (
              <div className="space-y-4">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void loadTab();
                  }}
                  className="flex gap-2 max-w-md"
                >
                  <input
                    type="text"
                    placeholder="Filter by username or email..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="pixel-input text-xs"
                  />
                  <button type="submit" className="pixel-btn pixel-btn-primary text-xs">Filter</button>
                </form>

                {coinAdjTarget && (
                  <form onSubmit={submitCurrencyAdjust} className="pixel-panel p-4 space-y-3 border-[#f5b935] max-w-lg">
                    <h3 className="font-arcade-title text-xs text-[#f5b935]">
                      AUDITED COIN ADJUSTMENT: @{coinAdjTarget.username}
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        required
                        value={coinAdjAmount}
                        onChange={(e) => setCoinAdjAmount(Number(e.target.value))}
                        className="pixel-input text-xs"
                      />
                      <input
                        type="text"
                        required
                        placeholder="Audit reason..."
                        value={coinAdjReason}
                        onChange={(e) => setCoinAdjReason(e.target.value)}
                        className="pixel-input text-xs"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button type="submit" className="pixel-btn pixel-btn-green text-xs">Apply Adjustment</button>
                      <button type="button" onClick={() => setCoinAdjTarget(null)} className="pixel-btn pixel-btn-secondary text-xs">Cancel</button>
                    </div>
                  </form>
                )}

                <div className="pixel-panel overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#141930] border-b-2 border-[#0a0d1a] text-[10px] uppercase text-[#b8c2dc]">
                        <th className="p-2.5">User</th>
                        <th className="p-2.5">Status</th>
                        <th className="p-2.5">Wallet</th>
                        <th className="p-2.5">Games / Best</th>
                        <th className="p-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id} className="border-b border-[#0a0d1a]/50">
                          <td className="p-2.5">
                            <div className="font-bold">{u.username} <span className="text-[10px] text-[#38a3f1]">({u.role})</span></div>
                            <div className="text-[10px] text-[#b8c2dc]">{u.email}</div>
                          </td>
                          <td className="p-2.5">
                            <span className={`px-1.5 py-0.5 text-[10px] font-bold ${u.status === "ACTIVE" ? "bg-[#1e7a3b]" : "bg-[#941f27]"}`}>
                              {u.status}
                            </span>
                          </td>
                          <td className="p-2.5 text-[#f5b935] font-bold">{u.wallet?.balance ?? 0} C</td>
                          <td className="p-2.5">{u.stats?.totalGames ?? 0} / {u.stats?.highestScore ?? 0}</td>
                          <td className="p-2.5 text-right">
                            <div className="flex justify-end gap-1 flex-wrap">
                              {user.role === "ADMIN" && (
                                <button
                                  type="button"
                                  onClick={() => setCoinAdjTarget({ id: u.id, username: u.username })}
                                  className="pixel-btn pixel-btn-primary text-[10px] px-2 py-1"
                                >
                                  Coins
                                </button>
                              )}
                              {u.status === "ACTIVE" ? (
                                <>
                                  <button type="button" onClick={() => void moderateUser(u.id, "SUSPEND")} className="pixel-btn pixel-btn-secondary text-[10px] px-2 py-1">Suspend</button>
                                  <button type="button" onClick={() => void moderateUser(u.id, "BAN")} className="pixel-btn pixel-btn-red text-[10px] px-2 py-1">Ban</button>
                                </>
                              ) : (
                                <button type="button" onClick={() => void moderateUser(u.id, "UNBAN")} className="pixel-btn pixel-btn-green text-[10px] px-2 py-1">Restore</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* REPLAYS & ANTI-CHEAT */}
            {tab === "replays" && (
              <div className="space-y-4">
                <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />
                  Show Flagged / Suspicious Runs Only
                </label>

                {selectedReplay && (
                  <div className="pixel-panel p-4 space-y-2 text-xs border-[#38a3f1]">
                    <div className="flex justify-between">
                      <h3 className="font-arcade-title text-xs text-[#38a3f1]">
                        REPLAY INSPECTOR: {selectedReplay.id}
                      </h3>
                      <button type="button" onClick={() => setSelectedReplay(null)} className="underline cursor-pointer">Close</button>
                    </div>
                    <pre className="pixel-panel-inset p-3 overflow-x-auto text-[11px] max-h-56">
                      {JSON.stringify(selectedReplay.replayPayload, null, 2)}
                    </pre>
                  </div>
                )}

                <div className="pixel-panel overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#141930] border-b-2 border-[#0a0d1a] text-[10px] uppercase text-[#b8c2dc]">
                        <th className="p-2.5">Player</th>
                        <th className="p-2.5">Mode</th>
                        <th className="p-2.5">Verified / Claimed</th>
                        <th className="p-2.5">Status / Flag</th>
                        <th className="p-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {replays.map((r) => (
                        <tr key={r.id} className="border-b border-[#0a0d1a]/50">
                          <td className="p-2.5 font-bold">{r.user?.username}</td>
                          <td className="p-2.5 uppercase">{r.modeSlug}</td>
                          <td className="p-2.5">
                            <strong className="text-[#3ac463]">{r.verifiedScore}</strong> / {r.clientClaimedScore ?? "-"}
                          </td>
                          <td className="p-2.5">
                            {r.isInvalidated ? (
                              <span className="text-[#e84545] font-bold">INVALIDATED</span>
                            ) : r.isFlagged ? (
                              <span className="text-[#f5b935]">{r.flagReason}</span>
                            ) : (
                              <span className="text-[#3ac463]">CLEAN</span>
                            )}
                          </td>
                          <td className="p-2.5 text-right space-x-1.5">
                            <button type="button" onClick={() => setSelectedReplay(r)} className="pixel-btn pixel-btn-secondary text-[10px] px-2 py-1">Inspect</button>
                            {!r.isInvalidated && (
                              <button type="button" onClick={() => void invalidateResult(r.id)} className="pixel-btn pixel-btn-red text-[10px] px-2 py-1">Invalidate</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ECONOMY TRANSACTIONS */}
            {tab === "economy" && (
              <div className="pixel-panel overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#141930] border-b-2 border-[#0a0d1a] text-[10px] uppercase text-[#b8c2dc]">
                      <th className="p-2.5">Time</th>
                      <th className="p-2.5">Player</th>
                      <th className="p-2.5">Source</th>
                      <th className="p-2.5">Description</th>
                      <th className="p-2.5 text-right">Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t) => (
                      <tr key={t.id} className="border-b border-[#0a0d1a]/50">
                        <td className="p-2.5 text-[#b8c2dc]">{new Date(t.createdAt).toLocaleString()}</td>
                        <td className="p-2.5 font-bold">{t.user?.username}</td>
                        <td className="p-2.5 text-[10px]">{t.source}</td>
                        <td className="p-2.5">{t.description}</td>
                        <td className={`p-2.5 text-right font-bold ${t.amount >= 0 ? "text-[#3ac463]" : "text-[#e84545]"}`}>
                          {t.amount >= 0 ? `+${t.amount}` : t.amount} C
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* COSMETICS CATALOG */}
            {tab === "cosmetics" && (
              <div className="space-y-4">
                <form onSubmit={saveNewCosmetic} className="pixel-panel p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <h2 className="sm:col-span-3 font-arcade-title text-xs text-[#f5b935]">CREATE / UPDATE COSMETIC ITEM</h2>
                  <input placeholder="slug (e.g. emerald-owl)" required value={newCosmetic.slug} onChange={(e) => setNewCosmetic({ ...newCosmetic, slug: e.target.value })} className="pixel-input text-xs" />
                  <input placeholder="Display Name" required value={newCosmetic.name} onChange={(e) => setNewCosmetic({ ...newCosmetic, name: e.target.value })} className="pixel-input text-xs" />
                  <input type="number" placeholder="Price" required value={newCosmetic.price} onChange={(e) => setNewCosmetic({ ...newCosmetic, price: Number(e.target.value) })} className="pixel-input text-xs" />
                  <select value={newCosmetic.category} onChange={(e) => setNewCosmetic({ ...newCosmetic, category: e.target.value as CosmeticCategory })} className="pixel-input text-xs">
                    {COSMETIC_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={newCosmetic.rarity} onChange={(e) => setNewCosmetic({ ...newCosmetic, rarity: e.target.value as CosmeticRarity })} className="pixel-input text-xs">
                    {COSMETIC_RARITIES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <input placeholder="Preview asset URL" value={newCosmetic.previewUrl} onChange={(e) => setNewCosmetic({ ...newCosmetic, previewUrl: e.target.value })} className="pixel-input text-xs" />
                  <input placeholder="Description" required value={newCosmetic.description} onChange={(e) => setNewCosmetic({ ...newCosmetic, description: e.target.value })} className="pixel-input text-xs sm:col-span-2" />
                  <button type="submit" className="pixel-btn pixel-btn-green text-xs">Save Cosmetic</button>
                </form>

                <div className="pixel-panel overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#141930] border-b-2 border-[#0a0d1a] text-[10px] uppercase text-[#b8c2dc]">
                        <th className="p-2.5">Item</th>
                        <th className="p-2.5">Category</th>
                        <th className="p-2.5">Price</th>
                        <th className="p-2.5">Status</th>
                        <th className="p-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cosmetics.map((c) => (
                        <tr key={c.id} className="border-b border-[#0a0d1a]/50">
                          <td className="p-2.5 font-bold">{c.name} <span className="text-[10px] text-[#b8c2dc]">({c.slug})</span></td>
                          <td className="p-2.5">{c.category}</td>
                          <td className="p-2.5 text-[#f5b935]">{c.price} C</td>
                          <td className="p-2.5">{c.isAvailable ? "ENABLED" : "DISABLED"}</td>
                          <td className="p-2.5 text-right space-x-1.5">
                            <button type="button" onClick={() => void updateCosmeticPrice(c)} className="pixel-btn pixel-btn-primary text-[10px] px-2 py-1">Price</button>
                            <button type="button" onClick={() => void toggleCosmeticAvailability(c)} className="pixel-btn pixel-btn-secondary text-[10px] px-2 py-1">
                              {c.isAvailable ? "Disable" : "Enable"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* DAILY CHALLENGES, MISSIONS & ACHIEVEMENTS */}
            {tab === "content" && (
              <div className="space-y-4">
                <form onSubmit={saveDailyChallenge} className="pixel-panel p-4 grid grid-cols-1 sm:grid-cols-5 gap-2.5 text-xs">
                  <h2 className="sm:col-span-5 font-arcade-title text-xs text-[#f5b935]">CONFIGURE DAILY CHALLENGE</h2>
                  <input type="date" value={dailyForm.challengeDate} onChange={(e) => setDailyForm({ ...dailyForm, challengeDate: e.target.value })} className="pixel-input text-xs" />
                  <input type="number" placeholder="Target Score" value={dailyForm.targetScore} onChange={(e) => setDailyForm({ ...dailyForm, targetScore: Number(e.target.value) })} className="pixel-input text-xs" />
                  <input type="number" placeholder="Reward Coins" value={dailyForm.rewardCoins} onChange={(e) => setDailyForm({ ...dailyForm, rewardCoins: Number(e.target.value) })} className="pixel-input text-xs" />
                  <input placeholder="Scene Slug" value={dailyForm.sceneSlug} onChange={(e) => setDailyForm({ ...dailyForm, sceneSlug: e.target.value })} className="pixel-input text-xs" />
                  <button type="submit" className="pixel-btn pixel-btn-green text-xs">Save Challenge</button>
                </form>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
                  <div className="pixel-panel p-4 space-y-2">
                    <h3 className="font-arcade-title text-xs text-[#38a3f1]">RECENT DAILY CHALLENGES ({challenges.length})</h3>
                    {challenges.map((ch) => (
                      <div key={ch.id} className="pixel-panel-inset p-2">
                        <strong>{ch.challengeDate}</strong> &bull; Goal {ch.targetScore} &bull; {ch.rewardCoins} C
                      </div>
                    ))}
                  </div>
                  <div className="pixel-panel p-4 space-y-2">
                    <h3 className="font-arcade-title text-xs text-[#f5b935]">MISSIONS ({missions.length})</h3>
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {missions.map((m) => (
                        <div key={m.id} className="pixel-panel-inset p-2">
                          <strong>{m.name}</strong> ({m.cadence}) &bull; {m.rewardCoins} C
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="pixel-panel p-4 space-y-2">
                    <h3 className="font-arcade-title text-xs text-[#3ac463]">ACHIEVEMENTS ({achievements.length})</h3>
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {achievements.map((a) => (
                        <div key={a.id} className="pixel-panel-inset p-2">
                          <strong>{a.name}</strong> &bull; Target {a.targetValue} &bull; {a.rewardCoins} C
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* VERSIONED GAME CONFIGURATIONS */}
            {tab === "configs" && (
              <div className="space-y-4">
                <form onSubmit={publishNewConfigVersion} className="pixel-panel p-4 grid grid-cols-1 sm:grid-cols-5 gap-2.5 text-xs">
                  <h2 className="sm:col-span-5 font-arcade-title text-xs text-[#f5b935]">
                    PUBLISH NEW VERSIONED DIFFICULTY CONFIG
                  </h2>
                  <select
                    value={cfgMode}
                    onChange={(e) => {
                      const m = e.target.value as GameModeSlug;
                      setCfgMode(m);
                      setCfgBaseSpeed(DEFAULT_MODE_CONFIGS[m].baseSpeed);
                      setCfgBaseGap(DEFAULT_MODE_CONFIGS[m].baseGap);
                    }}
                    className="pixel-input text-xs"
                  >
                    {GAME_MODE_SLUGS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <input type="number" value={cfgBaseSpeed} onChange={(e) => setCfgBaseSpeed(Number(e.target.value))} placeholder="Base Speed" className="pixel-input text-xs" />
                  <input type="number" value={cfgBaseGap} onChange={(e) => setCfgBaseGap(Number(e.target.value))} placeholder="Base Gap" className="pixel-input text-xs" />
                  <input value={cfgNotes} onChange={(e) => setCfgNotes(e.target.value)} placeholder="Version notes..." className="pixel-input text-xs" />
                  <button type="submit" className="pixel-btn pixel-btn-primary text-xs">Publish Version</button>
                </form>

                <div className="pixel-panel overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#141930] border-b-2 border-[#0a0d1a] text-[10px] uppercase text-[#b8c2dc]">
                        <th className="p-2.5">Version</th>
                        <th className="p-2.5">Mode</th>
                        <th className="p-2.5">Status</th>
                        <th className="p-2.5">Base Speed / Gap</th>
                        <th className="p-2.5">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {configs.map((c) => (
                        <tr key={c.id} className="border-b border-[#0a0d1a]/50">
                          <td className="p-2.5 font-arcade-title text-xs text-[#f5b935]">v{c.version}</td>
                          <td className="p-2.5 uppercase">{c.modeSlug}</td>
                          <td className="p-2.5">{c.isActive ? "ACTIVE" : "ARCHIVED"}</td>
                          <td className="p-2.5">
                            {c.physicsConfig?.baseSpeed} px/s &bull; {c.physicsConfig?.baseGap}px
                          </td>
                          <td className="p-2.5 text-[#b8c2dc]">{c.notes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* AUDIT LOGS */}
            {tab === "audit" && (
              <div className="pixel-panel overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#141930] border-b-2 border-[#0a0d1a] text-[10px] uppercase text-[#b8c2dc]">
                      <th className="p-2.5">Timestamp</th>
                      <th className="p-2.5">Actor</th>
                      <th className="p-2.5">Action</th>
                      <th className="p-2.5">Entity</th>
                      <th className="p-2.5">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((l) => (
                      <tr key={l.id} className="border-b border-[#0a0d1a]/50">
                        <td className="p-2.5 text-[#b8c2dc] whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</td>
                        <td className="p-2.5 font-bold">{l.actor?.username ?? "system"}</td>
                        <td className="p-2.5 text-[#f5b935]">{l.action}</td>
                        <td className="p-2.5">{l.entityType}</td>
                        <td className="p-2.5 text-[10px] text-[#b8c2dc] max-w-xs truncate">{JSON.stringify(l.details)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}

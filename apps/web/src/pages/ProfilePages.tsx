import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { AuthUserDTO } from "@skyhop/shared";
import { apiRequest, ApiClientError } from "../api/client.js";
import { CosmeticPreviewStage } from "../components/CosmeticPreviewStage.js";
import { Layout } from "../components/Layout.js";
import { LoadingScreen } from "../components/LoadingScreen.js";
import { useApp } from "../store/AppContext.js";

interface FullProfile {
  isPrivate: boolean;
  id?: string;
  username: string;
  displayName: string;
  bio?: string;
  title: string | null;
  createdAt: string;
  avatarSlug?: string;
  frameSlug?: string;
  equipped?: {
    birdSkin: string;
    scene: string;
    obstacleSkin: string;
    groundTexture: string;
    particleTrail: string;
    avatar: string;
    frame: string;
  };
  progression?: {
    level: number;
    xp: number;
    currentLevelXp: number;
    nextLevelXp: number;
    progressPercent: number;
  };
  stats?: {
    totalGames: number;
    highestScore: number;
    classicHighScore: number;
    hardcoreHighScore: number;
    zenHighScore: number;
    dailyHighScore: number;
    averageScore: number;
    totalObstaclesPassed: number;
    totalPlaytimeMs: number;
    dailyChallengesCompleted: number;
    globalRank: number | null;
    coinsEarned: number;
    coinsSpent: number;
  } | null;
  privateInfo?: {
    email: string;
    emailVerified: boolean;
    walletBalance: number;
    privacy: {
      isPublic: boolean;
      showStats: boolean;
      showCosmetics: boolean;
      showFriends: boolean;
    };
    unlockedTitles: string[];
  } | null;
  achievements?: Array<{
    slug: string;
    name: string;
    description: string;
    category: string;
    unlockedAt: string | null;
  }>;
  unlockedCosmetics?: Array<{
    slug: string;
    name: string;
    category: string;
    rarity: string;
    previewUrl: string;
  }>;
}

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function ProfileContent({
  profile,
  isOwner,
  onSaved,
}: {
  profile: FullProfile;
  isOwner: boolean;
  onSaved?: () => void;
}) {
  const { user, setUserDirect, pushToast } = useApp();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [title, setTitle] = useState(profile.title ?? "");
  const [isPublic, setIsPublic] = useState(profile.privateInfo?.privacy.isPublic ?? true);
  const [showStats, setShowStats] = useState(profile.privateInfo?.privacy.showStats ?? true);
  const [showCosmetics, setShowCosmetics] = useState(profile.privateInfo?.privacy.showCosmetics ?? true);
  const [saving, setSaving] = useState(false);

  if (profile.isPrivate) {
    return (
      <div className="pixel-panel max-w-lg mx-auto p-6 text-center space-y-3">
        <img
          src={`/assets/avatars/${profile.avatarSlug ?? "avatar-sparrow-pilot"}.png`}
          alt={profile.username}
          className="w-16 h-16 mx-auto pixel-art border-2 border-[#0a0d1a]"
        />
        <h1 className="font-arcade-title text-base text-[#f5b935]">{profile.displayName}</h1>
        <p className="text-xs text-[#b8c2dc]">@{profile.username}</p>
        <p className="text-xs text-[#b8c2dc] pixel-panel-inset p-3">
          This pilot&apos;s profile is set to Private.
        </p>
      </div>
    );
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiRequest<{ user: AuthUserDTO }>("/api/users/me/profile", {
        method: "PATCH",
        body: {
          displayName,
          bio,
          title: title || null,
          isPublic,
          showStats,
          showCosmetics,
        },
      });
      setUserDirect(res.user);
      setEditing(false);
      pushToast("Profile updated!", "success");
      onSaved?.();
    } catch (err) {
      pushToast(err instanceof ApiClientError ? err.message : "Failed to update profile.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleAddFriend = async () => {
    try {
      await apiRequest("/api/friends/requests", {
        method: "POST",
        body: { username: profile.username },
      });
      pushToast(`Friend request sent to ${profile.username}!`, "success");
    } catch (err) {
      pushToast(err instanceof ApiClientError ? err.message : "Could not send request.", "error");
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="pixel-panel p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
        <div className="lg:col-span-7 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="relative shrink-0">
            <img
              src={`/assets/avatars/${profile.equipped?.avatar ?? "avatar-sparrow-pilot"}.png`}
              alt={profile.username}
              className="w-20 h-20 pixel-art border-[3px] border-[#0a0d1a]"
            />
            <img
              src={`/assets/frames/${profile.equipped?.frame ?? "frame-classic-brass"}.png`}
              alt=""
              className="w-20 h-20 pixel-art absolute inset-0 pointer-events-none"
            />
          </div>
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-arcade-title text-lg text-[#f5b935]">{profile.displayName}</h1>
              {profile.progression && (
                <span className="px-2 py-0.5 text-[10px] font-bold bg-[#38a3f1] text-[#091224]">
                  LV {profile.progression.level}
                </span>
              )}
              {profile.title && (
                <span className="px-2 py-0.5 text-[10px] font-bold bg-[#f5b935]/20 border border-[#f5b935] text-[#f5b935]">
                  {profile.title}
                </span>
              )}
            </div>
            <p className="text-xs text-[#b8c2dc]">
              @{profile.username} &bull; Joined {new Date(profile.createdAt).toLocaleDateString()}
            </p>
            {profile.bio && <p className="text-xs text-[#fef8e6]">{profile.bio}</p>}

            {profile.progression && (
              <div className="pt-1 max-w-sm">
                <div className="h-3 pixel-panel-inset overflow-hidden">
                  <div
                    className="h-full bg-[#3ac463]"
                    style={{ width: `${profile.progression.progressPercent}%` }}
                  />
                </div>
                <div className="text-[10px] text-[#b8c2dc] mt-0.5">
                  XP {profile.progression.xp.toLocaleString()} ({profile.progression.currentLevelXp} /{" "}
                  {profile.progression.nextLevelXp} to LV {profile.progression.level + 1})
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              {isOwner ? (
                <>
                  <button
                    type="button"
                    onClick={() => setEditing((e) => !e)}
                    className="pixel-btn pixel-btn-primary text-[11px]"
                  >
                    {editing ? "Cancel Edit" : "Edit Profile & Privacy"}
                  </button>
                  <Link to="/account" className="pixel-btn pixel-btn-secondary text-[11px]">
                    Account Security
                  </Link>
                  <Link to="/wallet" className="pixel-btn pixel-btn-secondary text-[11px]">
                    Wallet ({profile.privateInfo?.walletBalance.toLocaleString() ?? 0} C)
                  </Link>
                </>
              ) : (
                user && (
                  <>
                    <button type="button" onClick={() => void handleAddFriend()} className="pixel-btn pixel-btn-green text-[11px]">
                      Add Friend
                    </button>
                    <Link to={`/friends?compare=${profile.username}`} className="pixel-btn pixel-btn-secondary text-[11px]">
                      Compare Stats
                    </Link>
                  </>
                )
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 flex justify-center lg:justify-end">
          <CosmeticPreviewStage
            birdSlug={profile.equipped?.birdSkin ?? "classic-sparrow"}
            sceneSlug={profile.equipped?.scene ?? "sunny-meadow"}
            obstacleSlug={profile.equipped?.obstacleSkin}
            groundSlug={profile.equipped?.groundTexture}
            trailSlug={profile.equipped?.particleTrail}
            width={280}
            height={165}
          />
        </div>
      </div>

      {/* Inline Profile & Privacy Editor (Owner Only) */}
      {isOwner && editing && (
        <form onSubmit={handleSave} className="pixel-panel p-5 space-y-4">
          <h2 className="font-arcade-title text-xs text-[#38a3f1]">EDIT PROFILE &amp; PRIVACY</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-[#b8c2dc]">Display Name</label>
              <input
                type="text"
                required
                maxLength={32}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="pixel-input text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-[#b8c2dc]">Equipped Title</label>
              <select value={title} onChange={(e) => setTitle(e.target.value)} className="pixel-input text-xs">
                <option value="">No Title</option>
                {(profile.privateInfo?.unlockedTitles ?? []).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-[#b8c2dc]">Bio</label>
            <textarea
              rows={2}
              maxLength={240}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="pixel-input text-xs"
            />
          </div>

          <div className="flex flex-wrap gap-5 text-xs">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
              Public Profile
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={showStats} onChange={(e) => setShowStats(e.target.checked)} />
              Show Gameplay Stats
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={showCosmetics} onChange={(e) => setShowCosmetics(e.target.checked)} />
              Show Unlocked Cosmetics
            </label>
          </div>

          <button type="submit" disabled={saving} className="pixel-btn pixel-btn-green text-xs">
            {saving ? "SAVING..." : "SAVE CHANGES"}
          </button>
        </form>
      )}

      {/* Career Stats Grid */}
      {profile.stats ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            ["Global Rank", profile.stats.globalRank ? `#${profile.stats.globalRank}` : "Unranked"],
            ["Highest Score", String(profile.stats.highestScore)],
            ["Classic Best", String(profile.stats.classicHighScore)],
            ["Hardcore Best", String(profile.stats.hardcoreHighScore)],
            ["Daily Best", String(profile.stats.dailyHighScore)],
            ["Games Played", String(profile.stats.totalGames)],
            ["Average Score", String(profile.stats.averageScore)],
            ["Obstacles Passed", profile.stats.totalObstaclesPassed.toLocaleString()],
            ["Total Playtime", formatDuration(profile.stats.totalPlaytimeMs)],
            ["Coins Earned / Spent", `${profile.stats.coinsEarned} / ${profile.stats.coinsSpent}`],
          ].map(([label, val]) => (
            <div key={label} className="pixel-panel p-3.5">
              <div className="text-[10px] text-[#b8c2dc] uppercase">{label}</div>
              <div className="font-arcade-title text-sm text-[#fef8e6] mt-1">{val}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="pixel-panel p-4 text-xs text-[#b8c2dc]">This player hides gameplay statistics publicly.</div>
      )}

      {/* Unlocked Achievements & Cosmetics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="pixel-panel p-4 space-y-3">
          <h2 className="font-arcade-title text-xs text-[#f5b935]">
            ACHIEVEMENTS ({profile.achievements?.length ?? 0})
          </h2>
          {!profile.achievements || profile.achievements.length === 0 ? (
            <p className="text-xs text-[#b8c2dc]">No achievements unlocked yet.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {profile.achievements.map((a) => (
                <div key={a.slug} className="pixel-panel-inset p-2.5 flex justify-between items-center text-xs">
                  <div>
                    <div className="font-bold text-[#fef8e6]">{a.name}</div>
                    <div className="text-[10px] text-[#b8c2dc]">{a.description}</div>
                  </div>
                  <span className="text-[10px] text-[#3ac463] shrink-0">
                    {a.unlockedAt ? new Date(a.unlockedAt).toLocaleDateString() : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pixel-panel p-4 space-y-3">
          <h2 className="font-arcade-title text-xs text-[#38a3f1]">
            UNLOCKED COSMETICS ({profile.unlockedCosmetics?.length ?? 0})
          </h2>
          {!profile.unlockedCosmetics || profile.unlockedCosmetics.length === 0 ? (
            <p className="text-xs text-[#b8c2dc]">No cosmetics visible.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-72 overflow-y-auto pr-1">
              {profile.unlockedCosmetics.map((c) => (
                <div key={c.slug} className="pixel-panel-inset p-2 text-center space-y-1">
                  {c.previewUrl && (
                    <img src={c.previewUrl} alt={c.name} className="w-12 h-10 mx-auto pixel-art object-contain" />
                  )}
                  <div className="text-[10px] truncate">{c.name}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function PlayerProfilePage() {
  const { user } = useApp();
  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const userId = user?.id ?? null;

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest<{ profile: FullProfile }>("/api/users/me/profile");
      setProfile(res.profile);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!user) {
    return (
      <Layout>
        <div className="pixel-panel max-w-md mx-auto p-6 text-center space-y-4">
          <h1 className="font-arcade-title text-base text-[#f5b935]">PLAYER PROFILE</h1>
          <p className="text-xs text-[#b8c2dc]">Sign in to view your career statistics, rank, and achievements.</p>
          <Link to="/login" className="pixel-btn pixel-btn-primary text-xs">Sign In</Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {loading || !profile ? (
        <LoadingScreen label="LOADING PILOT DOSSIER..." />
      ) : (
        <ProfileContent profile={profile} isOwner={true} onSaved={() => void load()} />
      )}
    </Layout>
  );
}

export function PublicPlayerProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { user } = useApp();
  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!username) return;
    setLoading(true);
    setError(null);
    apiRequest<{ profile: FullProfile }>(`/api/users/${encodeURIComponent(username)}`)
      .then((res) => setProfile(res.profile))
      .catch((err) => setError(err instanceof ApiClientError ? err.message : "Player not found."))
      .finally(() => setLoading(false));
  }, [username]);

  return (
    <Layout>
      {loading ? (
        <LoadingScreen label="FETCHING PUBLIC PROFILE..." />
      ) : error || !profile ? (
        <div className="pixel-panel max-w-md mx-auto p-6 text-center space-y-3">
          <h1 className="font-arcade-title text-base text-[#e84545]">PLAYER NOT FOUND</h1>
          <p className="text-xs text-[#b8c2dc]">{error || "Could not locate that pilot."}</p>
          <Link to="/leaderboards" className="pixel-btn pixel-btn-secondary text-xs">
            Back to Leaderboards
          </Link>
        </div>
      ) : (
        <ProfileContent
          profile={profile}
          isOwner={Boolean(user && profile.id && user.id === profile.id)}
        />
      )}
    </Layout>
  );
}

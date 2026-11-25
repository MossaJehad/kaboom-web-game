import type { CosmeticCategory, CosmeticRarity, GameModeSlug } from "./constants.js";

export type UserRole = "USER" | "MODERATOR" | "ADMIN";
export type UserStatus = "ACTIVE" | "SUSPENDED" | "BANNED";

export interface EquippedLoadoutDTO {
  birdSkin: string;
  scene: string;
  obstacleSkin: string;
  groundTexture: string;
  particleTrail: string;
  flapEffect: string;
  gameOverEffect: string;
  avatar: string;
  frame: string;
}

export interface PlayerSettingsDTO {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  ambientVolume: number;
  reducedMotion: boolean;
  highContrast: boolean;
  screenShake: boolean;
  vibration: boolean;
  flapKey: string;
  pauseKey: string;
  showFps: boolean;
}

export interface AuthUserDTO {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  createdAt: string;
  walletBalance: number;
  level: number;
  xp: number;
  nextLevelXp: number;
  currentLevelXp: number;
  levelProgressPercent: number;
  profile: {
    displayName: string;
    bio: string;
    title: string | null;
    isPublic: boolean;
    showStats: boolean;
    showCosmetics: boolean;
    showFriends: boolean;
  };
  equipped: EquippedLoadoutDTO;
  settings: PlayerSettingsDTO;
  unlockedTitles: string[];
}

export interface CosmeticItemDTO {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: CosmeticCategory;
  rarity: CosmeticRarity;
  price: number;
  isDefault: boolean;
  isAvailable: boolean;
  requiredLevel: number;
  unlockRequirementDesc: string | null;
  metadata: Record<string, unknown>;
  assets: Array<{
    assetRole: string;
    url: string;
    width: number;
    height: number;
    frameCount: number;
  }>;
  owned: boolean;
  equipped: boolean;
  lockedByLevel: boolean;
}

export interface LeaderboardEntryDTO {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  avatarSlug: string;
  frameSlug: string;
  equippedBirdSlug: string;
  score: number;
  achievedAt: string;
  modeSlug: GameModeSlug;
}

export interface SessionRewardSummaryDTO {
  resultId: string;
  verifiedScore: number;
  obstaclesPassed: number;
  durationMs: number;
  isPersonalRecord: boolean;
  previousBest: number;
  coinsBreakdown: {
    obstacles: number;
    firstGameOfDay: number;
    personalRecord: number;
    dailyChallenge: number;
    levelUps: number;
    total: number;
  };
  xpAwarded: number;
  newTotalXp: number;
  newLevel: number;
  leveledUp: boolean;
  levelsGained: Array<{
    level: number;
    coins: number;
    title?: string;
    unlockCosmeticSlug?: string;
  }>;
  newWalletBalance: number;
  newlyUnlockedAchievements: Array<{
    slug: string;
    name: string;
    rewardCoins: number;
  }>;
  dailyChallengeCompleted: boolean;
  flagged: boolean;
  flagReason: string | null;
}

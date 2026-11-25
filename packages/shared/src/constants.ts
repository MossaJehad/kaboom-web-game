export const WORLD_WIDTH = 400;
export const WORLD_HEIGHT = 600;
export const GROUND_HEIGHT = 80;
export const GROUND_Y = WORLD_HEIGHT - GROUND_HEIGHT; // 520
export const CEILING_Y = 18;
export const BIRD_X = 110;
export const BIRD_START_Y = 250;
export const BIRD_HITBOX_HALF_W = 11;
export const BIRD_HITBOX_HALF_H = 9;
export const BIRD_SPRITE_WIDTH = 36;
export const BIRD_SPRITE_HEIGHT = 28;
export const OBSTACLE_WIDTH = 56;
export const FIXED_TPS = 60;
export const FIXED_DT = 1 / FIXED_TPS;

export const GAME_MODE_SLUGS = [
  "classic",
  "hardcore",
  "zen",
  "daily_challenge",
] as const;

export type GameModeSlug = (typeof GAME_MODE_SLUGS)[number];

export interface ModePhysicsConfig {
  gravity: number;
  flapVelocity: number;
  maxFallSpeed: number;
  baseSpeed: number;
  maxSpeed: number;
  speedIncrementPerScore: number;
  baseGap: number;
  minGap: number;
  gapDecrementPerScore: number;
  obstacleSpacing: number;
  firstObstacleX: number;
  minGapCenterY: number;
  maxGapCenterY: number;
  maxDeltaYFactor: number;
  minFlapIntervalTicks: number;
  allowPause: boolean;
  isRanked: boolean;
}

export const DEFAULT_MODE_CONFIGS: Record<GameModeSlug, ModePhysicsConfig> = {
  classic: {
    gravity: 1280,
    flapVelocity: -325,
    maxFallSpeed: 540,
    baseSpeed: 138,
    maxSpeed: 215,
    speedIncrementPerScore: 1.4,
    baseGap: 148,
    minGap: 110,
    gapDecrementPerScore: 0.7,
    obstacleSpacing: 215,
    firstObstacleX: 460,
    minGapCenterY: 125,
    maxGapCenterY: 385,
    maxDeltaYFactor: 0.6,
    minFlapIntervalTicks: 4,
    allowPause: true,
    isRanked: true,
  },
  hardcore: {
    gravity: 1450,
    flapVelocity: -345,
    maxFallSpeed: 600,
    baseSpeed: 175,
    maxSpeed: 265,
    speedIncrementPerScore: 1.9,
    baseGap: 122,
    minGap: 96,
    gapDecrementPerScore: 0.65,
    obstacleSpacing: 205,
    firstObstacleX: 450,
    minGapCenterY: 120,
    maxGapCenterY: 390,
    maxDeltaYFactor: 0.65,
    minFlapIntervalTicks: 4,
    allowPause: false,
    isRanked: true,
  },
  zen: {
    gravity: 980,
    flapVelocity: -285,
    maxFallSpeed: 420,
    baseSpeed: 108,
    maxSpeed: 132,
    speedIncrementPerScore: 0.5,
    baseGap: 176,
    minGap: 152,
    gapDecrementPerScore: 0.35,
    obstacleSpacing: 245,
    firstObstacleX: 480,
    minGapCenterY: 140,
    maxGapCenterY: 370,
    maxDeltaYFactor: 0.48,
    minFlapIntervalTicks: 4,
    allowPause: true,
    isRanked: false,
  },
  daily_challenge: {
    gravity: 1320,
    flapVelocity: -332,
    maxFallSpeed: 560,
    baseSpeed: 148,
    maxSpeed: 230,
    speedIncrementPerScore: 1.6,
    baseGap: 140,
    minGap: 104,
    gapDecrementPerScore: 0.7,
    obstacleSpacing: 212,
    firstObstacleX: 460,
    minGapCenterY: 125,
    maxGapCenterY: 385,
    maxDeltaYFactor: 0.62,
    minFlapIntervalTicks: 4,
    allowPause: false,
    isRanked: true,
  },
};

export interface EconomyConfig {
  newAccountCoins: number;
  obstaclesPerCoin: number;
  firstGameOfDayCoins: number;
  dailyChallengeCompletionCoins: number;
  dailyChallengeTargetScore: number;
  newPersonalRecordCoins: number;
  minScoreForPrBonus: number;
  maxPrBonusesPerDayPerMode: number;
  dailyObstacleCoinCap: number;
  minFirstGameScore: number;
  minFirstGameDurationMs: number;
}

export const DEFAULT_ECONOMY_CONFIG: EconomyConfig = {
  newAccountCoins: 100,
  obstaclesPerCoin: 5,
  firstGameOfDayCoins: 10,
  dailyChallengeCompletionCoins: 25,
  dailyChallengeTargetScore: 10,
  newPersonalRecordCoins: 15,
  minScoreForPrBonus: 5,
  maxPrBonusesPerDayPerMode: 5,
  dailyObstacleCoinCap: 500,
  minFirstGameScore: 1,
  minFirstGameDurationMs: 5000,
};

export interface AntiCheatConfig {
  maxReplayFlaps: number;
  maxSessionTicks: number;
  sessionTtlMinutes: number;
  wallClockToleranceSec: number;
  minWallClockFactor: number;
  roboticIntervalStdDevThreshold: number;
  roboticMinFlapsCheck: number;
}

export const DEFAULT_ANTICHEAT_CONFIG: AntiCheatConfig = {
  maxReplayFlaps: 25000,
  maxSessionTicks: 60 * 60 * 60, // 1 hour at 60 tps
  sessionTtlMinutes: 90,
  wallClockToleranceSec: 3.0,
  minWallClockFactor: 0.85,
  roboticIntervalStdDevThreshold: 0.35,
  roboticMinFlapsCheck: 40,
};

export const COSMETIC_CATEGORIES = [
  "BIRD_SKIN",
  "SCENE",
  "OBSTACLE_SKIN",
  "GROUND_TEXTURE",
  "PARTICLE_TRAIL",
  "FLAP_EFFECT",
  "GAME_OVER_EFFECT",
  "PROFILE_AVATAR",
  "PROFILE_FRAME",
] as const;

export type CosmeticCategory = (typeof COSMETIC_CATEGORIES)[number];

export const COSMETIC_RARITIES = [
  "COMMON",
  "UNCOMMON",
  "RARE",
  "EPIC",
  "LEGENDARY",
] as const;

export type CosmeticRarity = (typeof COSMETIC_RARITIES)[number];

export const RARITY_COLORS: Record<CosmeticRarity, string> = {
  COMMON: "#9ca3af",
  UNCOMMON: "#22c55e",
  RARE: "#3b82f6",
  EPIC: "#a855f7",
  LEGENDARY: "#f59e0b",
};

export const GAME_STATES = [
  "LOADING",
  "MAIN_MENU",
  "READY",
  "COUNTDOWN",
  "PLAYING",
  "PAUSED",
  "GAME_OVER",
  "RESULTS",
  "RESTARTING",
] as const;

export type GameState = (typeof GAME_STATES)[number];

export interface LevelRewardDefinition {
  level: number;
  coins: number;
  title?: string;
  unlockCosmeticSlug?: string;
}

export const LEVEL_MILESTONE_REWARDS: LevelRewardDefinition[] = [
  { level: 2, coins: 25, title: "Cloud Hopper" },
  { level: 5, coins: 60, title: "Wind Glider", unlockCosmeticSlug: "frame-silver-wing" },
  { level: 10, coins: 120, title: "Sky Ace", unlockCosmeticSlug: "trail-starlight" },
  { level: 15, coins: 200, title: "Storm Chaser", unlockCosmeticSlug: "avatar-ace-goggles" },
  { level: 20, coins: 300, title: "Horizon Master", unlockCosmeticSlug: "frame-royal-gold" },
  { level: 30, coins: 500, title: "Aether Sovereign" },
  { level: 50, coins: 1000, title: "Celestial Legend" },
];

export function xpRequiredForLevel(level: number): number {
  if (level <= 1) return 0;
  // Cumulative XP needed to reach `level`
  // Smooth RPG arcade curve: level 2 = 100, level 3 = 250, level 4 = 450, ...
  let total = 0;
  for (let l = 1; l < level; l++) {
    total += Math.floor(100 + (l - 1) * 55 + Math.pow(l - 1, 1.35) * 18);
  }
  return total;
}

export function calculateLevelProgress(totalXp: number): {
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progressPercent: number;
} {
  let level = 1;
  while (xpRequiredForLevel(level + 1) <= totalXp && level < 100) {
    level++;
  }
  const floorXp = xpRequiredForLevel(level);
  const ceilXp = xpRequiredForLevel(level + 1);
  const span = Math.max(1, ceilXp - floorXp);
  const current = Math.max(0, totalXp - floorXp);
  return {
    level,
    currentLevelXp: current,
    nextLevelXp: span,
    progressPercent: Math.min(100, Math.round((current / span) * 100)),
  };
}

export function getLevelReward(level: number): LevelRewardDefinition {
  const milestone = LEVEL_MILESTONE_REWARDS.find((m) => m.level === level);
  if (milestone) return milestone;
  return {
    level,
    coins: Math.min(250, 15 + level * 5),
  };
}

export function calculateSessionXp(params: {
  score: number;
  durationMs: number;
  mode: GameModeSlug;
  isDailyChallengeCompleted: boolean;
  isPersonalRecord: boolean;
}): number {
  const modeMultiplier =
    params.mode === "hardcore"
      ? 1.5
      : params.mode === "daily_challenge"
        ? 1.25
        : params.mode === "zen"
          ? 0.5
          : 1.0;

  const baseXp = params.durationMs >= 4000 ? 10 : 3;
  const obstacleXp = params.score * 6;
  const prBonus = params.isPersonalRecord ? 25 : 0;
  const dailyBonus = params.isDailyChallengeCompleted ? 50 : 0;
  return Math.max(1, Math.round((baseXp + obstacleXp) * modeMultiplier) + prBonus + dailyBonus);
}

import { z } from "zod";
import { COSMETIC_CATEGORIES, COSMETIC_RARITIES, GAME_MODE_SLUGS } from "./constants.js";

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(20, "Username must be at most 20 characters")
  .regex(/^[a-zA-Z0-9_-]+$/, "Username may only contain letters, numbers, underscores, and hyphens");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters")
  .regex(/[A-Za-z]/, "Password must include at least one letter")
  .regex(/[0-9]/, "Password must include at least one number");

export const registerSchema = z.object({
  email: z.string().trim().email("Valid email address required").max(255),
  username: usernameSchema,
  password: passwordSchema,
  guestMigration: z
    .object({
      localClassicBest: z.number().int().min(0).max(9999).optional(),
      localGamesPlayed: z.number().int().min(0).max(10000).optional(),
      settings: z
        .object({
          masterVolume: z.number().min(0).max(1).optional(),
          musicVolume: z.number().min(0).max(1).optional(),
          sfxVolume: z.number().min(0).max(1).optional(),
          ambientVolume: z.number().min(0).max(1).optional(),
          reducedMotion: z.boolean().optional(),
          highContrast: z.boolean().optional(),
          screenShake: z.boolean().optional(),
          vibration: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Email or username is required").max(255),
  password: z.string().min(1, "Password is required").max(128),
});

export const verifyEmailSchema = z.object({
  token: z.string().trim().min(10, "Verification token is required"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Valid email required"),
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(10, "Reset token is required"),
  newPassword: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: passwordSchema,
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Password confirmation required"),
  confirmText: z.literal("DELETE"),
});

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(32).optional(),
  bio: z.string().trim().max(240).optional(),
  title: z.string().trim().max(40).nullable().optional(),
  isPublic: z.boolean().optional(),
  showStats: z.boolean().optional(),
  showCosmetics: z.boolean().optional(),
  showFriends: z.boolean().optional(),
});

export const updateUsernameSchema = z.object({
  username: usernameSchema,
});

export const updateSettingsSchema = z.object({
  masterVolume: z.number().min(0).max(1).optional(),
  musicVolume: z.number().min(0).max(1).optional(),
  sfxVolume: z.number().min(0).max(1).optional(),
  ambientVolume: z.number().min(0).max(1).optional(),
  reducedMotion: z.boolean().optional(),
  highContrast: z.boolean().optional(),
  screenShake: z.boolean().optional(),
  vibration: z.boolean().optional(),
  flapKey: z.string().min(1).max(20).optional(),
  pauseKey: z.string().min(1).max(20).optional(),
  showFps: z.boolean().optional(),
});

export const startGameSessionSchema = z.object({
  mode: z.enum(GAME_MODE_SLUGS),
});

export const submitGameSessionSchema = z.object({
  sessionId: z.string().min(1),
  flapTicks: z.array(z.number().int().min(0)).max(25000),
  totalTicks: z.number().int().min(0).max(60 * 60 * 60),
  clientClaimedScore: z.number().int().min(0).max(100000).optional(),
  pauseDurationMs: z.number().int().min(0).max(3600000).optional(),
});

export const purchaseCosmeticSchema = z.object({
  cosmeticSlug: z.string().min(1).max(100),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export const equipCosmeticSchema = z.object({
  category: z.enum(COSMETIC_CATEGORIES),
  cosmeticSlug: z.string().min(1).max(100).nullable(),
});

export const leaderboardQuerySchema = z.object({
  board: z
    .enum(["all_time", "monthly", "weekly", "daily", "daily_challenge", "hardcore", "friends"])
    .default("all_time"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(50).optional(),
});

export const friendRequestSchema = z.object({
  username: usernameSchema,
});

export const blockUserSchema = z.object({
  username: usernameSchema,
  reason: z.string().trim().max(200).optional(),
});

export const adminModerateUserSchema = z.object({
  action: z.enum(["WARN", "SUSPEND", "UNSUSPEND", "BAN", "UNBAN"]),
  reason: z.string().trim().min(3).max(500),
  durationHours: z.number().int().min(1).max(8760).optional(),
});

export const adminAdjustCurrencySchema = z.object({
  amount: z.number().int().min(-100000).max(100000).refine((v) => v !== 0, "Amount must be non-zero"),
  reason: z.string().trim().min(3).max(500),
});

export const adminCosmeticUpsertSchema = z.object({
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().min(2).max(300),
  category: z.enum(COSMETIC_CATEGORIES),
  rarity: z.enum(COSMETIC_RARITIES),
  price: z.number().int().min(0).max(1000000),
  isAvailable: z.boolean().default(true),
  requiredLevel: z.number().int().min(1).max(100).default(1),
  unlockRequirementDesc: z.string().max(150).nullable().optional(),
  previewUrl: z.string().min(1).max(300).optional(),
  assetUrl: z.string().min(1).max(300).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const adminDailyChallengeSchema = z.object({
  challengeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  seed: z.string().trim().min(4).max(128).optional(),
  targetScore: z.number().int().min(1).max(500).default(10),
  rewardCoins: z.number().int().min(0).max(5000).default(25),
  rewardXp: z.number().int().min(0).max(5000).default(50),
  sceneSlug: z.string().min(1).max(80).optional(),
});

export const adminGameConfigSchema = z.object({
  modeSlug: z.enum(GAME_MODE_SLUGS),
  physicsConfig: z.record(z.unknown()),
  economyConfig: z.record(z.unknown()).optional(),
  antiCheatConfig: z.record(z.unknown()).optional(),
  notes: z.string().max(300).optional(),
});

export const adminMissionSchema = z.object({
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().min(2).max(300),
  cadence: z.enum(["DAILY", "WEEKLY"]),
  metricKey: z.string().trim().min(2).max(60),
  targetValue: z.number().int().min(1).max(100000),
  rewardCoins: z.number().int().min(0).max(10000),
  rewardXp: z.number().int().min(0).max(10000),
  isActive: z.boolean().default(true),
});

export const adminAchievementSchema = z.object({
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().min(2).max(300),
  category: z.string().trim().min(2).max(40),
  iconKey: z.string().trim().min(1).max(40),
  metricKey: z.string().trim().min(2).max(60),
  targetValue: z.number().int().min(1).max(1000000),
  rewardCoins: z.number().int().min(0).max(10000),
  rewardXp: z.number().int().min(0).max(10000),
  rewardTitle: z.string().max(50).nullable().optional(),
  isActive: z.boolean().default(true),
});

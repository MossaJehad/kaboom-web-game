import type {
  EquippedLoadoutDTO,
  GameModeSlug,
  GameState,
  ModePhysicsConfig,
  PlayerSettingsDTO,
} from "@skyhop/shared";

export interface EngineSessionConfig {
  sessionId: string | null; // null in guest/offline practice mode
  mode: GameModeSlug;
  seed: string;
  physicsConfig: ModePhysicsConfig;
  countdownEnabled?: boolean;
}

export interface EngineRunOutcome {
  sessionId: string | null;
  mode: GameModeSlug;
  score: number;
  obstaclesPassed: number;
  totalTicks: number;
  flapTicks: number[];
  durationMs: number;
  pauseDurationMs: number;
  deathReason: "GROUND" | "OBSTACLE" | "NONE";
}

export interface EngineEvents {
  onStateChange?: (state: GameState, prevState: GameState) => void;
  onScoreChange?: (score: number) => void;
  onCountdownTick?: (remaining: number) => void;
  onFlap?: () => void;
  onCollision?: (reason: "GROUND" | "OBSTACLE") => void;
  onRunFinished?: (outcome: EngineRunOutcome) => void;
  onFpsUpdate?: (fps: number) => void;
  onAssetsLoaded?: () => void;
  onError?: (error: Error) => void;
}

/**
 * Engine-agnostic interface isolating Kaboom.js 3000.1.17.
 * Swapping Kaboom.js for KAPLAY requires only implementing this adapter interface.
 */
export interface IGameEngineAdapter {
  mount(container: HTMLElement, events: EngineEvents): Promise<void>;
  unmount(): void;
  loadCosmetics(loadout: EquippedLoadoutDTO): Promise<void>;
  updateSettings(settings: PlayerSettingsDTO): void;
  prepareSession(session: EngineSessionConfig): void;
  triggerFlap(): void;
  pause(): boolean;
  resume(): boolean;
  markResultsShown(): void;
  beginRestart(): void;
  getState(): GameState;
  getCurrentScore(): number;
}

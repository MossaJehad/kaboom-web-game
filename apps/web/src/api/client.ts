import type { EquippedLoadoutDTO, PlayerSettingsDTO } from "@skyhop/shared";

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let inMemoryCsrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  inMemoryCsrfToken = token;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : null;
}

export function getCsrfToken(): string | null {
  return inMemoryCsrfToken || readCookie("skyhop_csrf");
}

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || "";

export async function apiRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
  } = {}
): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {};

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    const csrf = getCsrfToken();
    if (csrf) {
      headers["X-CSRF-Token"] = csrf;
    }
  }

  let response: Response;
  try {
    // Use same-origin relative URL when served behind Vite proxy or same domain
    const url = path.startsWith("http") ? path : `${API_BASE && window.location.port === "" ? API_BASE : ""}${path}`;
    response = await fetch(url, {
      method,
      headers,
      credentials: "include",
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch {
    throw new ApiClientError(
      0,
      "NETWORK_ERROR",
      "Unable to reach the SKYHOP server. You can still play offline practice mode."
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    const errObj = data?.error;
    throw new ApiClientError(
      response.status,
      errObj?.code ?? `HTTP_${response.status}`,
      errObj?.message ?? `Request failed (${response.status})`,
      errObj?.details
    );
  }

  return data as T;
}

// ---------- Local Guest Storage (Practice Records & Settings) ----------

export interface GuestLocalState {
  bestScores: Record<string, number>;
  gamesPlayed: number;
  settings: PlayerSettingsDTO;
  loadout: EquippedLoadoutDTO;
}

export const DEFAULT_GUEST_SETTINGS: PlayerSettingsDTO = {
  masterVolume: 0.8,
  musicVolume: 0.55,
  sfxVolume: 0.85,
  ambientVolume: 0.5,
  reducedMotion: false,
  highContrast: false,
  screenShake: true,
  vibration: true,
  flapKey: "Space",
  pauseKey: "Escape",
  showFps: false,
};

export const DEFAULT_LOADOUT: EquippedLoadoutDTO = {
  birdSkin: "classic-sparrow",
  scene: "sunny-meadow",
  obstacleSkin: "obstacle-scene-default",
  groundTexture: "ground-scene-default",
  particleTrail: "trail-classic",
  flapEffect: "flap-classic",
  gameOverEffect: "gameover-classic",
  avatar: "avatar-sparrow-pilot",
  frame: "frame-classic-brass",
};

const GUEST_STORAGE_KEY = "skyhop_guest_state_v1";

export function loadGuestState(): GuestLocalState {
  if (typeof window === "undefined") {
    return { bestScores: {}, gamesPlayed: 0, settings: DEFAULT_GUEST_SETTINGS, loadout: DEFAULT_LOADOUT };
  }
  try {
    const raw = window.localStorage.getItem(GUEST_STORAGE_KEY);
    if (!raw) {
      return { bestScores: {}, gamesPlayed: 0, settings: DEFAULT_GUEST_SETTINGS, loadout: DEFAULT_LOADOUT };
    }
    const parsed = JSON.parse(raw) as Partial<GuestLocalState>;
    return {
      bestScores: parsed.bestScores ?? {},
      gamesPlayed: parsed.gamesPlayed ?? 0,
      settings: { ...DEFAULT_GUEST_SETTINGS, ...(parsed.settings ?? {}) },
      loadout: { ...DEFAULT_LOADOUT, ...(parsed.loadout ?? {}) },
    };
  } catch {
    return { bestScores: {}, gamesPlayed: 0, settings: DEFAULT_GUEST_SETTINGS, loadout: DEFAULT_LOADOUT };
  }
}

export function saveGuestState(state: GuestLocalState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

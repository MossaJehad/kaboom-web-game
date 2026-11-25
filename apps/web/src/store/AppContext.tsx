import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AuthUserDTO, EquippedLoadoutDTO, PlayerSettingsDTO } from "@skyhop/shared";
import {
  apiRequest,
  DEFAULT_LOADOUT,
  loadGuestState,
  saveGuestState,
  setCsrfToken,
  type GuestLocalState,
} from "../api/client.js";
import { audioManager } from "../audio/audioManager.js";

export interface ToastItem {
  id: string;
  message: string;
  variant: "info" | "success" | "error" | "warning";
}

interface AppContextValue {
  user: AuthUserDTO | null;
  authLoading: boolean;
  isOnline: boolean;
  guestState: GuestLocalState;
  activeSettings: PlayerSettingsDTO;
  activeLoadout: EquippedLoadoutDTO;
  toasts: ToastItem[];
  pushToast: (message: string, variant?: ToastItem["variant"]) => void;
  dismissToast: (id: string) => void;
  refreshUser: () => Promise<AuthUserDTO | null>;
  setUserDirect: (user: AuthUserDTO | null, csrfToken?: string | null) => void;
  logout: () => Promise<void>;
  updateSettings: (patch: Partial<PlayerSettingsDTO>) => Promise<void>;
  recordGuestRun: (mode: string, score: number) => void;
  updateWalletBalanceLocal: (balance: number) => void;
  updateEquippedLocal: (equipped: EquippedLoadoutDTO) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const AUTH_SYNC_CHANNEL = "skyhop_auth_sync";

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUserDTO | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [guestState, setGuestState] = useState<GuestLocalState>(() => loadGuestState());
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const pushToast = useCallback((message: string, variant: ToastItem["variant"] = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-4), { id, message, variant }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const refreshUser = useCallback(async (): Promise<AuthUserDTO | null> => {
    try {
      const res = await apiRequest<{ user: AuthUserDTO | null; csrfToken: string | null }>("/api/auth/me");
      setUser(res.user);
      setCsrfToken(res.csrfToken);
      return res.user;
    } catch {
      return null;
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const broadcastAuthChange = useCallback(() => {
    try {
      window.localStorage.setItem(AUTH_SYNC_CHANNEL, String(Date.now()));
    } catch {
      // ignore
    }
  }, []);

  const setUserDirect = useCallback(
    (nextUser: AuthUserDTO | null, csrfToken?: string | null) => {
      setUser(nextUser);
      if (csrfToken !== undefined) {
        setCsrfToken(csrfToken);
      }
      broadcastAuthChange();
    },
    [broadcastAuthChange]
  );

  const logout = useCallback(async () => {
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
    } catch {
      // clear locally regardless
    }
    setUser(null);
    setCsrfToken(null);
    broadcastAuthChange();
    pushToast("Signed out safely.", "info");
  }, [broadcastAuthChange, pushToast]);

  const activeSettings = useMemo<PlayerSettingsDTO>(() => {
    return user?.settings ?? guestState.settings;
  }, [user, guestState.settings]);

  const activeLoadout = useMemo<EquippedLoadoutDTO>(() => {
    return user?.equipped ?? guestState.loadout ?? DEFAULT_LOADOUT;
  }, [user, guestState.loadout]);

  const updateSettings = useCallback(
    async (patch: Partial<PlayerSettingsDTO>) => {
      const merged = { ...activeSettings, ...patch };
      audioManager.applySettings(merged);
      if (user) {
        setUser((prev) => (prev ? { ...prev, settings: merged } : null));
        try {
          await apiRequest("/api/users/me/settings", { method: "PATCH", body: patch });
        } catch {
          pushToast("Could not sync settings to server right now.", "warning");
        }
      } else {
        setGuestState((prev) => {
          const next = { ...prev, settings: merged };
          saveGuestState(next);
          return next;
        });
      }
    },
    [activeSettings, user, pushToast]
  );

  const recordGuestRun = useCallback((mode: string, score: number) => {
    setGuestState((prev) => {
      const best = Math.max(prev.bestScores[mode] ?? 0, score);
      const next: GuestLocalState = {
        ...prev,
        gamesPlayed: prev.gamesPlayed + 1,
        bestScores: { ...prev.bestScores, [mode]: best },
      };
      saveGuestState(next);
      return next;
    });
  }, []);

  const updateWalletBalanceLocal = useCallback((balance: number) => {
    setUser((prev) => (prev ? { ...prev, walletBalance: balance } : null));
  }, []);

  const updateEquippedLocal = useCallback((equipped: EquippedLoadoutDTO) => {
    setUser((prev) => (prev ? { ...prev, equipped } : null));
  }, []);

  // Initial auth check + online/offline + multi-tab session sync + audio autoplay unlock
  useEffect(() => {
    void refreshUser();

    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    const onStorage = (e: StorageEvent) => {
      if (e.key === AUTH_SYNC_CHANNEL) {
        void refreshUser();
      }
    };
    const unlockAudio = () => audioManager.unlock();

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("storage", onStorage);
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, [refreshUser]);

  // Apply visual accessibility & audio preferences immediately
  useEffect(() => {
    audioManager.applySettings(activeSettings);
    const root = document.documentElement;
    root.classList.toggle("reduced-motion", activeSettings.reducedMotion);
    root.classList.toggle("high-contrast", activeSettings.highContrast);
  }, [activeSettings]);

  const value: AppContextValue = {
    user,
    authLoading,
    isOnline,
    guestState,
    activeSettings,
    activeLoadout,
    toasts,
    pushToast,
    dismissToast,
    refreshUser,
    setUserDirect,
    logout,
    updateSettings,
    recordGuestRun,
    updateWalletBalanceLocal,
    updateEquippedLocal,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}

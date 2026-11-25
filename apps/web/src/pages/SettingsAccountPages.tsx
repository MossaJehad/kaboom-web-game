import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { AuthUserDTO } from "@skyhop/shared";
import { apiRequest, ApiClientError } from "../api/client.js";
import { audioManager } from "../audio/audioManager.js";
import { Layout } from "../components/Layout.js";
import { useApp } from "../store/AppContext.js";

export function SettingsPage() {
  const { activeSettings, updateSettings, pushToast } = useApp();
  const [capturingKey, setCapturingKey] = useState<"flapKey" | "pauseKey" | null>(null);

  const captureKey = (field: "flapKey" | "pauseKey") => {
    setCapturingKey(field);
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      window.removeEventListener("keydown", handler);
      setCapturingKey(null);
      void updateSettings({ [field]: e.code });
      pushToast(`Bound ${field === "flapKey" ? "Flap" : "Pause"} to ${e.code}`, "success");
    };
    window.addEventListener("keydown", handler, { once: true });
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="pixel-panel p-4">
          <h1 className="font-arcade-title text-lg text-[#f5b935]">SETTINGS &amp; ACCESSIBILITY</h1>
          <p className="text-xs text-[#b8c2dc] mt-1">
            Preferences persist automatically to your account (or browser when playing as Guest).
          </p>
        </div>

        {/* Audio Mix */}
        <section className="pixel-panel p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-arcade-title text-xs text-[#38a3f1]">AUDIO MIXER</h2>
            <button
              type="button"
              onClick={() => {
                audioManager.unlock();
                void audioManager.playSfx("score");
              }}
              className="pixel-btn pixel-btn-secondary text-[10px]"
            >
              Test Sound
            </button>
          </div>

          {(
            [
              ["masterVolume", "Master Volume"],
              ["musicVolume", "Arcade Music"],
              ["sfxVolume", "Sound Effects"],
              ["ambientVolume", "Scene Ambience"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-1">
              <div className="flex justify-between text-xs">
                <label htmlFor={`slider-${key}`}>{label}</label>
                <span className="text-[#f5b935]">{Math.round(activeSettings[key] * 100)}%</span>
              </div>
              <input
                id={`slider-${key}`}
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={activeSettings[key]}
                onChange={(e) => void updateSettings({ [key]: Number(e.target.value) })}
                className="w-full accent-[#f5b935]"
              />
            </div>
          ))}
        </section>

        {/* Accessibility & Feedback */}
        <section className="pixel-panel p-5 space-y-3 text-xs">
          <h2 className="font-arcade-title text-xs text-[#3ac463]">ACCESSIBILITY &amp; DISPLAY</h2>
          {(
            [
              ["reducedMotion", "Reduced Motion (disables decorative particles & screen shake without changing physics)"],
              ["highContrast", "High Contrast Arcade Theme"],
              ["screenShake", "Collision Screen Shake"],
              ["vibration", "Mobile Haptic Vibration on Collision"],
              ["showFps", "Show Live FPS Counter During Gameplay"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between gap-3 pixel-panel-inset p-3 cursor-pointer">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={activeSettings[key]}
                onChange={(e) => void updateSettings({ [key]: e.target.checked })}
                className="w-4 h-4 accent-[#f5b935]"
              />
            </label>
          ))}
        </section>

        {/* Key Bindings */}
        <section className="pixel-panel p-5 space-y-3 text-xs">
          <h2 className="font-arcade-title text-xs text-[#f5b935]">KEYBOARD CONTROLS</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="pixel-panel-inset p-3 flex items-center justify-between">
              <div>
                <div className="text-[#b8c2dc] text-[10px]">FLAP KEY</div>
                <div className="font-bold mt-0.5">{activeSettings.flapKey}</div>
              </div>
              <button
                type="button"
                onClick={() => captureKey("flapKey")}
                className="pixel-btn pixel-btn-secondary text-[10px]"
              >
                {capturingKey === "flapKey" ? "Press Key..." : "Rebind"}
              </button>
            </div>
            <div className="pixel-panel-inset p-3 flex items-center justify-between">
              <div>
                <div className="text-[#b8c2dc] text-[10px]">PAUSE KEY</div>
                <div className="font-bold mt-0.5">{activeSettings.pauseKey}</div>
              </div>
              <button
                type="button"
                onClick={() => captureKey("pauseKey")}
                className="pixel-btn pixel-btn-secondary text-[10px]"
              >
                {capturingKey === "pauseKey" ? "Press Key..." : "Rebind"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}

export function AccountPage() {
  const { user, setUserDirect, pushToast } = useApp();
  const navigate = useNavigate();

  const [newUsername, setNewUsername] = useState(user?.username ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");

  if (!user) {
    return (
      <Layout>
        <div className="pixel-panel max-w-md mx-auto p-6 text-center space-y-4">
          <h1 className="font-arcade-title text-base text-[#f5b935]">ACCOUNT MANAGEMENT</h1>
          <p className="text-xs text-[#b8c2dc]">Sign in to manage your username, password, or account deletion.</p>
          <Link to="/login" className="pixel-btn pixel-btn-primary text-xs">Sign In</Link>
        </div>
      </Layout>
    );
  }

  const handleUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest<{ user: AuthUserDTO }>("/api/users/me/username", {
        method: "PATCH",
        body: { username: newUsername },
      });
      setUserDirect(res.user);
      pushToast("Username updated!", "success");
    } catch (err) {
      pushToast(err instanceof ApiClientError ? err.message : "Could not change username.", "error");
    }
  };

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest("/api/auth/change-password", {
        method: "POST",
        body: { currentPassword, newPassword },
      });
      setCurrentPassword("");
      setNewPassword("");
      pushToast("Password changed! Other active sessions were signed out.", "success");
    } catch (err) {
      pushToast(err instanceof ApiClientError ? err.message : "Failed to change password.", "error");
    }
  };

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest("/api/auth/account", {
        method: "DELETE",
        body: { password: deletePassword, confirmText: deleteConfirm },
      });
      setUserDirect(null, null);
      pushToast("Your account has been permanently deleted.", "info");
      navigate("/");
    } catch (err) {
      pushToast(err instanceof ApiClientError ? err.message : "Could not delete account.", "error");
    }
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="pixel-panel p-4">
          <h1 className="font-arcade-title text-lg text-[#f5b935]">ACCOUNT MANAGEMENT</h1>
          <p className="text-xs text-[#b8c2dc] mt-1">
            Signed in as <strong>{user.email}</strong> ({user.emailVerified ? "Verified" : "Unverified"})
          </p>
        </div>

        <form onSubmit={handleUsername} className="pixel-panel p-5 space-y-3">
          <h2 className="font-arcade-title text-xs text-[#38a3f1]">CHANGE USERNAME</h2>
          <input
            type="text"
            required
            minLength={3}
            maxLength={20}
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            className="pixel-input text-xs"
          />
          <button type="submit" className="pixel-btn pixel-btn-primary text-xs">Update Username</button>
        </form>

        <form onSubmit={handlePassword} className="pixel-panel p-5 space-y-3">
          <h2 className="font-arcade-title text-xs text-[#3ac463]">CHANGE PASSWORD</h2>
          <input
            type="password"
            required
            placeholder="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="pixel-input text-xs"
          />
          <input
            type="password"
            required
            minLength={8}
            placeholder="New password (8+ chars, letters & numbers)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="pixel-input text-xs"
          />
          <button type="submit" className="pixel-btn pixel-btn-green text-xs">Change Password</button>
        </form>

        <form onSubmit={handleDelete} className="pixel-panel p-5 space-y-3 border-[#e84545]">
          <h2 className="font-arcade-title text-xs text-[#e84545]">DANGER ZONE: DELETE ACCOUNT</h2>
          <p className="text-xs text-[#b8c2dc]">
            Deleting your account revokes all sessions and removes your profile from SKYHOP. Type <strong>DELETE</strong> and enter your password to confirm.
          </p>
          <input
            type="password"
            required
            placeholder="Your password"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            className="pixel-input text-xs"
          />
          <input
            type="text"
            required
            placeholder="Type DELETE to confirm"
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            className="pixel-input text-xs"
          />
          <button type="submit" className="pixel-btn pixel-btn-red text-xs">Delete My Account</button>
        </form>
      </div>
    </Layout>
  );
}

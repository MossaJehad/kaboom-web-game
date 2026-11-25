import React, { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { audioManager } from "../audio/audioManager.js";
import { useApp } from "../store/AppContext.js";

const NAV_LINKS = [
  { to: "/play", label: "Play" },
  { to: "/modes", label: "Modes" },
  { to: "/leaderboards", label: "Ranks" },
  { to: "/shop", label: "Shop" },
  { to: "/inventory", label: "Wardrobe" },
  { to: "/missions", label: "Missions" },
  { to: "/achievements", label: "Trophies" },
  { to: "/friends", label: "Friends" },
];

export function Layout({ children, compact = false }: { children: React.ReactNode; compact?: boolean }) {
  const { user, isOnline, toasts, dismissToast, logout } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  const onNavClick = () => {
    void audioManager.playSfx("click");
    setMenuOpen(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--arcade-bg)] text-[var(--arcade-cream)] safe-area-pad">
      {/* Arcade Cabinet Header */}
      <header className="sticky top-0 z-40 bg-[#141930] border-b-[3px] border-[#0a0d1a]">
        <div className="max-w-7xl mx-auto px-3 sm:px-5 h-14 flex items-center justify-between gap-2">
          <Link
            to="/"
            onClick={onNavClick}
            className="flex items-center gap-2 shrink-0 focus-visible:outline-none"
          >
            <img
              src="/assets/icons/favicon.png"
              alt="SKYHOP"
              className="w-8 h-8 pixel-art border-2 border-[#0a0d1a]"
            />
            <span className="font-arcade-title text-sm sm:text-base text-[#f5b935] tracking-wider">
              SKYHOP
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav aria-label="Main navigation" className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onNavClick}
                className={({ isActive }) =>
                  `px-2.5 py-1.5 text-xs uppercase border-2 transition-colors ${
                    isActive
                      ? "bg-[#f5b935] text-[#121629] border-[#0a0d1a] font-bold"
                      : "border-transparent text-[#d7e0f7] hover:bg-[#232c50] hover:border-[#0a0d1a]"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
            {user && (user.role === "ADMIN" || user.role === "MODERATOR") && (
              <NavLink
                to="/admin"
                onClick={onNavClick}
                className={({ isActive }) =>
                  `px-2.5 py-1.5 text-xs uppercase border-2 ${
                    isActive
                      ? "bg-[#e84545] text-white border-[#0a0d1a] font-bold"
                      : "border-[#e84545]/60 text-[#fca5a5] hover:bg-[#e84545]/20"
                  }`
                }
              >
                Admin
              </NavLink>
            )}
          </nav>

          {/* Player HUD / Auth Controls */}
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <Link
                  to="/wallet"
                  onClick={onNavClick}
                  title="Wallet & Coin History"
                  data-testid="header-wallet-balance"
                  className="px-2.5 py-1 bg-[#1e2647] border-2 border-[#0a0d1a] text-xs font-bold text-[#f5b935] hover:bg-[#2a3461]"
                >
                  {user.walletBalance.toLocaleString()} C
                </Link>
                <Link
                  to="/profile"
                  onClick={onNavClick}
                  className="hidden sm:flex items-center gap-2 px-2 py-1 bg-[#1e2647] border-2 border-[#0a0d1a] hover:bg-[#2a3461]"
                >
                  <img
                    src={`/assets/avatars/${user.equipped.avatar}.png`}
                    alt={user.username}
                    className="w-6 h-6 pixel-art border border-[#0a0d1a]"
                  />
                  <span className="text-xs max-w-[100px] truncate">{user.username}</span>
                  <span className="text-[10px] px-1 bg-[#38a3f1] text-[#091224] font-bold">
                    LV {user.level}
                  </span>
                </Link>
                <Link
                  to="/settings"
                  onClick={onNavClick}
                  aria-label="Settings"
                  className="hidden md:inline-block px-2 py-1 text-xs border-2 border-[#0a0d1a] bg-[#232c50] hover:bg-[#2f3b68]"
                >
                  CFG
                </Link>
                <button
                  type="button"
                  onClick={async () => {
                    onNavClick();
                    await logout();
                    navigate("/");
                  }}
                  className="hidden md:inline-block px-2 py-1 text-xs border-2 border-[#0a0d1a] bg-[#3b1f2b] text-[#fda4af] hover:bg-[#52283a] cursor-pointer"
                >
                  OUT
                </button>
              </>
            ) : (
              <div className="flex items-center gap-1.5">
                <Link
                  to="/login"
                  onClick={onNavClick}
                  className="px-2.5 py-1 text-xs uppercase border-2 border-[#0a0d1a] bg-[#232c50] hover:bg-[#2f3b68]"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  onClick={onNavClick}
                  className="px-2.5 py-1 text-xs uppercase border-2 border-[#0a0d1a] bg-[#f5b935] text-[#121629] font-bold"
                >
                  Join
                </Link>
              </div>
            )}

            <button
              type="button"
              aria-label="Toggle navigation menu"
              aria-expanded={menuOpen}
              onClick={() => {
                void audioManager.playSfx("click");
                setMenuOpen((o) => !o);
              }}
              className="lg:hidden px-2.5 py-1 text-xs border-2 border-[#0a0d1a] bg-[#232c50] cursor-pointer"
            >
              {menuOpen ? "CLOSE" : "MENU"}
            </button>
          </div>
        </div>

        {/* Mobile Drawer */}
        {menuOpen && (
          <div className="lg:hidden border-t-2 border-[#0a0d1a] bg-[#141930] px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {NAV_LINKS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onNavClick}
                className={({ isActive }) =>
                  `px-3 py-2 text-xs text-center uppercase border-2 border-[#0a0d1a] ${
                    isActive ? "bg-[#f5b935] text-[#121629] font-bold" : "bg-[#1e2647]"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
            <Link to="/preview" onClick={onNavClick} className="px-3 py-2 text-xs text-center uppercase border-2 border-[#0a0d1a] bg-[#1e2647]">
              Preview
            </Link>
            <Link to="/settings" onClick={onNavClick} className="px-3 py-2 text-xs text-center uppercase border-2 border-[#0a0d1a] bg-[#1e2647]">
              Settings
            </Link>
            <Link to="/how-to-play" onClick={onNavClick} className="px-3 py-2 text-xs text-center uppercase border-2 border-[#0a0d1a] bg-[#1e2647]">
              Guide
            </Link>
            {user && (
              <>
                <Link to="/profile" onClick={onNavClick} className="px-3 py-2 text-xs text-center uppercase border-2 border-[#0a0d1a] bg-[#1e2647]">
                  Profile
                </Link>
                <Link to="/account" onClick={onNavClick} className="px-3 py-2 text-xs text-center uppercase border-2 border-[#0a0d1a] bg-[#1e2647]">
                  Account
                </Link>
                {(user.role === "ADMIN" || user.role === "MODERATOR") && (
                  <Link to="/admin" onClick={onNavClick} className="px-3 py-2 text-xs text-center uppercase border-2 border-[#0a0d1a] bg-[#e84545] text-white">
                    Admin
                  </Link>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    onNavClick();
                    await logout();
                    navigate("/");
                  }}
                  className="px-3 py-2 text-xs text-center uppercase border-2 border-[#0a0d1a] bg-[#3b1f2b] text-[#fda4af] cursor-pointer"
                >
                  Log Out
                </button>
              </>
            )}
          </div>
        )}
      </header>

      {/* Offline / Unverified Status Strips */}
      {!isOnline && (
        <div className="bg-[#92400e] border-b-2 border-[#0a0d1a] px-4 py-1.5 text-center text-xs">
          OFFLINE MODE — Practice flight is available locally. Ranked submissions resume when online.
        </div>
      )}
      {user && !user.emailVerified && (
        <div className="bg-[#1e3a5f] border-b-2 border-[#0a0d1a] px-4 py-1.5 text-center text-xs flex items-center justify-center gap-3 flex-wrap">
          <span>Your email address is not yet verified.</span>
          <Link to="/verify-email" className="underline text-[#f5b935] font-bold">
            Verify Now
          </Link>
        </div>
      )}

      {/* Main Content */}
      <main className={compact ? "flex-1 flex flex-col" : "flex-1 max-w-7xl w-full mx-auto px-3 sm:px-5 py-5"}>
        {children}
      </main>

      {/* Compact Footer */}
      {!compact && (
        <footer className="border-t-[3px] border-[#0a0d1a] bg-[#141930] py-4 px-4 mt-8">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--arcade-muted)]">
            <span>SKYHOP ARCADE &copy; {new Date().getFullYear()} &bull; Powered by Kaboom.js</span>
            <div className="flex flex-wrap items-center gap-4">
              <Link to="/how-to-play" className="hover:text-[#f5b935]">How to Play</Link>
              <Link to="/preview" className="hover:text-[#f5b935]">Cosmetic Studio</Link>
              <Link to="/settings" className="hover:text-[#f5b935]">Settings</Link>
              <Link to="/account" className="hover:text-[#f5b935]">Account</Link>
              <Link to="/privacy" className="hover:text-[#f5b935]">Privacy & Anti-Cheat</Link>
            </div>
          </div>
        </footer>
      )}

      {/* Toast Notification Stack */}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto px-3.5 py-2.5 border-[3px] border-[#0a0d1a] text-xs shadow-[4px_4px_0_#000] flex items-center justify-between gap-3 ${
              t.variant === "success"
                ? "bg-[#1e7a3b] text-white"
                : t.variant === "error"
                  ? "bg-[#941f27] text-white"
                  : t.variant === "warning"
                    ? "bg-[#92400e] text-[#fef8e6]"
                    : "bg-[#1c2340] text-[#fef8e6]"
            }`}
          >
            <span>{t.message}</span>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              aria-label="Dismiss notification"
              className="font-bold opacity-80 hover:opacity-100 cursor-pointer"
            >
              X
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

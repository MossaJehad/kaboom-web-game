import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { AuthUserDTO } from "@skyhop/shared";
import { apiRequest, ApiClientError } from "../api/client.js";
import { Layout } from "../components/Layout.js";
import { useApp } from "../store/AppContext.js";

export function LoginPage() {
  const { setUserDirect, pushToast } = useApp();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiRequest<{ user: AuthUserDTO; csrfToken: string }>("/api/auth/login", {
        method: "POST",
        body: { identifier, password },
      });
      setUserDirect(res.user, res.csrfToken);
      pushToast(`Welcome back, ${res.user.username}!`, "success");
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Unable to log in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-md mx-auto pixel-panel p-6 space-y-5">
        <div>
          <h1 className="font-arcade-title text-base text-[#f5b935]">PLAYER LOGIN</h1>
          <p className="text-xs text-[#b8c2dc] mt-1">Sign in with your username or email address.</p>
        </div>

        {error && (
          <div role="alert" className="p-3 bg-[#941f27] border-2 border-[#0a0d1a] text-xs text-white">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="login-identifier" className="block text-xs text-[#b8c2dc]">
              Email or Username
            </label>
            <input
              id="login-identifier"
              type="text"
              required
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="pixel-input text-xs"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="login-password" className="block text-xs text-[#b8c2dc]">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pixel-input text-xs"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            data-testid="login-submit-btn"
            className="pixel-btn pixel-btn-primary text-xs w-full py-2.5"
          >
            {loading ? "SIGNING IN..." : "SIGN IN"}
          </button>
        </form>

        <div className="flex items-center justify-between text-xs pt-2 border-t-2 border-[#0a0d1a]">
          <Link to="/forgot-password" className="text-[#38a3f1] hover:underline">
            Forgot password?
          </Link>
          <Link to="/register" className="text-[#f5b935] hover:underline">
            Create account
          </Link>
        </div>
      </div>
    </Layout>
  );
}

export function RegisterPage() {
  const { setUserDirect, guestState, pushToast } = useApp();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [migrateLocal, setMigrateLocal] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiRequest<{
        user: AuthUserDTO;
        csrfToken: string;
        devVerificationToken?: string;
      }>("/api/auth/register", {
        method: "POST",
        body: {
          email,
          username,
          password,
          guestMigration: migrateLocal
            ? {
                localClassicBest: guestState.bestScores.classic ?? 0,
                localGamesPlayed: guestState.gamesPlayed,
                settings: guestState.settings,
              }
            : undefined,
        },
      });
      setUserDirect(res.user, res.csrfToken);
      pushToast("Account created! +100 Welcome Coins awarded.", "success");
      if (res.devVerificationToken) {
        navigate(`/verify-email?token=${encodeURIComponent(res.devVerificationToken)}`);
      } else {
        navigate("/verify-email");
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-md mx-auto pixel-panel p-6 space-y-5">
        <div>
          <h1 className="font-arcade-title text-base text-[#f5b935]">CREATE PILOT ACCOUNT</h1>
          <p className="text-xs text-[#b8c2dc] mt-1">
            Start with 100 bonus coins, verified rankings, and cross-device cloud saves.
          </p>
        </div>

        {error && (
          <div role="alert" className="p-3 bg-[#941f27] border-2 border-[#0a0d1a] text-xs text-white">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="reg-username" className="block text-xs text-[#b8c2dc]">
              Unique Username (3-20 chars)
            </label>
            <input
              id="reg-username"
              type="text"
              required
              minLength={3}
              maxLength={20}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="pixel-input text-xs"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="reg-email" className="block text-xs text-[#b8c2dc]">
              Email Address
            </label>
            <input
              id="reg-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pixel-input text-xs"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="reg-password" className="block text-xs text-[#b8c2dc]">
              Password (8+ chars, letters &amp; numbers)
            </label>
            <input
              id="reg-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pixel-input text-xs"
            />
          </div>

          {guestState.gamesPlayed > 0 && (
            <label className="flex items-start gap-2 text-xs pixel-panel-inset p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={migrateLocal}
                onChange={(e) => setMigrateLocal(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-[#b8c2dc]">
                Migrate my local settings and practice record ({guestState.bestScores.classic ?? 0}) safely.
                Unverified guest scores do not enter competitive leaderboards.
              </span>
            </label>
          )}

          <button
            type="submit"
            disabled={loading}
            data-testid="register-submit-btn"
            className="pixel-btn pixel-btn-green text-xs w-full py-2.5"
          >
            {loading ? "CREATING ACCOUNT..." : "CREATE ACCOUNT"}
          </button>
        </form>

        <div className="text-xs text-center pt-2 border-t-2 border-[#0a0d1a]">
          Already registered?{" "}
          <Link to="/login" className="text-[#f5b935] hover:underline">
            Sign In
          </Link>
        </div>
      </div>
    </Layout>
  );
}

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const { user, refreshUser, pushToast } = useApp();
  const [token, setToken] = useState(searchParams.get("token") ?? "");
  const [status, setStatus] = useState<"idle" | "verifying" | "verified" | "error">("idle");
  const [message, setMessage] = useState("");

  const submitVerify = async (t: string) => {
    if (!t.trim()) return;
    setStatus("verifying");
    try {
      await apiRequest("/api/auth/verify-email", { method: "POST", body: { token: t.trim() } });
      setStatus("verified");
      setMessage("Email verified successfully! Your account is ready for full competitive play.");
      await refreshUser();
      pushToast("Email verified!", "success");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof ApiClientError ? err.message : "Verification failed.");
    }
  };

  useEffect(() => {
    const paramToken = searchParams.get("token");
    if (paramToken) {
      setToken(paramToken);
    }
  }, [searchParams]);

  const handleResend = async () => {
    try {
      const res = await apiRequest<{ devVerificationToken?: string }>("/api/auth/resend-verification", {
        method: "POST",
      });
      if (res.devVerificationToken) {
        setToken(res.devVerificationToken);
      }
      pushToast("Verification email sent!", "success");
    } catch (err) {
      pushToast(err instanceof ApiClientError ? err.message : "Could not resend email.", "error");
    }
  };

  return (
    <Layout>
      <div className="max-w-md mx-auto pixel-panel p-6 space-y-4">
        <h1 className="font-arcade-title text-base text-[#f5b935]">VERIFY EMAIL</h1>

        {user?.emailVerified || status === "verified" ? (
          <div className="space-y-4">
            <div
              data-testid="email-verified-banner"
              className="p-3 bg-[#1e7a3b] border-2 border-[#0a0d1a] text-xs text-white"
            >
              {message || "Your email address is verified!"}
            </div>
            <Link to="/play/classic" className="pixel-btn pixel-btn-green text-xs w-full">
              Start Playing
            </Link>
          </div>
        ) : (
          <>
            <p className="text-xs text-[#b8c2dc]">
              Enter the verification token sent to your email address to activate full account security.
            </p>
            {status === "error" && (
              <div className="p-3 bg-[#941f27] border-2 border-[#0a0d1a] text-xs text-white">{message}</div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submitVerify(token);
              }}
              className="space-y-3"
            >
              <input
                type="text"
                placeholder="Paste verification token..."
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required
                className="pixel-input text-xs"
              />
              <button
                type="submit"
                disabled={status === "verifying"}
                data-testid="verify-email-submit-btn"
                className="pixel-btn pixel-btn-primary text-xs w-full"
              >
                {status === "verifying" ? "VERIFYING..." : "VERIFY EMAIL"}
              </button>
            </form>
            {user && (
              <button
                type="button"
                onClick={() => void handleResend()}
                className="pixel-btn pixel-btn-secondary text-xs w-full"
              >
                Resend Verification Email
              </button>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiRequest<{ message: string; devResetToken?: string }>("/api/auth/forgot-password", {
        method: "POST",
        body: { email },
      });
      setSentMessage(res.message);
      setDevToken(res.devResetToken ?? null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-md mx-auto pixel-panel p-6 space-y-4">
        <h1 className="font-arcade-title text-base text-[#f5b935]">FORGOT PASSWORD</h1>
        <p className="text-xs text-[#b8c2dc]">
          Enter your email address and we will send a single-use password reset link.
        </p>

        {sentMessage && (
          <div className="p-3 bg-[#1e7a3b] border-2 border-[#0a0d1a] text-xs text-white space-y-2">
            <p>{sentMessage}</p>
            {devToken && (
              <Link
                to={`/reset-password?token=${encodeURIComponent(devToken)}`}
                className="block underline font-bold text-[#fef08a]"
              >
                Open Dev Reset Link
              </Link>
            )}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-3">
          <input
            type="email"
            required
            placeholder="pilot@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="pixel-input text-xs"
          />
          <button type="submit" disabled={loading} className="pixel-btn pixel-btn-primary text-xs w-full">
            {loading ? "SENDING..." : "SEND RESET LINK"}
          </button>
        </form>
      </div>
    </Layout>
  );
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { pushToast } = useApp();
  const [token, setToken] = useState(searchParams.get("token") ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiRequest("/api/auth/reset-password", {
        method: "POST",
        body: { token: token.trim(), newPassword },
      });
      pushToast("Password reset successful! Please sign in.", "success");
      navigate("/login");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Reset failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-md mx-auto pixel-panel p-6 space-y-4">
        <h1 className="font-arcade-title text-base text-[#f5b935]">RESET PASSWORD</h1>
        {error && <div className="p-3 bg-[#941f27] border-2 border-[#0a0d1a] text-xs text-white">{error}</div>}
        <form onSubmit={onSubmit} className="space-y-3">
          <input
            type="text"
            required
            placeholder="Reset token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
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
          <button type="submit" disabled={loading} className="pixel-btn pixel-btn-green text-xs w-full">
            {loading ? "UPDATING..." : "UPDATE PASSWORD"}
          </button>
        </form>
      </div>
    </Layout>
  );
}

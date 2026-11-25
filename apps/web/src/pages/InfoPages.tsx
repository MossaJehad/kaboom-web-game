import { Link } from "react-router-dom";
import { Layout } from "../components/Layout.js";

export function HowToPlayPage() {
  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="pixel-panel p-5 space-y-3">
          <h1 className="font-arcade-title text-lg text-[#f5b935]">HOW TO PLAY SKYHOP</h1>
          <p className="text-xs text-[#b8c2dc] leading-relaxed">
            SKYHOP is a precision fixed-timestep arcade flyer. Navigate through procedurally generated obstacles, climb verified global leaderboards, earn Coins, and unlock original pixel-art cosmetics.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="pixel-panel p-4 space-y-2">
            <h2 className="font-arcade-title text-xs text-[#38a3f1]">CONTROLS</h2>
            <ul className="space-y-1.5 text-[#b8c2dc] list-disc pl-4">
              <li><strong className="text-[#fef8e6]">Flap Upward:</strong> Tap screen, left-click canvas, or press <kbd>Space</kbd> / <kbd>Up</kbd> / <kbd>W</kbd>.</li>
              <li><strong className="text-[#fef8e6]">Pause / Resume:</strong> Press <kbd>Esc</kbd> or <kbd>P</kbd> (available in Classic &amp; Zen modes).</li>
              <li><strong className="text-[#fef8e6]">Custom Keys:</strong> Rebind controls anytime in Settings.</li>
            </ul>
          </div>

          <div className="pixel-panel p-4 space-y-2">
            <h2 className="font-arcade-title text-xs text-[#3ac463]">EARNING COINS</h2>
            <ul className="space-y-1.5 text-[#b8c2dc] list-disc pl-4">
              <li>New Account Welcome Bonus: <strong className="text-[#f5b935]">100 Coins</strong></li>
              <li>Every 5 obstacles passed: <strong className="text-[#f5b935]">1 Coin</strong></li>
              <li>First verified game of the day: <strong className="text-[#f5b935]">10 Coins</strong></li>
              <li>Daily Challenge completion: <strong className="text-[#f5b935]">25 Coins</strong></li>
              <li>New Personal Record (score 5+): <strong className="text-[#f5b935]">15 Coins</strong></li>
              <li>Achievements &amp; Missions: <strong className="text-[#f5b935]">10–250 Coins</strong></li>
            </ul>
          </div>
        </div>

        <div className="pixel-panel p-4 space-y-2 text-xs">
          <h2 className="font-arcade-title text-xs text-[#f5b935]">FAIR PLAY &amp; COSMETICS</h2>
          <p className="text-[#b8c2dc] leading-relaxed">
            All 15 bird skins, 12 worlds, obstacle styles, ground textures, and particle trails are 100% cosmetic. Every bird shares the exact same hitbox and deterministic 60 TPS physics simulation across desktop and mobile displays.
          </p>
          <div className="pt-2">
            <Link to="/play/classic" className="pixel-btn pixel-btn-green text-xs">Start Flying Now</Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export function PrivacyPage() {
  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-5 text-xs">
        <div className="pixel-panel p-5 space-y-3">
          <h1 className="font-arcade-title text-lg text-[#f5b935]">PRIVACY &amp; ANTI-CHEAT POLICY</h1>
          <p className="text-[#b8c2dc] leading-relaxed">
            SKYHOP collects only the minimum account and gameplay data required to run persistent accounts, cosmetic ownership, friends lists, and fair competitive leaderboards.
          </p>
        </div>

        <div className="pixel-panel p-5 space-y-3">
          <h2 className="font-arcade-title text-xs text-[#38a3f1]">DATA &amp; ACCOUNT PRIVACY</h2>
          <ul className="space-y-2 text-[#b8c2dc] list-disc pl-4">
            <li>Passwords are hashed with scrypt and unique per-user salts — never stored in plaintext.</li>
            <li>Sessions use HttpOnly cookies with server-validated CSRF tokens.</li>
            <li>Your email address and private wallet transactions are never exposed on public profiles.</li>
            <li>You can switch your profile to Private, hide gameplay stats, or delete your account permanently at any time under Account Management.</li>
          </ul>
        </div>

        <div className="pixel-panel p-5 space-y-3">
          <h2 className="font-arcade-title text-xs text-[#3ac463]">SERVER-SIDE REPLAY VERIFICATION</h2>
          <p className="text-[#b8c2dc] leading-relaxed">
            Competitive scores are never trusted from browser memory. Each session receives a server-generated deterministic seed and versioned physics snapshot; your flap tick sequence is re-simulated on the backend to verify your authoritative score. While deterministic verification blocks score injection, speedhacks, and replay forgery, automated external bots remain an inherent web limitation — suspicious cadence anomalies are logged for human moderator review.
          </p>
        </div>
      </div>
    </Layout>
  );
}

export function NotFoundPage() {
  return (
    <Layout>
      <div className="pixel-panel max-w-md mx-auto p-8 text-center space-y-4">
        <p className="font-arcade-title text-3xl text-[#e84545]">404</p>
        <h1 className="font-arcade-title text-sm text-[#f5b935]">STAGE NOT FOUND</h1>
        <p className="text-xs text-[#b8c2dc]">
          This flight path does not exist in the SKYHOP arcade cabinet.
        </p>
        <Link to="/" className="pixel-btn pixel-btn-primary text-xs">
          Return to Main Menu
        </Link>
      </div>
    </Layout>
  );
}

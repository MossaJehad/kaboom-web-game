import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { LoadingScreen } from "./components/LoadingScreen.js";
import { AchievementsPage } from "./pages/AchievementsPage.js";
import { AdminDashboardPage } from "./pages/AdminDashboardPage.js";
import {
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from "./pages/AuthPages.js";
import { FriendsPage } from "./pages/FriendsPage.js";
import { HowToPlayPage, NotFoundPage, PrivacyPage } from "./pages/InfoPages.js";
import { InventoryPage } from "./pages/InventoryPage.js";
import { LeaderboardsPage } from "./pages/LeaderboardsPage.js";
import { MainMenuPage } from "./pages/MainMenuPage.js";
import { MissionsPage } from "./pages/MissionsPage.js";
import { ModeSelectPage } from "./pages/ModeSelectPage.js";
import { PlayPage } from "./pages/PlayPage.js";
import { PreviewPage } from "./pages/PreviewPage.js";
import { PlayerProfilePage, PublicPlayerProfilePage } from "./pages/ProfilePages.js";
import { AccountPage, SettingsPage } from "./pages/SettingsAccountPages.js";
import { ShopPage } from "./pages/ShopPage.js";
import { WalletPage } from "./pages/WalletPage.js";
import { AppProvider, useApp } from "./store/AppContext.js";

function AppRoutes() {
  const { authLoading } = useApp();

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#121629] flex items-center justify-center">
        <LoadingScreen label="BOOTING SKYHOP ARCADE..." />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<MainMenuPage />} />
      <Route path="/loading" element={<LoadingScreen label="LOADING SKYHOP ASSETS..." />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/modes" element={<ModeSelectPage />} />
      <Route path="/play" element={<PlayPage />} />
      <Route path="/play/:mode" element={<PlayPage />} />
      <Route path="/leaderboards" element={<LeaderboardsPage />} />
      <Route path="/shop" element={<ShopPage />} />
      <Route path="/inventory" element={<InventoryPage />} />
      <Route path="/preview" element={<PreviewPage />} />
      <Route path="/profile" element={<PlayerProfilePage />} />
      <Route path="/players/:username" element={<PublicPlayerProfilePage />} />
      <Route path="/achievements" element={<AchievementsPage />} />
      <Route path="/missions" element={<MissionsPage />} />
      <Route path="/friends" element={<FriendsPage />} />
      <Route path="/wallet" element={<WalletPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/how-to-play" element={<HowToPlayPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/admin" element={<AdminDashboardPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AppProvider>
    </ErrorBoundary>
  );
}

export default App;

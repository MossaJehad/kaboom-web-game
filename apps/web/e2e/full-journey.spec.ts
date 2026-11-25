import { expect, test } from "@playwright/test";

test.describe("SKYHOP Complete End-to-End Player Journey", () => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const username = `Pilot_${uniqueSuffix}`;
  const email = `pilot_${uniqueSuffix}@example.com`;
  const password = "ArcadePassword123";

  test("full player lifecycle: register, verify, play Kaboom game, earn coins/XP, buy & equip bird + scene, leaderboard, relogin, mobile check", async ({
    page,
    request,
  }) => {
    const pageErrors: string[] = [];
    const failedAssets: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    page.on("response", (res) => {
      if (res.url().includes("/assets/") && res.status() >= 400) {
        failedAssets.push(`${res.status()} ${res.url()}`);
      }
    });

    // 1. Register a new account via UI
    await page.goto("/register");
    await page.fill("#reg-username", username);
    await page.fill("#reg-email", email);
    await page.fill("#reg-password", password);
    await page.getByTestId("register-submit-btn").click();

    // Redirected to email verification page with token pre-filled in dev mode
    await expect(page).toHaveURL(/\/verify-email/);

    // 2. Verify the account via UI
    await page.getByTestId("verify-email-submit-btn").click();
    await expect(page.getByTestId("email-verified-banner")).toBeVisible();

    // Confirm 100 welcome coins in header
    await expect(page.getByTestId("header-wallet-balance")).toContainText("100 C");

    // 3. Log out and log back in to verify real Login flow
    await page.getByRole("button", { name: "OUT" }).click();
    await page.goto("/login");
    await page.fill("#login-identifier", username);
    await page.fill("#login-password", password);
    await page.getByTestId("login-submit-btn").click();
    await expect(page).toHaveURL("/");
    await expect(page.getByTestId("header-wallet-balance")).toContainText("100 C");

    // 4. Start and finish a real Kaboom.js gameplay session in the browser!
    await page.getByTestId("menu-play-classic").click();
    await expect(page).toHaveURL(/\/play\/classic/);
    await expect(page.getByTestId("kaboom-game-canvas")).toBeVisible();

    const stage = page.getByTestId("game-stage-container");
    await expect(stage).toHaveAttribute("data-game-state", "READY");

    // Hover near center (~340ms cadence) to pass at least 1 obstacle cleanly & trigger First Game of Day (+10 C)
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await page.getByTestId("instant-restart-btn").click();
        await expect(stage).toHaveAttribute("data-game-state", "READY");
      }
      await page.getByTestId("tap-to-fly-btn").click();
      await expect(stage).toHaveAttribute("data-game-state", "PLAYING");

      for (let i = 0; i < 12; i++) {
        await page.waitForTimeout(505);
        const stateNow = await stage.getAttribute("data-game-state");
        const curScore = Number((await stage.getAttribute("data-current-score")) || "0");
        if (stateNow !== "PLAYING") break;
        if (curScore >= 2) break; // Passed 2 obstacles — let bird finish cleanly
        await page.keyboard.press("Space");
      }

      // 5. Wait for collision -> GAME_OVER -> RESULTS & backend replay verification
      await expect(page.getByTestId("results-overlay")).toBeVisible({ timeout: 25_000 });
      await expect(page.getByText(/XP Gained:/)).toBeVisible({ timeout: 15_000 });

      const balanceText = (await page.getByTestId("header-wallet-balance").textContent()) || "";
      if (!balanceText.includes("100 C")) {
        break; // Earned verified gameplay coins (> 100 C)
      }
    }

    // 6. Confirm verified gameplay rewards (First Game of Day +10 C -> 110+ C) & XP awarded
    await expect(page.getByTestId("results-verified-score")).toBeVisible();
    await expect(page.getByTestId("header-wallet-balance")).not.toContainText(/^100 C$/);

    // Also test instant restart without page reload!
    await page.getByTestId("instant-restart-btn").click();
    await expect(stage).toHaveAttribute("data-game-state", "READY");

    // Verify unauthorized access to Admin API is strictly forbidden for normal player
    const forbiddenAdmin = await page.evaluate(async () => {
      const r = await fetch("/api/admin/analytics", { credentials: "include" });
      return r.status;
    });
    expect(forbiddenAdmin).toBe(403);

    // Earn additional legitimate coins via Achievements (First Flight = +15 C)
    await page.goto("/achievements");
    const firstFlightClaim = page.getByTestId("claim-achievement-first-flight");
    await expect(firstFlightClaim).toBeVisible();
    await firstFlightClaim.click();

    // Play a second higher-scoring run? To reliably purchase BOTH Bluebird (100 C) AND Sunset Valley (200 C)
    // in a fast deterministic E2E test, let's award a real audited Admin Tournament Bonus via the real Admin API
    // (verifying the Admin RBAC + audited currency endpoint end-to-end as well!)
    const adminLoginRes = await request.post("http://localhost:3001/api/auth/login", {
      data: {
        identifier: process.env.ADMIN_USERNAME || "skyadmin",
        password: process.env.ADMIN_PASSWORD || "ChangeMeAdmin123!",
      },
    });
    expect(adminLoginRes.ok()).toBeTruthy();
    const adminJson = await adminLoginRes.json();
    const meRes = await page.evaluate(async () => {
      const r = await fetch("/api/auth/me", { credentials: "include" });
      return r.json();
    });
    const adjRes = await request.post(`http://localhost:3001/api/admin/users/${meRes.user.id}/currency`, {
      headers: { "x-csrf-token": adminJson.csrfToken },
      data: { amount: 250, reason: "E2E tournament prize grant" },
    });
    expect(adjRes.ok()).toBeTruthy();

    // 7. Purchase a Bird Skin (Bluebird - 100 C) via Shop UI
    await page.goto("/shop");
    await expect(page.getByTestId("shop-item-bluebird")).toBeVisible();
    await page.getByTestId("shop-buy-bluebird").click();
    await expect(page.getByTestId("shop-equip-bluebird")).toBeVisible();

    // 8. Purchase a Scene (Sunset Valley - 200 C) via Shop UI
    await page.getByTestId("shop-tab-SCENE").click();
    await expect(page.getByTestId("shop-item-sunset-valley")).toBeVisible();
    await page.getByTestId("shop-buy-sunset-valley").click();
    await expect(page.getByTestId("shop-equip-sunset-valley")).toBeVisible();

    // 9. Equip BOTH cosmetics via Inventory/Wardrobe screen
    await page.goto("/inventory");
    await page.getByTestId("inventory-equip-bluebird").click();
    await expect(page.getByTestId("inventory-item-bluebird")).toContainText("EQUIPPED");
    await page.getByTestId("inventory-equip-sunset-valley").click();
    await expect(page.getByTestId("inventory-item-sunset-valley")).toContainText("EQUIPPED");

    // 10. Play using the newly equipped cosmetics!
    await page.goto("/play/classic");
    await expect(page.getByText(/bluebird .* sunset-valley/i)).toBeVisible();
    await expect(stage).toHaveAttribute("data-game-state", "READY");
    await page.getByTestId("tap-to-fly-btn").click();
    await expect(stage).toHaveAttribute("data-game-state", "PLAYING");
    await page.waitForTimeout(700);
    await page.screenshot({ path: "/tmp/skyhop-e2e-gameplay.png" });
    await expect(page.getByTestId("results-overlay")).toBeVisible({ timeout: 20_000 });

    // 11. Appear on the All-Time Leaderboard with verified score
    await page.goto("/leaderboards");
    await expect(page.getByTestId(`lb-row-${username}`)).toBeVisible();
    await expect(page.getByTestId("personal-rank-banner")).toContainText(username);

    // 12. Log out and log back in again
    await page.getByRole("button", { name: "OUT" }).click();
    await page.goto("/login");
    await page.fill("#login-identifier", username);
    await page.fill("#login-password", password);
    await page.getByTestId("login-submit-btn").click();
    await expect(page).toHaveURL("/");

    // 13. Confirm all progress, cosmetics, and equipped loadout remain saved!
    await expect(page.getByText("bluebird")).toBeVisible();
    await expect(page.getByText("sunset-valley")).toBeVisible();

    await page.goto("/inventory");
    await expect(page.getByTestId("inventory-item-bluebird")).toContainText("EQUIPPED");
    await expect(page.getByTestId("inventory-item-sunset-valley")).toContainText("EQUIPPED");

    // 14. Mobile viewport responsiveness check (390x844 iPhone layout)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/play/classic");
    await expect(page.getByTestId("kaboom-game-canvas")).toBeVisible();
    const box = await page.getByTestId("kaboom-game-canvas").boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(390);
    expect(box!.width).toBeGreaterThan(240);

    // 15. Verify remaining core screens render cleanly without page errors or broken assets
    await page.setViewportSize({ width: 1280, height: 800 });
    for (const route of ["/modes", "/preview", "/missions", "/friends", "/wallet", "/profile", "/settings", "/account", "/how-to-play", "/privacy"]) {
      await page.goto(route);
      await expect(page.locator("h1")).toBeVisible();
    }

    // 16. Verify Admin Dashboard renders real data for ADMIN account
    await page.getByRole("button", { name: "OUT" }).click();
    await page.goto("/login");
    await page.fill("#login-identifier", process.env.ADMIN_USERNAME || "skyadmin");
    await page.fill("#login-password", process.env.ADMIN_PASSWORD || "ChangeMeAdmin123!");
    await page.getByTestId("login-submit-btn").click();
    await expect(page).toHaveURL("/");
    await page.goto("/admin");
    await expect(page.getByText("ADMIN OPERATIONS CONSOLE")).toBeVisible();
    await expect(page.getByText("Total Players")).toBeVisible();

    expect(failedAssets).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  COSMETIC_CATEGORIES,
  COSMETIC_RARITIES,
  RARITY_COLORS,
  type CosmeticCategory,
  type CosmeticItemDTO,
  type CosmeticRarity,
  type EquippedLoadoutDTO,
} from "@skyhop/shared";
import { apiRequest, ApiClientError } from "../api/client.js";
import { audioManager } from "../audio/audioManager.js";
import { CosmeticPreviewStage } from "../components/CosmeticPreviewStage.js";
import { Layout } from "../components/Layout.js";
import { LoadingScreen } from "../components/LoadingScreen.js";
import { useApp } from "../store/AppContext.js";

const CATEGORY_LABELS: Record<CosmeticCategory, string> = {
  BIRD_SKIN: "Bird Skins",
  SCENE: "Scenes",
  OBSTACLE_SKIN: "Obstacles",
  GROUND_TEXTURE: "Grounds",
  PARTICLE_TRAIL: "Trails",
  FLAP_EFFECT: "Flap FX",
  GAME_OVER_EFFECT: "Game-Over FX",
  PROFILE_AVATAR: "Avatars",
  PROFILE_FRAME: "Frames",
};

export function ShopPage() {
  const { user, activeLoadout, pushToast, updateWalletBalanceLocal, updateEquippedLocal } = useApp();
  const [items, setItems] = useState<CosmeticItemDTO[]>([]);
  const [walletBalance, setWalletBalance] = useState(user?.walletBalance ?? 0);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<CosmeticCategory | "ALL">("BIRD_SKIN");
  const [rarity, setRarity] = useState<CosmeticRarity | "ALL">("ALL");
  const [previewItem, setPreviewItem] = useState<CosmeticItemDTO | null>(null);
  const [busySlug, setBusySlug] = useState<string | null>(null);

  const fetchShop = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ items: CosmeticItemDTO[]; walletBalance: number }>("/api/shop/items");
      setItems(res.items);
      setWalletBalance(res.walletBalance);
    } catch (err) {
      pushToast(err instanceof ApiClientError ? err.message : "Failed to load shop.", "error");
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    void fetchShop();
  }, [fetchShop, user?.id]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (category !== "ALL" && item.category !== category) return false;
      if (rarity !== "ALL" && item.rarity !== rarity) return false;
      return true;
    });
  }, [items, category, rarity]);

  const handlePurchase = async (item: CosmeticItemDTO) => {
    if (!user) {
      pushToast("Please log in to purchase cosmetics.", "warning");
      return;
    }
    setBusySlug(item.slug);
    try {
      const res = await apiRequest<{
        purchaseId: string;
        newWalletBalance: number;
        newlyUnlockedAchievements: Array<{ slug: string; name: string }>;
      }>("/api/shop/purchase", {
        method: "POST",
        body: {
          cosmeticSlug: item.slug,
          idempotencyKey: `web-buy:${user.id}:${item.slug}:${Date.now()}`,
        },
      });
      void audioManager.playSfx("purchase");
      setWalletBalance(res.newWalletBalance);
      updateWalletBalanceLocal(res.newWalletBalance);
      setItems((prev) => prev.map((it) => (it.slug === item.slug ? { ...it, owned: true } : it)));
      pushToast(`Purchased ${item.name}!`, "success");
      if (res.newlyUnlockedAchievements.length > 0) {
        void audioManager.playSfx("achievement");
        pushToast(`Achievement unlocked: ${res.newlyUnlockedAchievements.map((a) => a.name).join(", ")}`, "success");
      }
    } catch (err) {
      pushToast(err instanceof ApiClientError ? err.message : "Purchase failed.", "error");
    } finally {
      setBusySlug(null);
    }
  };

  const handleEquip = async (item: CosmeticItemDTO) => {
    if (!user) return;
    setBusySlug(item.slug);
    try {
      const res = await apiRequest<{ equipped: EquippedLoadoutDTO }>("/api/inventory/equip", {
        method: "POST",
        body: { category: item.category, cosmeticSlug: item.slug },
      });
      void audioManager.playSfx("click");
      updateEquippedLocal(res.equipped);
      setItems((prev) =>
        prev.map((it) =>
          it.category === item.category ? { ...it, equipped: it.slug === item.slug } : it
        )
      );
      pushToast(`Equipped ${item.name}!`, "success");
    } catch (err) {
      pushToast(err instanceof ApiClientError ? err.message : "Could not equip item.", "error");
    } finally {
      setBusySlug(null);
    }
  };

  const previewBird =
    previewItem?.category === "BIRD_SKIN" ? previewItem.slug : activeLoadout.birdSkin;
  const previewScene =
    previewItem?.category === "SCENE" ? previewItem.slug : activeLoadout.scene;
  const previewObs =
    previewItem?.category === "OBSTACLE_SKIN" ? previewItem.slug : activeLoadout.obstacleSkin;
  const previewGround =
    previewItem?.category === "GROUND_TEXTURE" ? previewItem.slug : activeLoadout.groundTexture;
  const previewTrail =
    previewItem?.category === "PARTICLE_TRAIL" ? previewItem.slug : activeLoadout.particleTrail;

  return (
    <Layout>
      <div className="space-y-5">
        {/* Shop Header */}
        <div className="pixel-panel p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-arcade-title text-lg text-[#f5b935]">COSMETIC SHOP</h1>
            <p className="text-xs text-[#b8c2dc] mt-1">
              100% cosmetic items earned with Coins. Zero pay-to-win or hitbox changes.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <div
                data-testid="shop-wallet-balance"
                className="px-3 py-1.5 bg-[#141930] border-2 border-[#0a0d1a] text-sm font-bold text-[#f5b935]"
              >
                BALANCE: {walletBalance.toLocaleString()} COINS
              </div>
            ) : (
              <Link to="/register" className="pixel-btn pixel-btn-primary text-xs">
                Join to Collect (+100 C)
              </Link>
            )}
            <Link to="/inventory" className="pixel-btn pixel-btn-secondary text-xs">
              Wardrobe
            </Link>
          </div>
        </div>

        {/* Live Animated Preview Banner */}
        <div className="pixel-panel p-4 flex flex-col md:flex-row items-center gap-4">
          <CosmeticPreviewStage
            birdSlug={previewBird}
            sceneSlug={previewScene}
            obstacleSlug={previewObs}
            groundSlug={previewGround}
            trailSlug={previewTrail}
            width={300}
            height={175}
            className="shrink-0"
          />
          <div className="flex-1 space-y-2 text-xs w-full">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase text-[#38a3f1] font-bold">LIVE PREVIEW</span>
              {previewItem && (
                <span
                  className="px-1.5 py-0.5 text-[10px] font-bold text-[#0a0d1a]"
                  style={{ backgroundColor: RARITY_COLORS[previewItem.rarity] }}
                >
                  {previewItem.rarity}
                </span>
              )}
            </div>
            <h2 className="font-arcade-title text-sm text-[#fef8e6]">
              {previewItem ? previewItem.name : "Select any item below to preview"}
            </h2>
            <p className="text-[#b8c2dc]">
              {previewItem
                ? previewItem.description
                : "Click Preview on any bird skin, world scene, obstacle pillar, ground texture, or trail to see it in live motion."}
            </p>
            {previewItem && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {previewItem.owned ? (
                  <button
                    type="button"
                    disabled={previewItem.equipped || busySlug === previewItem.slug}
                    onClick={() => void handleEquip(previewItem)}
                    className="pixel-btn pixel-btn-green text-xs"
                  >
                    {previewItem.equipped ? "EQUIPPED" : "EQUIP NOW"}
                  </button>
                ) : previewItem.lockedByLevel ? (
                  <span className="px-2.5 py-1 bg-[#3b1f2b] border-2 border-[#0a0d1a] text-[#fda4af]">
                    LOCKED: Requires Level {previewItem.requiredLevel}
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={!user || walletBalance < previewItem.price || busySlug === previewItem.slug}
                    onClick={() => void handlePurchase(previewItem)}
                    className="pixel-btn pixel-btn-primary text-xs"
                  >
                    BUY FOR {previewItem.price.toLocaleString()} COINS
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Category & Rarity Filters */}
        <div className="space-y-2.5">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Cosmetic categories">
            <button
              type="button"
              onClick={() => setCategory("ALL")}
              className={`px-2.5 py-1.5 text-xs border-2 border-[#0a0d1a] cursor-pointer ${
                category === "ALL" ? "bg-[#f5b935] text-[#121629] font-bold" : "bg-[#1c2340]"
              }`}
            >
              All
            </button>
            {COSMETIC_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                data-testid={`shop-tab-${cat}`}
                onClick={() => {
                  void audioManager.playSfx("click");
                  setCategory(cat);
                }}
                className={`px-2.5 py-1.5 text-xs border-2 border-[#0a0d1a] cursor-pointer ${
                  category === cat ? "bg-[#f5b935] text-[#121629] font-bold" : "bg-[#1c2340] hover:bg-[#273158]"
                }`}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-[#b8c2dc] mr-1">Rarity:</span>
            <button
              type="button"
              onClick={() => setRarity("ALL")}
              className={`px-2 py-0.5 border border-[#0a0d1a] cursor-pointer ${
                rarity === "ALL" ? "bg-[#38a3f1] text-[#091224] font-bold" : "bg-[#141930]"
              }`}
            >
              ALL
            </button>
            {COSMETIC_RARITIES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRarity(r)}
                className={`px-2 py-0.5 border border-[#0a0d1a] cursor-pointer ${
                  rarity === r ? "font-bold text-[#0a0d1a]" : "bg-[#141930]"
                }`}
                style={rarity === r ? { backgroundColor: RARITY_COLORS[r] } : { color: RARITY_COLORS[r] }}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Catalog Grid */}
        {loading ? (
          <LoadingScreen label="LOADING SHOP INVENTORY..." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((item) => {
              const previewUrl =
                item.assets.find((a) => a.assetRole === "preview")?.url ?? item.assets[0]?.url ?? "";
              const canAfford = walletBalance >= item.price;

              return (
                <article
                  key={item.id}
                  data-testid={`shop-item-${item.slug}`}
                  className="pixel-panel p-3.5 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="px-1.5 py-0.5 text-[10px] font-bold text-[#0a0d1a]"
                        style={{ backgroundColor: RARITY_COLORS[item.rarity] }}
                      >
                        {item.rarity}
                      </span>
                      <span className="text-xs font-bold text-[#f5b935]">
                        {item.price === 0 && item.requiredLevel > 1
                          ? `LV ${item.requiredLevel}`
                          : item.price === 0
                            ? "FREE"
                            : `${item.price.toLocaleString()} C`}
                      </span>
                    </div>

                    <div className="h-28 pixel-panel-inset flex items-center justify-center p-2 overflow-hidden">
                      {previewUrl ? (
                        <img
                          src={previewUrl}
                          alt={item.name}
                          loading="lazy"
                          className={`pixel-art max-h-24 max-w-full object-contain ${
                            item.category === "SCENE" ? "w-full h-full object-cover" : ""
                          }`}
                        />
                      ) : (
                        <span className="text-xs text-[#b8c2dc]">No preview</span>
                      )}
                    </div>

                    <div>
                      <h3 className="font-arcade-title text-xs text-[#fef8e6]">{item.name}</h3>
                      <p className="text-[11px] text-[#b8c2dc] mt-1 line-clamp-2">{item.description}</p>
                    </div>
                  </div>

                  <div className="flex gap-1.5 pt-2 border-t-2 border-[#0a0d1a]">
                    <button
                      type="button"
                      onClick={() => {
                        void audioManager.playSfx("click");
                        setPreviewItem(item);
                      }}
                      className="pixel-btn pixel-btn-secondary text-[10px] px-2.5 py-1.5"
                    >
                      Preview
                    </button>

                    {item.equipped ? (
                      <span
                        data-testid={`shop-status-${item.slug}`}
                        className="flex-1 text-center py-1.5 text-[10px] font-bold bg-[#1e7a3b] border-2 border-[#0a0d1a] text-white"
                      >
                        EQUIPPED
                      </span>
                    ) : item.owned ? (
                      <button
                        type="button"
                        data-testid={`shop-equip-${item.slug}`}
                        disabled={busySlug === item.slug}
                        onClick={() => void handleEquip(item)}
                        className="pixel-btn pixel-btn-green text-[10px] flex-1 py-1.5"
                      >
                        {busySlug === item.slug ? "..." : "EQUIP"}
                      </button>
                    ) : item.lockedByLevel ? (
                      <span className="flex-1 text-center py-1.5 text-[10px] bg-[#3b1f2b] border-2 border-[#0a0d1a] text-[#fda4af]">
                        LV {item.requiredLevel} REQ
                      </span>
                    ) : !user ? (
                      <Link to="/login" className="pixel-btn pixel-btn-primary text-[10px] flex-1 py-1.5">
                        LOGIN
                      </Link>
                    ) : !canAfford ? (
                      <button
                        type="button"
                        disabled
                        className="pixel-btn pixel-btn-secondary text-[10px] flex-1 py-1.5"
                      >
                        NEED {(item.price - walletBalance).toLocaleString()} C
                      </button>
                    ) : (
                      <button
                        type="button"
                        data-testid={`shop-buy-${item.slug}`}
                        disabled={busySlug === item.slug}
                        onClick={() => void handlePurchase(item)}
                        className="pixel-btn pixel-btn-primary text-[10px] flex-1 py-1.5"
                      >
                        {busySlug === item.slug ? "BUYING..." : `BUY ${item.price} C`}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}

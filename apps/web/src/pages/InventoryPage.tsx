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

export function InventoryPage() {
  const { user, activeLoadout, updateEquippedLocal, pushToast } = useApp();
  const [items, setItems] = useState<CosmeticItemDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<CosmeticCategory | "ALL">("ALL");
  const [rarity, setRarity] = useState<CosmeticRarity | "ALL">("ALL");
  const [busy, setBusy] = useState(false);

  const userId = user?.id ?? null;

  const loadInventory = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest<{ items: CosmeticItemDTO[]; equipped: EquippedLoadoutDTO }>("/api/inventory");
      setItems(res.items);
      updateEquippedLocal(res.equipped);
    } catch (err) {
      pushToast(err instanceof ApiClientError ? err.message : "Failed to load wardrobe.", "error");
    } finally {
      setLoading(false);
    }
  }, [userId, updateEquippedLocal, pushToast]);

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (category !== "ALL" && item.category !== category) return false;
      if (rarity !== "ALL" && item.rarity !== rarity) return false;
      return true;
    });
  }, [items, category, rarity]);

  const handleEquip = async (cat: CosmeticCategory, slug: string | null) => {
    setBusy(true);
    try {
      const res = await apiRequest<{ equipped: EquippedLoadoutDTO }>("/api/inventory/equip", {
        method: "POST",
        body: { category: cat, cosmeticSlug: slug },
      });
      void audioManager.playSfx("click");
      updateEquippedLocal(res.equipped);
      setItems((prev) =>
        prev.map((it) =>
          it.category === cat
            ? {
                ...it,
                equipped:
                  slug === null ? it.isDefault : it.slug === slug,
              }
            : it
        )
      );
      pushToast(slug ? "Equipped cosmetic!" : "Reset slot to default.", "success");
    } catch (err) {
      pushToast(err instanceof ApiClientError ? err.message : "Failed to equip item.", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleResetAll = async () => {
    setBusy(true);
    try {
      const res = await apiRequest<{ equipped: EquippedLoadoutDTO }>("/api/inventory/reset", {
        method: "POST",
      });
      void audioManager.playSfx("click");
      updateEquippedLocal(res.equipped);
      setItems((prev) => prev.map((it) => ({ ...it, equipped: it.isDefault })));
      pushToast("All cosmetics reset to classic defaults.", "info");
    } finally {
      setBusy(false);
    }
  };

  if (!user) {
    return (
      <Layout>
        <div className="pixel-panel max-w-lg mx-auto p-6 text-center space-y-4">
          <h1 className="font-arcade-title text-base text-[#f5b935]">WARDROBE &amp; INVENTORY</h1>
          <p className="text-xs text-[#b8c2dc]">
            Sign in to customize your bird skin, playable world, particle trails, and profile frame.
          </p>
          <div className="flex justify-center gap-3">
            <Link to="/login" className="pixel-btn pixel-btn-primary text-xs">Login</Link>
            <Link to="/preview" className="pixel-btn pixel-btn-secondary text-xs">Try Cosmetic Studio</Link>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-5">
        <div className="pixel-panel p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-arcade-title text-lg text-[#f5b935]">WARDROBE &amp; INVENTORY</h1>
            <p className="text-xs text-[#b8c2dc] mt-1">
              {items.length} owned cosmetics ready to equip. Changes apply immediately in gameplay.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleResetAll()}
              className="pixel-btn pixel-btn-secondary text-xs"
            >
              Reset Defaults
            </button>
            <Link to="/shop" className="pixel-btn pixel-btn-primary text-xs">
              Visit Shop
            </Link>
            <Link to="/play/classic" className="pixel-btn pixel-btn-green text-xs">
              Play Equipped
            </Link>
          </div>
        </div>

        {/* Equipped Loadout Preview */}
        <div className="pixel-panel p-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          <div className="md:col-span-5 flex justify-center">
            <CosmeticPreviewStage
              birdSlug={activeLoadout.birdSkin}
              sceneSlug={activeLoadout.scene}
              obstacleSlug={activeLoadout.obstacleSkin}
              groundSlug={activeLoadout.groundTexture}
              trailSlug={activeLoadout.particleTrail}
              width={320}
              height={190}
            />
          </div>
          <div className="md:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            {[
              ["Bird Skin", activeLoadout.birdSkin],
              ["Scene", activeLoadout.scene],
              ["Obstacles", activeLoadout.obstacleSkin],
              ["Ground", activeLoadout.groundTexture],
              ["Trail", activeLoadout.particleTrail],
              ["Flap FX", activeLoadout.flapEffect],
              ["Game-Over FX", activeLoadout.gameOverEffect],
              ["Avatar", activeLoadout.avatar],
              ["Frame", activeLoadout.frame],
            ].map(([label, val]) => (
              <div key={label} className="pixel-panel-inset p-2">
                <div className="text-[10px] text-[#b8c2dc] uppercase">{label}</div>
                <div className="font-bold text-[#fef8e6] truncate mt-0.5">{val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter by category"
            value={category}
            onChange={(e) => setCategory(e.target.value as CosmeticCategory | "ALL")}
            className="pixel-input text-xs w-auto"
          >
            <option value="ALL">All Categories</option>
            {COSMETIC_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
            ))}
          </select>

          <select
            aria-label="Filter by rarity"
            value={rarity}
            onChange={(e) => setRarity(e.target.value as CosmeticRarity | "ALL")}
            className="pixel-input text-xs w-auto"
          >
            <option value="ALL">All Rarities</option>
            {COSMETIC_RARITIES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <LoadingScreen label="OPENING WARDROBE..." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {filtered.map((item) => {
              const previewUrl =
                item.assets.find((a) => a.assetRole === "preview")?.url ?? item.assets[0]?.url ?? "";
              return (
                <div
                  key={item.id}
                  data-testid={`inventory-item-${item.slug}`}
                  className="pixel-panel p-3.5 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-[10px]">
                      <span
                        className="px-1.5 py-0.5 font-bold text-[#0a0d1a]"
                        style={{ backgroundColor: RARITY_COLORS[item.rarity] }}
                      >
                        {item.rarity}
                      </span>
                      <span className="text-[#b8c2dc]">{item.category.replace(/_/g, " ")}</span>
                    </div>
                    <div className="h-24 pixel-panel-inset flex items-center justify-center p-2">
                      {previewUrl && (
                        <img
                          src={previewUrl}
                          alt={item.name}
                          className={`pixel-art max-h-20 max-w-full object-contain ${
                            item.category === "SCENE" ? "w-full h-full object-cover" : ""
                          }`}
                        />
                      )}
                    </div>
                    <h3 className="font-arcade-title text-xs text-[#fef8e6]">{item.name}</h3>
                  </div>

                  {item.equipped ? (
                    <div className="flex gap-1.5">
                      <span className="flex-1 text-center py-1.5 text-[10px] font-bold bg-[#1e7a3b] border-2 border-[#0a0d1a]">
                        EQUIPPED
                      </span>
                      {!item.isDefault && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleEquip(item.category, null)}
                          className="pixel-btn pixel-btn-secondary text-[10px] px-2 py-1"
                        >
                          Unequip
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      data-testid={`inventory-equip-${item.slug}`}
                      disabled={busy}
                      onClick={() => void handleEquip(item.category, item.slug)}
                      className="pixel-btn pixel-btn-green text-[10px] w-full py-1.5"
                    >
                      EQUIP
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}

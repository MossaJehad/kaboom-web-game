import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ALL_COSMETICS_CATALOG,
  BIRD_SKIN_CATALOG,
  SCENE_CATALOG,
} from "@skyhop/shared";
import { CosmeticPreviewStage } from "../components/CosmeticPreviewStage.js";
import { Layout } from "../components/Layout.js";
import { useApp } from "../store/AppContext.js";

export function PreviewPage() {
  const { activeLoadout } = useApp();
  const [bird, setBird] = useState(activeLoadout.birdSkin);
  const [scene, setScene] = useState(activeLoadout.scene);
  const [obstacle, setObstacle] = useState(activeLoadout.obstacleSkin);
  const [ground, setGround] = useState(activeLoadout.groundTexture);
  const [trail, setTrail] = useState(activeLoadout.particleTrail);

  const obstacles = ALL_COSMETICS_CATALOG.filter((c) => c.category === "OBSTACLE_SKIN");
  const grounds = ALL_COSMETICS_CATALOG.filter((c) => c.category === "GROUND_TEXTURE");
  const trails = ALL_COSMETICS_CATALOG.filter((c) => c.category === "PARTICLE_TRAIL");

  return (
    <Layout>
      <div className="space-y-5">
        <div className="pixel-panel p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-arcade-title text-lg text-[#f5b935]">COSMETIC PREVIEW STUDIO</h1>
            <p className="text-xs text-[#b8c2dc] mt-1">
              Test-drive all 15 bird skins, 12 worlds, obstacle pillars, grounds, and trails together.
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/shop" className="pixel-btn pixel-btn-primary text-xs">Go to Shop</Link>
            <Link to="/inventory" className="pixel-btn pixel-btn-secondary text-xs">My Wardrobe</Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-6 pixel-panel p-4 flex flex-col items-center gap-3">
            <CosmeticPreviewStage
              birdSlug={bird}
              sceneSlug={scene}
              obstacleSlug={obstacle}
              groundSlug={ground}
              trailSlug={trail}
              width={400}
              height={280}
              className="w-full max-w-[400px]"
            />
            <p className="text-xs text-[#b8c2dc] text-center">
              Previewing <strong>{bird}</strong> flying through <strong>{scene}</strong>
            </p>
          </div>

          <div className="lg:col-span-6 pixel-panel p-5 space-y-4">
            <div className="space-y-1">
              <label htmlFor="pv-bird" className="block text-xs text-[#f5b935]">
                Bird Skin (15 Original Pixel Birds)
              </label>
              <select id="pv-bird" value={bird} onChange={(e) => setBird(e.target.value)} className="pixel-input text-xs">
                {BIRD_SKIN_CATALOG.map((b) => (
                  <option key={b.slug} value={b.slug}>
                    {b.name} ({b.rarity} — {b.price === 0 ? "Free" : `${b.price} C`})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="pv-scene" className="block text-xs text-[#38a3f1]">
                Playable Scene (12 Worlds)
              </label>
              <select id="pv-scene" value={scene} onChange={(e) => setScene(e.target.value)} className="pixel-input text-xs">
                {SCENE_CATALOG.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.name} ({s.price === 0 ? "Free" : `${s.price} C`})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="pv-obs" className="block text-xs text-[#b8c2dc]">
                Obstacle Pillars
              </label>
              <select id="pv-obs" value={obstacle} onChange={(e) => setObstacle(e.target.value)} className="pixel-input text-xs">
                {obstacles.map((o) => (
                  <option key={o.slug} value={o.slug}>{o.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="pv-gnd" className="block text-xs text-[#b8c2dc]">
                Ground Texture
              </label>
              <select id="pv-gnd" value={ground} onChange={(e) => setGround(e.target.value)} className="pixel-input text-xs">
                {grounds.map((g) => (
                  <option key={g.slug} value={g.slug}>{g.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="pv-trail" className="block text-xs text-[#b8c2dc]">
                Particle Trail
              </label>
              <select id="pv-trail" value={trail} onChange={(e) => setTrail(e.target.value)} className="pixel-input text-xs">
                {trails.map((t) => (
                  <option key={t.slug} value={t.slug}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

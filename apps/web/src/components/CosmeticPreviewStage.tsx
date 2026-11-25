import { useEffect, useRef } from "react";
import { ALL_COSMETICS_CATALOG, SCENE_CONFIGS } from "@skyhop/shared";

interface CosmeticPreviewStageProps {
  birdSlug: string;
  sceneSlug: string;
  obstacleSlug?: string;
  groundSlug?: string;
  trailSlug?: string;
  width?: number;
  height?: number;
  className?: string;
}

/**
 * Interactive animated 2D canvas preview showcasing any combination of
 * bird skin + scene parallax + obstacle skin + ground texture + particle trail.
 */
export function CosmeticPreviewStage({
  birdSlug,
  sceneSlug,
  obstacleSlug = "obstacle-scene-default",
  groundSlug = "ground-scene-default",
  trailSlug = "trail-classic",
  width = 320,
  height = 220,
  className = "",
}: CosmeticPreviewStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    const scene = SCENE_CONFIGS[sceneSlug] ?? SCENE_CONFIGS["sunny-meadow"]!;
    const trailMeta = ALL_COSMETICS_CATALOG.find((c) => c.slug === trailSlug);
    const trailColors = (trailMeta?.metadata?.colors as string[]) ?? ["#ffffff"];

    const loadImg = (src: string) => {
      const img = new Image();
      img.src = src;
      return img;
    };

    const obsItem = ALL_COSMETICS_CATALOG.find((c) => c.slug === obstacleSlug);
    const obsUrl =
      obstacleSlug !== "obstacle-scene-default" && obsItem?.metadata?.texture
        ? (obsItem.metadata.texture as string)
        : scene.assets.obstacle;

    const gndItem = ALL_COSMETICS_CATALOG.find((c) => c.slug === groundSlug);
    const gndUrl =
      groundSlug !== "ground-scene-default" && gndItem?.metadata?.texture
        ? (gndItem.metadata.texture as string)
        : scene.assets.ground;

    const skyImg = loadImg(scene.assets.sky);
    const farImg = loadImg(scene.assets.far);
    const midImg = loadImg(scene.assets.mid);
    const groundImg = loadImg(gndUrl);
    const obsImg = loadImg(obsUrl);
    const birdImg = loadImg(`/assets/birds/${birdSlug}.png`);

    let rafId = 0;
    const start = performance.now();

    const draw = (now: number) => {
      const t = (now - start) / 1000;
      const groundH = Math.round(height * 0.22);
      const skyH = height - groundH;

      ctx.clearRect(0, 0, width, height);

      if (skyImg.complete && skyImg.naturalWidth > 0) {
        ctx.drawImage(skyImg, 0, 0, width, skyH);
      } else {
        ctx.fillStyle = scene.skyTop;
        ctx.fillRect(0, 0, width, skyH);
      }

      if (farImg.complete && farImg.naturalWidth > 0) {
        const fx = -((t * 22) % width);
        ctx.drawImage(farImg, fx, 0, width, skyH);
        ctx.drawImage(farImg, fx + width, 0, width, skyH);
      }

      if (midImg.complete && midImg.naturalWidth > 0) {
        const mx = -((t * 48) % width);
        ctx.drawImage(midImg, mx, 0, width, skyH);
        ctx.drawImage(midImg, mx + width, 0, width, skyH);
      }

      // Sample scrolling obstacle pair
      if (obsImg.complete && obsImg.naturalWidth > 0) {
        const ox = width - ((t * 72) % (width + 90));
        ctx.save();
        ctx.translate(ox, 42);
        ctx.scale(1, -1);
        ctx.drawImage(obsImg, 0, 0, 42, 42);
        ctx.restore();
        ctx.drawImage(obsImg, ox, skyH - 52, 42, 52);
      }

      // Ground scroll
      if (groundImg.complete && groundImg.naturalWidth > 0) {
        const gx = -((t * 72) % width);
        ctx.drawImage(groundImg, gx, skyH, width, groundH);
        ctx.drawImage(groundImg, gx + width, skyH, width, groundH);
      }

      const birdX = Math.round(width * 0.34);
      const birdY = Math.round(skyH * 0.48 + Math.sin(t * 4.5) * 9);

      // Trail particles
      for (let i = 0; i < 6; i++) {
        const phase = (t * 2 + i * 0.17) % 1;
        ctx.fillStyle = trailColors[i % trailColors.length] ?? "#ffffff";
        ctx.globalAlpha = Math.max(0, 1 - phase);
        const px = birdX - 18 - phase * 62;
        const py = birdY + Math.sin(t * 6 + i) * 5;
        ctx.fillRect(Math.round(px), Math.round(py), 5, 5);
      }
      ctx.globalAlpha = 1;

      // Animated 3-frame bird sprite
      if (birdImg.complete && birdImg.naturalWidth > 0) {
        const frame = Math.floor(t * 9) % 3;
        const fw = birdImg.naturalWidth / 3;
        const fh = birdImg.naturalHeight;
        ctx.drawImage(birdImg, frame * fw, 0, fw, fh, birdX - 27, birdY - 21, 54, 42);
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [birdSlug, sceneSlug, obstacleSlug, groundSlug, trailSlug, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      aria-label={`Animated preview of ${birdSlug} in ${sceneSlug}`}
      className={`pixel-art border-[3px] border-[#0a0d1a] bg-[#0e1222] block ${className}`}
    />
  );
}

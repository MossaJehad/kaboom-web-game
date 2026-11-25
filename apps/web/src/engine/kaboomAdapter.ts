import kaboom, { type KaboomCtx } from "kaboom";
import { GameSimulation } from "@skyhop/game-core";
import {
  ALL_COSMETICS_CATALOG,
  BIRD_SPRITE_HEIGHT,
  BIRD_SPRITE_WIDTH,
  BIRD_START_Y,
  BIRD_X,
  DEFAULT_MODE_CONFIGS,
  FIXED_DT,
  FIXED_TPS,
  GROUND_HEIGHT,
  GROUND_Y,
  SCENE_CONFIGS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type EquippedLoadoutDTO,
  type GameState,
  type PlayerSettingsDTO,
  type SceneVisualConfig,
} from "@skyhop/shared";
import { GameStateMachine } from "./stateMachine.js";
import type { EngineEvents, EngineSessionConfig, IGameEngineAdapter } from "./types.js";

interface PooledParticle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: [number, number, number];
  kind: "rect" | "ring";
}

interface ScorePopup {
  active: boolean;
  x: number;
  y: number;
  life: number;
  text: string;
}

interface EnvParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
}

function hexToRgbTuple(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return [255, 255, 255];
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

const MAX_PARTICLES = 90;
const MAX_POPUPS = 10;

export class KaboomGameAdapter implements IGameEngineAdapter {
  private k: KaboomCtx | null = null;
  private canvasEl: HTMLCanvasElement | null = null;
  private events: EngineEvents = {};
  private fsm: GameStateMachine;
  private mounted = false;

  private sim: GameSimulation | null = null;
  private sessionConfig: EngineSessionConfig | null = null;
  private accumulator = 0;
  private pendingFlap = false;
  private flapTicks: number[] = [];
  private pauseStartedAt: number | null = null;
  private totalPauseMs = 0;

  private countdownRemaining = 0;
  private lastCountdownInt = 0;
  private gameOverTimer = 0;
  private deathFlashAlpha = 0;
  private shakeTimer = 0;
  private idleTime = 0;
  private wingTimer = 0;
  private wingFrame = 1;
  private fpsFrames = 0;
  private fpsElapsed = 0;

  private loadedSprites = new Set<string>();
  private loadingSprites = new Map<string, Promise<void>>();

  private loadout: EquippedLoadoutDTO = {
    birdSkin: "classic-sparrow",
    scene: "sunny-meadow",
    obstacleSkin: "obstacle-scene-default",
    groundTexture: "ground-scene-default",
    particleTrail: "trail-classic",
    flapEffect: "flap-classic",
    gameOverEffect: "gameover-classic",
    avatar: "avatar-sparrow-pilot",
    frame: "frame-classic-brass",
  };

  private settings: PlayerSettingsDTO = {
    masterVolume: 0.8,
    musicVolume: 0.55,
    sfxVolume: 0.85,
    ambientVolume: 0.5,
    reducedMotion: false,
    highContrast: false,
    screenShake: true,
    vibration: true,
    flapKey: "Space",
    pauseKey: "Escape",
    showFps: false,
  };

  // Object pools to avoid GC churn inside the 60+ FPS game loop
  private particlePool: PooledParticle[] = Array.from({ length: MAX_PARTICLES }, () => ({
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    size: 4,
    life: 0,
    maxLife: 0.5,
    color: [255, 255, 255],
    kind: "rect",
  }));

  private popupPool: ScorePopup[] = Array.from({ length: MAX_POPUPS }, () => ({
    active: false,
    x: 0,
    y: 0,
    life: 0,
    text: "+1",
  }));

  private envParticles: EnvParticle[] = [];
  private cleanupFns: Array<() => void> = [];

  constructor() {
    this.fsm = new GameStateMachine("LOADING", (next, prev) => {
      this.events.onStateChange?.(next, prev);
    });
  }

  getState(): GameState {
    return this.fsm.state;
  }

  getCurrentScore(): number {
    return this.sim?.getState().score ?? 0;
  }

  async mount(container: HTMLElement, events: EngineEvents): Promise<void> {
    // Guard against double-mount or overlapping loops
    if (this.mounted) {
      this.unmount();
    }

    this.events = events;
    this.mounted = true;
    this.fsm.forceState("LOADING");

    // Create a fresh dedicated canvas per mount so StrictMode / remount never collides with deferred WebGL quit()
    container.innerHTML = "";
    const canvas = document.createElement("canvas");
    canvas.dataset.testid = "kaboom-game-canvas";
    canvas.className = "w-full h-full block pixel-art cursor-pointer";
    container.appendChild(canvas);
    this.canvasEl = canvas;

    const k = kaboom({
      global: false,
      canvas,
      width: WORLD_WIDTH,
      height: WORLD_HEIGHT,
      stretch: true,
      crisp: true,
      texFilter: "nearest",
      touchToMouse: false,
      loadingScreen: false,
      debug: false,
      pixelDensity: Math.min(window.devicePixelRatio || 1, 2),
      background: [18, 22, 41],
    });
    this.k = k;

    this.initEnvParticles(this.getActiveSceneConfig());
    await this.loadCosmetics(this.loadout);

    // Register Kaboom update & render hooks
    const updateCtrl = k.onUpdate(() => {
      this.onFrameUpdate(k.dt());
    });

    const drawCtrl = k.onDraw(() => {
      this.onFrameDraw(k);
    });

    // Keyboard & visibility listeners (explicitly tracked & cleaned up on unmount)
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) {
        return;
      }

      const flapCode = this.settings.flapKey || "Space";
      const pauseCode = this.settings.pauseKey || "Escape";

      if (e.code === flapCode || e.key === " " || e.code === "ArrowUp" || e.code === "KeyW") {
        if (this.fsm.state === "READY" || this.fsm.state === "PLAYING") {
          e.preventDefault();
          this.triggerFlap();
        }
      } else if (e.code === pauseCode || e.code === "KeyP") {
        if (this.fsm.state === "PLAYING") {
          e.preventDefault();
          this.pause();
        } else if (this.fsm.state === "PAUSED") {
          e.preventDefault();
          this.resume();
        }
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden && this.fsm.state === "PLAYING") {
        if (this.sessionConfig?.physicsConfig.allowPause) {
          this.pause();
        }
      }
    };

    // Unified PointerEvent input on canvas prevents touch+mouse duplication on mobile!
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      if (this.fsm.state === "READY" || this.fsm.state === "PLAYING") {
        e.preventDefault();
        this.triggerFlap();
      }
    };

    window.addEventListener("keydown", onKeyDown, { passive: false });
    document.addEventListener("visibilitychange", onVisibilityChange);
    canvas.addEventListener("pointerdown", onPointerDown, { passive: false });

    this.cleanupFns.push(
      () => updateCtrl.cancel(),
      () => drawCtrl.cancel(),
      () => window.removeEventListener("keydown", onKeyDown),
      () => document.removeEventListener("visibilitychange", onVisibilityChange),
      () => canvas.removeEventListener("pointerdown", onPointerDown)
    );

    this.fsm.transition("READY");
    this.events.onAssetsLoaded?.();
  }

  unmount(): void {
    for (const fn of this.cleanupFns) {
      try {
        fn();
      } catch {
        // ignore teardown errors
      }
    }
    this.cleanupFns = [];

    if (this.k) {
      try {
        this.k.quit();
      } catch {
        // ignore if already destroyed
      }
      this.k = null;
    }

    if (this.canvasEl) {
      try {
        this.canvasEl.remove();
      } catch {
        // ignore
      }
      this.canvasEl = null;
    }

    this.loadedSprites.clear();
    this.loadingSprites.clear();
    this.mounted = false;
  }

  private getActiveSceneConfig(): SceneVisualConfig {
    return SCENE_CONFIGS[this.loadout.scene] ?? SCENE_CONFIGS["sunny-meadow"]!;
  }

  private async ensureSprite(key: string, url: string, sliceX = 1): Promise<void> {
    if (!this.k || this.loadedSprites.has(key)) return;
    const inflight = this.loadingSprites.get(key);
    if (inflight) return inflight;

    const k = this.k;
    const p = new Promise<void>((resolve) => {
      try {
        const asset = k.loadSprite(key, url, sliceX > 1 ? { sliceX } : undefined);
        asset
          .then(() => {
            this.loadedSprites.add(key);
            this.loadingSprites.delete(key);
            resolve();
          })
          .catch(() => {
            this.loadingSprites.delete(key);
            resolve();
          });
      } catch {
        this.loadingSprites.delete(key);
        resolve();
      }
    });

    this.loadingSprites.set(key, p);
    return p;
  }

  async loadCosmetics(loadout: EquippedLoadoutDTO): Promise<void> {
    this.loadout = { ...loadout };
    const sceneCfg = this.getActiveSceneConfig();
    this.initEnvParticles(sceneCfg);

    if (!this.k) return;

    const tasks: Promise<void>[] = [
      this.ensureSprite(`bird:${loadout.birdSkin}`, `/assets/birds/${loadout.birdSkin}.png`, 3),
      this.ensureSprite(`scene:${sceneCfg.slug}:sky`, sceneCfg.assets.sky),
      this.ensureSprite(`scene:${sceneCfg.slug}:far`, sceneCfg.assets.far),
      this.ensureSprite(`scene:${sceneCfg.slug}:mid`, sceneCfg.assets.mid),
      this.ensureSprite(`scene:${sceneCfg.slug}:ground`, sceneCfg.assets.ground),
      this.ensureSprite(`scene:${sceneCfg.slug}:obstacle`, sceneCfg.assets.obstacle),
    ];

    if (loadout.obstacleSkin && loadout.obstacleSkin !== "obstacle-scene-default") {
      const obsMeta = ALL_COSMETICS_CATALOG.find((c) => c.slug === loadout.obstacleSkin);
      const url = (obsMeta?.metadata?.texture as string) || `/assets/obstacles/${loadout.obstacleSkin.replace(/^obstacle-/, "")}.png`;
      tasks.push(this.ensureSprite(`obs:${loadout.obstacleSkin}`, url));
    }

    if (loadout.groundTexture && loadout.groundTexture !== "ground-scene-default") {
      const grMeta = ALL_COSMETICS_CATALOG.find((c) => c.slug === loadout.groundTexture);
      const url = (grMeta?.metadata?.texture as string) || `/assets/grounds/${loadout.groundTexture.replace(/^ground-/, "")}.png`;
      tasks.push(this.ensureSprite(`gnd:${loadout.groundTexture}`, url));
    }

    await Promise.all(tasks);
  }

  updateSettings(settings: PlayerSettingsDTO): void {
    this.settings = { ...settings };
  }

  prepareSession(session: EngineSessionConfig): void {
    this.sessionConfig = session;
    this.sim = new GameSimulation(session.seed, session.physicsConfig);
    this.accumulator = 0;
    this.pendingFlap = false;
    this.flapTicks = [];
    this.pauseStartedAt = null;
    this.totalPauseMs = 0;
    this.gameOverTimer = 0;
    this.deathFlashAlpha = 0;
    this.shakeTimer = 0;
    this.resetPools();
    this.events.onScoreChange?.(0);

    if (session.countdownEnabled) {
      this.countdownRemaining = 2.4;
      this.lastCountdownInt = 3;
      this.fsm.forceState("COUNTDOWN");
      this.events.onCountdownTick?.(3);
    } else {
      this.fsm.forceState("READY");
    }
  }

  triggerFlap(): void {
    if (!this.sim) {
      this.prepareSession({
        sessionId: null,
        mode: "classic",
        seed: `practice-${Date.now()}`,
        physicsConfig: DEFAULT_MODE_CONFIGS.classic,
      });
    }

    if (this.fsm.state === "READY") {
      this.fsm.transition("PLAYING");
    }

    if (this.fsm.state === "PLAYING") {
      this.pendingFlap = true;
    }
  }

  pause(): boolean {
    if (this.fsm.state !== "PLAYING") return false;
    if (!this.sessionConfig?.physicsConfig.allowPause) return false;
    this.pauseStartedAt = performance.now();
    return this.fsm.transition("PAUSED");
  }

  resume(): boolean {
    if (this.fsm.state !== "PAUSED") return false;
    if (this.pauseStartedAt !== null) {
      this.totalPauseMs += Math.round(performance.now() - this.pauseStartedAt);
      this.pauseStartedAt = null;
    }
    this.accumulator = 0;
    return this.fsm.transition("PLAYING");
  }

  markResultsShown(): void {
    this.fsm.transition("RESULTS");
  }

  beginRestart(): void {
    this.fsm.transition("RESTARTING");
  }

  private resetPools(): void {
    for (const p of this.particlePool) p.active = false;
    for (const pop of this.popupPool) pop.active = false;
  }

  private spawnParticle(
    x: number,
    y: number,
    vx: number,
    vy: number,
    size: number,
    maxLife: number,
    color: [number, number, number],
    kind: "rect" | "ring" = "rect"
  ): void {
    if (this.settings.reducedMotion) return;
    for (const p of this.particlePool) {
      if (!p.active) {
        p.active = true;
        p.x = x;
        p.y = y;
        p.vx = vx;
        p.vy = vy;
        p.size = size;
        p.life = maxLife;
        p.maxLife = maxLife;
        p.color = color;
        p.kind = kind;
        return;
      }
    }
  }

  private spawnScorePopup(x: number, y: number, text: string): void {
    for (const pop of this.popupPool) {
      if (!pop.active) {
        pop.active = true;
        pop.x = x;
        pop.y = y;
        pop.life = 0.7;
        pop.text = text;
        return;
      }
    }
  }

  private emitFlapParticles(x: number, y: number): void {
    if (this.settings.reducedMotion) return;
    const flapItem = ALL_COSMETICS_CATALOG.find((c) => c.slug === this.loadout.flapEffect);
    const style = (flapItem?.metadata?.style as string) || "puff";
    const colHex = (flapItem?.metadata?.color as string) || "#ffffff";
    const rgb = hexToRgbTuple(colHex);

    if (style === "ring") {
      this.spawnParticle(x - 4, y + 10, -25, 18, 10, 0.35, rgb, "ring");
    } else if (style === "burst" || style === "lightning") {
      for (let i = 0; i < 6; i++) {
        const ang = (Math.PI * 2 * i) / 6;
        this.spawnParticle(x - 4, y + 4, Math.cos(ang) * 95 - 30, Math.sin(ang) * 95, 4, 0.32, rgb);
      }
    } else {
      for (let i = 0; i < 4; i++) {
        this.spawnParticle(
          x - 10,
          y + 6 + (i - 1.5) * 3,
          -55 - Math.random() * 35,
          20 + Math.random() * 40,
          4,
          0.3,
          rgb
        );
      }
    }
  }

  private emitTrailParticle(x: number, y: number): void {
    if (this.settings.reducedMotion) return;
    const trailItem = ALL_COSMETICS_CATALOG.find((c) => c.slug === this.loadout.particleTrail);
    const colors = (trailItem?.metadata?.colors as string[]) || ["#ffffff"];
    const chosen = colors[Math.floor(Math.random() * colors.length)] ?? "#ffffff";
    this.spawnParticle(
      x - 14,
      y + (Math.random() * 8 - 4),
      -70 - Math.random() * 30,
      Math.random() * 24 - 12,
      4,
      0.38,
      hexToRgbTuple(chosen)
    );
  }

  private emitGameOverParticles(x: number, y: number): void {
    if (this.settings.reducedMotion) return;
    const goItem = ALL_COSMETICS_CATALOG.find((c) => c.slug === this.loadout.gameOverEffect);
    const style = (goItem?.metadata?.style as string) || "tumble";
    const color = hexToRgbTuple((goItem?.metadata?.color as string) || "#ffffff");

    if (style === "ghost") {
      for (let i = 0; i < 10; i++) {
        this.spawnParticle(x + (Math.random() * 18 - 9), y, Math.random() * 20 - 10, -85 - Math.random() * 55, 6, 0.85, color);
      }
    } else if (style === "supernova") {
      this.spawnParticle(x, y, 0, 0, 14, 0.5, color, "ring");
      for (let i = 0; i < 18; i++) {
        const ang = (Math.PI * 2 * i) / 18;
        const spd = 80 + Math.random() * 120;
        this.spawnParticle(x, y, Math.cos(ang) * spd, Math.sin(ang) * spd, 5, 0.65, color);
      }
    } else {
      for (let i = 0; i < 14; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 50 + Math.random() * 110;
        this.spawnParticle(x, y, Math.cos(ang) * spd, Math.sin(ang) * spd - 40, 5, 0.55, color);
      }
    }
  }

  private initEnvParticles(scene: SceneVisualConfig): void {
    this.envParticles = [];
    const count = Math.min(36, scene.particleCount);
    for (let i = 0; i < count; i++) {
      this.envParticles.push({
        x: Math.random() * WORLD_WIDTH,
        y: Math.random() * GROUND_Y,
        vx:
          scene.particleType === "rain"
            ? -80
            : scene.particleType === "sand" || scene.particleType === "stars"
              ? -95 - Math.random() * 45
              : -22 - Math.random() * 25,
        vy:
          scene.particleType === "rain"
            ? 340
            : scene.particleType === "snow" || scene.particleType === "sakura"
              ? 35 + Math.random() * 30
              : scene.particleType === "bubbles" || scene.particleType === "embers" || scene.particleType === "ghost_wisps"
                ? -35 - Math.random() * 35
                : (Math.random() - 0.5) * 12,
        size:
          scene.particleType === "rain"
            ? 2
            : scene.particleType === "clouds"
              ? 4
              : 2 + Math.floor(Math.random() * 3),
        alpha: 0.35 + Math.random() * 0.4,
      });
    }
  }

  private onFrameUpdate(rawDt: number): void {
    // Cap frame delta to prevent spiral of death on tab wake / frame spike
    const dt = Math.min(rawDt, 0.08);
    this.idleTime += dt;

    // FPS measurement
    this.fpsFrames++;
    this.fpsElapsed += rawDt;
    if (this.fpsElapsed >= 0.5) {
      this.events.onFpsUpdate?.(Math.round(this.fpsFrames / this.fpsElapsed));
      this.fpsFrames = 0;
      this.fpsElapsed = 0;
    }

    // Update particles & environmental FX
    if (this.fsm.state !== "PAUSED") {
      if (!this.settings.reducedMotion) {
        for (const ep of this.envParticles) {
          ep.x += ep.vx * dt;
          ep.y += ep.vy * dt;
          if (ep.x < -10) ep.x = WORLD_WIDTH + 10;
          if (ep.x > WORLD_WIDTH + 10) ep.x = -10;
          if (ep.y > GROUND_Y) ep.y = -5;
          if (ep.y < -10) ep.y = GROUND_Y - 4;
        }
      }

      for (const p of this.particlePool) {
        if (!p.active) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.active = false;
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.kind === "ring") p.size += 85 * dt;
      }

      for (const pop of this.popupPool) {
        if (!pop.active) continue;
        pop.life -= dt;
        pop.y -= 42 * dt;
        if (pop.life <= 0) pop.active = false;
      }

      if (this.deathFlashAlpha > 0) {
        this.deathFlashAlpha = Math.max(0, this.deathFlashAlpha - dt * 2.5);
      }
      if (this.shakeTimer > 0) {
        this.shakeTimer = Math.max(0, this.shakeTimer - dt);
      }
    }

    // Wing flap animation cycle
    if (this.fsm.state === "READY" || this.fsm.state === "COUNTDOWN" || this.fsm.state === "PLAYING") {
      this.wingTimer += dt;
      const interval = this.fsm.state === "PLAYING" ? 0.09 : 0.16;
      if (this.wingTimer >= interval) {
        this.wingTimer = 0;
        this.wingFrame = (this.wingFrame + 1) % 3;
      }
    }

    // Countdown state tick
    if (this.fsm.state === "COUNTDOWN") {
      this.countdownRemaining -= dt;
      const whole = Math.ceil(this.countdownRemaining);
      if (whole !== this.lastCountdownInt && whole > 0) {
        this.lastCountdownInt = whole;
        this.events.onCountdownTick?.(whole);
      }
      if (this.countdownRemaining <= 0) {
        this.events.onCountdownTick?.(0);
        this.fsm.transition("PLAYING");
        this.pendingFlap = true;
      }
      return;
    }

    // Game-over brief animation transition -> RESULTS
    if (this.fsm.state === "GAME_OVER") {
      this.gameOverTimer += dt;
      if (this.gameOverTimer >= 0.65) {
        this.fsm.transition("RESULTS");
      }
      return;
    }

    if (this.fsm.state !== "PLAYING" || !this.sim || !this.sessionConfig) {
      return;
    }

    // Fixed-timestep simulation loop (identical across 60Hz, 120Hz, 144Hz displays!)
    this.accumulator += dt;
    let trailCounter = 0;
    while (this.accumulator >= FIXED_DT) {
      const currentTick = this.sim.getState().tick;
      const wantsFlap = this.pendingFlap;
      this.pendingFlap = false;

      const stepRes = this.sim.step(wantsFlap);
      const st = this.sim.getState();

      if (stepRes.flapped) {
        this.flapTicks.push(currentTick);
        this.wingFrame = 0;
        this.emitFlapParticles(st.birdX, st.birdY);
        this.events.onFlap?.();
      }

      if (currentTick % 4 === 0 && trailCounter < 1) {
        this.emitTrailParticle(st.birdX, st.birdY);
        trailCounter++;
      }

      if (stepRes.scored) {
        this.spawnScorePopup(st.birdX + 12, st.birdY - 20, "+1");
        this.events.onScoreChange?.(st.score);
      }

      if (stepRes.died) {
        this.deathFlashAlpha = 0.7;
        if (this.settings.screenShake && !this.settings.reducedMotion) {
          this.shakeTimer = 0.25;
        }
        if (this.settings.vibration && typeof navigator !== "undefined" && "vibrate" in navigator) {
          try {
            navigator.vibrate(120);
          } catch {
            // ignore unsupported
          }
        }
        this.emitGameOverParticles(st.birdX, st.birdY);
        this.events.onCollision?.(stepRes.deathReason === "GROUND" ? "GROUND" : "OBSTACLE");
        this.fsm.transition("GAME_OVER");
        this.events.onRunFinished?.({
          sessionId: this.sessionConfig.sessionId,
          mode: this.sessionConfig.mode,
          score: st.score,
          obstaclesPassed: st.obstaclesPassed,
          totalTicks: st.tick,
          flapTicks: [...this.flapTicks],
          durationMs: Math.round((st.tick / FIXED_TPS) * 1000),
          pauseDurationMs: this.totalPauseMs,
          deathReason: stepRes.deathReason,
        });
        this.accumulator = 0;
        break;
      }

      this.accumulator -= FIXED_DT;
    }
  }

  private onFrameDraw(k: KaboomCtx): void {
    const scene = this.getActiveSceneConfig();
    const st = this.sim?.getState();
    const scroll = st ? st.scrollDistance : this.idleTime * 65;

    const shakeX =
      this.shakeTimer > 0 && !this.settings.reducedMotion ? (Math.random() - 0.5) * 10 : 0;
    const shakeY =
      this.shakeTimer > 0 && !this.settings.reducedMotion ? (Math.random() - 0.5) * 10 : 0;

    // 1. Sky backdrop
    const skyKey = `scene:${scene.slug}:sky`;
    if (this.loadedSprites.has(skyKey)) {
      k.drawSprite({ sprite: skyKey, pos: k.vec2(shakeX, shakeY), width: WORLD_WIDTH, height: GROUND_Y });
    } else {
      const [r, g, b] = hexToRgbTuple(scene.skyTop);
      k.drawRect({ pos: k.vec2(0, 0), width: WORLD_WIDTH, height: GROUND_Y, color: k.rgb(r, g, b) });
    }

    // 2. Parallax Far Layer (seamless 2-tile scroll)
    const farKey = `scene:${scene.slug}:far`;
    if (this.loadedSprites.has(farKey)) {
      const farOffset = -((scroll * scene.parallaxSpeedFar) % WORLD_WIDTH);
      k.drawSprite({ sprite: farKey, pos: k.vec2(Math.floor(farOffset + shakeX), shakeY), width: WORLD_WIDTH, height: GROUND_Y });
      k.drawSprite({ sprite: farKey, pos: k.vec2(Math.floor(farOffset + WORLD_WIDTH + shakeX), shakeY), width: WORLD_WIDTH, height: GROUND_Y });
    }

    // 3. Parallax Mid Layer
    const midKey = `scene:${scene.slug}:mid`;
    if (this.loadedSprites.has(midKey)) {
      const midOffset = -((scroll * scene.parallaxSpeedMid) % WORLD_WIDTH);
      k.drawSprite({ sprite: midKey, pos: k.vec2(Math.floor(midOffset + shakeX), shakeY), width: WORLD_WIDTH, height: GROUND_Y });
      k.drawSprite({ sprite: midKey, pos: k.vec2(Math.floor(midOffset + WORLD_WIDTH + shakeX), shakeY), width: WORLD_WIDTH, height: GROUND_Y });
    }

    // 4. Environmental weather / ambiance particles (subtle & non-obstructive)
    if (!this.settings.reducedMotion) {
      const [pr, pg, pb] = hexToRgbTuple(scene.particleColor);
      for (const ep of this.envParticles) {
        k.drawRect({
          pos: k.vec2(Math.floor(ep.x), Math.floor(ep.y)),
          width: ep.size,
          height: scene.particleType === "rain" ? 9 : ep.size,
          color: k.rgb(pr, pg, pb),
          opacity: ep.alpha,
        });
      }
    }

    // 5. Obstacles (with bespoke scene or equipped obstacle skin override)
    const obsSpriteKey =
      this.loadout.obstacleSkin &&
      this.loadout.obstacleSkin !== "obstacle-scene-default" &&
      this.loadedSprites.has(`obs:${this.loadout.obstacleSkin}`)
        ? `obs:${this.loadout.obstacleSkin}`
        : `scene:${scene.slug}:obstacle`;

    if (st && (this.fsm.state === "PLAYING" || this.fsm.state === "PAUSED" || this.fsm.state === "GAME_OVER" || this.fsm.state === "RESULTS")) {
      const hasObsSprite = this.loadedSprites.has(obsSpriteKey);
      const [or, og, ob] = hexToRgbTuple(scene.obstaclePrimary);

      for (const obs of st.obstacles) {
        if (obs.x > WORLD_WIDTH + 60 || obs.x + obs.width < -60) continue;
        const gapTop = obs.gapCenterY - obs.gapHeight / 2;
        const gapBottom = obs.gapCenterY + obs.gapHeight / 2;
        const topHeight = Math.max(0, gapTop);
        const bottomHeight = Math.max(0, GROUND_Y - gapBottom);

        if (hasObsSprite) {
          // Top pillar (flipped vertically so lip cap faces the gap!)
          if (topHeight > 0) {
            k.drawSprite({
              sprite: obsSpriteKey,
              pos: k.vec2(Math.floor(obs.x + shakeX), Math.floor(shakeY)),
              width: obs.width,
              height: topHeight,
              flipY: true,
            });
          }
          // Bottom pillar (lip cap at top facing the gap)
          if (bottomHeight > 0) {
            k.drawSprite({
              sprite: obsSpriteKey,
              pos: k.vec2(Math.floor(obs.x + shakeX), Math.floor(gapBottom + shakeY)),
              width: obs.width,
              height: bottomHeight,
            });
          }
        } else {
          k.drawRect({
            pos: k.vec2(obs.x + shakeX, shakeY),
            width: obs.width,
            height: topHeight,
            color: k.rgb(or, og, ob),
          });
          k.drawRect({
            pos: k.vec2(obs.x + shakeX, gapBottom + shakeY),
            width: obs.width,
            height: bottomHeight,
            color: k.rgb(or, og, ob),
          });
        }
      }
    }

    // 6. Seamlessly scrolling Ground (with scene or equipped ground override)
    const gndKey =
      this.loadout.groundTexture &&
      this.loadout.groundTexture !== "ground-scene-default" &&
      this.loadedSprites.has(`gnd:${this.loadout.groundTexture}`)
        ? `gnd:${this.loadout.groundTexture}`
        : `scene:${scene.slug}:ground`;
    const groundOffset = -(scroll % WORLD_WIDTH);

    if (this.loadedSprites.has(gndKey)) {
      k.drawSprite({ sprite: gndKey, pos: k.vec2(Math.floor(groundOffset + shakeX), GROUND_Y + shakeY), width: WORLD_WIDTH, height: GROUND_HEIGHT });
      k.drawSprite({ sprite: gndKey, pos: k.vec2(Math.floor(groundOffset + WORLD_WIDTH + shakeX), GROUND_Y + shakeY), width: WORLD_WIDTH, height: GROUND_HEIGHT });
    } else {
      const [gr, gg, gb] = hexToRgbTuple(scene.groundTint);
      k.drawRect({ pos: k.vec2(0, GROUND_Y), width: WORLD_WIDTH, height: GROUND_HEIGHT, color: k.rgb(gr, gg, gb) });
    }

    // 7. Pooled Trail / Flap / Game-Over Particles
    for (const p of this.particlePool) {
      if (!p.active) continue;
      const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));
      if (p.kind === "ring") {
        k.drawCircle({
          pos: k.vec2(p.x + shakeX, p.y + shakeY),
          radius: p.size,
          fill: false,
          outline: { width: 2, color: k.rgb(p.color[0], p.color[1], p.color[2]) },
          opacity: alpha * 0.85,
        });
      } else {
        k.drawRect({
          pos: k.vec2(Math.floor(p.x + shakeX), Math.floor(p.y + shakeY)),
          width: p.size,
          height: p.size,
          color: k.rgb(p.color[0], p.color[1], p.color[2]),
          opacity: alpha,
        });
      }
    }

    // 8. Bird Sprite (animated 3-frame wings + smooth velocity-based rotation)
    const birdKey = `bird:${this.loadout.birdSkin}`;
    const drawBirdY =
      this.fsm.state === "READY" || this.fsm.state === "COUNTDOWN"
        ? BIRD_START_Y + Math.sin(this.idleTime * 5) * 7
        : (st?.birdY ?? BIRD_START_Y);
    const drawAngle =
      this.fsm.state === "READY" || this.fsm.state === "COUNTDOWN" ? 0 : (st?.birdAngle ?? 0);

    if (this.loadedSprites.has(birdKey)) {
      k.drawSprite({
        sprite: birdKey,
        frame: this.wingFrame,
        pos: k.vec2(Math.floor(BIRD_X + shakeX), Math.floor(drawBirdY + shakeY)),
        width: BIRD_SPRITE_WIDTH,
        height: BIRD_SPRITE_HEIGHT,
        anchor: "center",
        angle: drawAngle,
      });
    } else {
      k.drawRect({
        pos: k.vec2(BIRD_X, drawBirdY),
        width: 28,
        height: 20,
        anchor: "center",
        color: k.rgb(245, 185, 53),
      });
    }

    // 9. Floating "+1" Score Popups
    for (const pop of this.popupPool) {
      if (!pop.active) continue;
      k.drawText({
        text: pop.text,
        size: 16,
        pos: k.vec2(pop.x, pop.y),
        color: k.rgb(254, 240, 138),
        opacity: Math.min(1, pop.life * 2),
      });
    }

    // 10. Crisp arcade in-canvas score counter during active flight
    if (st && (this.fsm.state === "PLAYING" || this.fsm.state === "PAUSED")) {
      const scoreStr = String(st.score);
      // Drop shadow for legibility on any bright/dark scene
      k.drawText({
        text: scoreStr,
        size: 42,
        pos: k.vec2(WORLD_WIDTH / 2 + 3, 56 + 3),
        anchor: "center",
        color: k.rgb(12, 14, 24),
      });
      k.drawText({
        text: scoreStr,
        size: 42,
        pos: k.vec2(WORLD_WIDTH / 2, 56),
        anchor: "center",
        color: k.rgb(255, 250, 230),
      });
    }

    // 11. Hit flash on collision
    if (this.deathFlashAlpha > 0 && !this.settings.reducedMotion) {
      k.drawRect({
        pos: k.vec2(0, 0),
        width: WORLD_WIDTH,
        height: WORLD_HEIGHT,
        color: k.rgb(255, 255, 255),
        opacity: this.deathFlashAlpha,
      });
    }
  }
}

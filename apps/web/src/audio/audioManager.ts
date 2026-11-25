import type { PlayerSettingsDTO } from "@skyhop/shared";

export type SoundEffectKey =
  | "flap"
  | "score"
  | "hit"
  | "die"
  | "coin"
  | "purchase"
  | "achievement"
  | "levelup"
  | "click"
  | "countdown"
  | "go";

const SFX_FILES: Record<SoundEffectKey, string> = {
  flap: "/assets/audio/flap.wav",
  score: "/assets/audio/score.wav",
  hit: "/assets/audio/hit.wav",
  die: "/assets/audio/die.wav",
  coin: "/assets/audio/coin.wav",
  purchase: "/assets/audio/purchase.wav",
  achievement: "/assets/audio/achievement.wav",
  levelup: "/assets/audio/levelup.wav",
  click: "/assets/audio/click.wav",
  countdown: "/assets/audio/countdown.wav",
  go: "/assets/audio/go.wav",
};

class AudioManager {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();

  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;

  private bgmSource: AudioBufferSourceNode | null = null;
  private ambientSource: AudioBufferSourceNode | null = null;
  private currentAmbientKey: string | null = null;
  private bgmWanted = false;
  private unlocked = false;

  private prefs = {
    masterVolume: 0.8,
    musicVolume: 0.55,
    sfxVolume: 0.85,
    ambientVolume: 0.5,
  };

  constructor() {
    if (typeof window !== "undefined") {
      try {
        const saved = window.localStorage.getItem("skyhop_audio_prefs");
        if (saved) {
          const parsed = JSON.parse(saved) as Partial<typeof this.prefs>;
          this.prefs = { ...this.prefs, ...parsed };
        }
      } catch {
        // ignore storage errors
      }
    }
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.ambientGain = this.ctx.createGain();

      this.musicGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.ambientGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
      this.applyVolumes();
    }
    return this.ctx;
  }

  unlock(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    this.unlocked = true;
    if (this.bgmWanted && !this.bgmSource) {
      void this.startMusic();
    }
  }

  applySettings(settings: Pick<PlayerSettingsDTO, "masterVolume" | "musicVolume" | "sfxVolume" | "ambientVolume">): void {
    this.prefs = {
      masterVolume: settings.masterVolume,
      musicVolume: settings.musicVolume,
      sfxVolume: settings.sfxVolume,
      ambientVolume: settings.ambientVolume,
    };
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem("skyhop_audio_prefs", JSON.stringify(this.prefs));
      } catch {
        // ignore
      }
    }
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (this.masterGain) this.masterGain.gain.value = this.prefs.masterVolume;
    if (this.musicGain) this.musicGain.gain.value = this.prefs.musicVolume;
    if (this.sfxGain) this.sfxGain.gain.value = this.prefs.sfxVolume;
    if (this.ambientGain) this.ambientGain.gain.value = this.prefs.ambientVolume;
  }

  private async loadBuffer(url: string): Promise<AudioBuffer | null> {
    const ctx = this.ensureContext();
    if (!ctx) return null;
    const cached = this.buffers.get(url);
    if (cached) return cached;
    const pending = this.loading.get(url);
    if (pending) return pending;

    const promise = fetch(url)
      .then((res) => (res.ok ? res.arrayBuffer() : null))
      .then((buf) => (buf ? ctx.decodeAudioData(buf) : null))
      .then((decoded) => {
        if (decoded) this.buffers.set(url, decoded);
        this.loading.delete(url);
        return decoded;
      })
      .catch(() => {
        this.loading.delete(url);
        return null;
      });

    this.loading.set(url, promise);
    return promise;
  }

  async playSfx(key: SoundEffectKey): Promise<void> {
    if (this.prefs.masterVolume <= 0 || this.prefs.sfxVolume <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    const buf = await this.loadBuffer(SFX_FILES[key]);
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.sfxGain);
    src.start();
  }

  async startMusic(): Promise<void> {
    this.bgmWanted = true;
    const ctx = this.ensureContext();
    if (!ctx || !this.musicGain || !this.unlocked) return;
    if (this.bgmSource) return;

    const buf = await this.loadBuffer("/assets/audio/bgm-arcade.wav");
    if (!buf || !this.bgmWanted || this.bgmSource) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(this.musicGain);
    src.start();
    this.bgmSource = src;
  }

  stopMusic(): void {
    this.bgmWanted = false;
    if (this.bgmSource) {
      try {
        this.bgmSource.stop();
        this.bgmSource.disconnect();
      } catch {
        // ignore
      }
      this.bgmSource = null;
    }
  }

  async playSceneAmbient(ambientAudioKey: string): Promise<void> {
    if (this.currentAmbientKey === ambientAudioKey && this.ambientSource) return;
    this.stopSceneAmbient();
    this.currentAmbientKey = ambientAudioKey;

    const ctx = this.ensureContext();
    if (!ctx || !this.ambientGain || !this.unlocked) return;

    const buf = await this.loadBuffer(`/assets/audio/${ambientAudioKey}.wav`);
    if (!buf || this.currentAmbientKey !== ambientAudioKey) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(this.ambientGain);
    src.start();
    this.ambientSource = src;
  }

  stopSceneAmbient(): void {
    this.currentAmbientKey = null;
    if (this.ambientSource) {
      try {
        this.ambientSource.stop();
        this.ambientSource.disconnect();
      } catch {
        // ignore
      }
      this.ambientSource = null;
    }
  }
}

export const audioManager = new AudioManager();

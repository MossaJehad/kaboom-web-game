import {
  BIRD_HITBOX_HALF_H,
  BIRD_HITBOX_HALF_W,
  BIRD_START_Y,
  BIRD_X,
  CEILING_Y,
  FIXED_DT,
  FIXED_TPS,
  GROUND_Y,
  OBSTACLE_WIDTH,
  WORLD_WIDTH,
  type AntiCheatConfig,
  type ModePhysicsConfig,
} from "@skyhop/shared";
import { DeterministicRng } from "./prng.js";

export type DeathReason = "NONE" | "GROUND" | "OBSTACLE";

export interface ObstaclePair {
  id: number;
  x: number;
  width: number;
  gapCenterY: number;
  gapHeight: number;
  passed: boolean;
}

export interface SimulationState {
  tick: number;
  birdX: number;
  birdY: number;
  birdVy: number;
  birdAngle: number;
  alive: boolean;
  deathReason: DeathReason;
  deathTick: number | null;
  score: number;
  obstaclesPassed: number;
  currentSpeed: number;
  currentGap: number;
  scrollDistance: number;
  lastFlapTick: number;
  obstacles: readonly ObstaclePair[];
}

export interface StepResult {
  flapped: boolean;
  scored: boolean;
  died: boolean;
  deathReason: DeathReason;
}

/**
 * Pure deterministic fixed-timestep Flappy Bird physics simulation.
 * Completely independent of Kaboom.js, DOM, frame rate, or system clock.
 * Runs identically in the browser client and Node.js replay verification backend.
 */
export class GameSimulation {
  readonly seed: string;
  readonly config: ModePhysicsConfig;
  private rng: DeterministicRng;

  private tick = 0;
  private birdY = BIRD_START_Y;
  private birdVy = 0;
  private alive = true;
  private deathReason: DeathReason = "NONE";
  private deathTick: number | null = null;
  private score = 0;
  private obstaclesPassed = 0;
  private scrollDistance = 0;
  private lastFlapTick = -999;
  private nextObstacleId = 1;
  private lastGapCenterY = BIRD_START_Y;
  private obstacles: ObstaclePair[] = [];

  constructor(seed: string, config: ModePhysicsConfig) {
    this.seed = seed;
    this.config = { ...config };
    this.rng = new DeterministicRng(seed);
    this.seedInitialObstacles();
  }

  get currentSpeed(): number {
    return Math.min(
      this.config.maxSpeed,
      this.config.baseSpeed + this.score * this.config.speedIncrementPerScore
    );
  }

  get currentGap(): number {
    return Math.max(
      this.config.minGap,
      this.config.baseGap - this.score * this.config.gapDecrementPerScore
    );
  }

  private getEffectiveGapForObstacleIndex(index: number): number {
    return Math.max(
      this.config.minGap,
      this.config.baseGap - index * this.config.gapDecrementPerScore
    );
  }

  private getEffectiveSpeedForObstacleIndex(index: number): number {
    return Math.min(
      this.config.maxSpeed,
      this.config.baseSpeed + index * this.config.speedIncrementPerScore
    );
  }

  /**
   * Computes a guaranteed physically reachable vertical center for the next obstacle gap
   * based on horizontal travel time, gravity, flap impulse, and configured safe bounds.
   */
  private computeNextGapCenterY(obstacleIndex: number, gapHeight: number): number {
    const halfGap = gapHeight / 2;
    const hardMin = Math.max(this.config.minGapCenterY, CEILING_Y + 34 + halfGap);
    const hardMax = Math.min(this.config.maxGapCenterY, GROUND_Y - 34 - halfGap);

    if (obstacleIndex === 0) {
      // First obstacle is comfortably reachable from BIRD_START_Y
      const minFirst = Math.max(hardMin, BIRD_START_Y - 75);
      const maxFirst = Math.min(hardMax, BIRD_START_Y + 75);
      return Math.round(this.rng.range(minFirst, maxFirst));
    }

    const speed = this.getEffectiveSpeedForObstacleIndex(obstacleIndex);
    const travelTimeSec = this.config.obstacleSpacing / speed;

    // Conservative max climb & safe descent achievable within travelTimeSec
    const avgClimbRate = Math.abs(this.config.flapVelocity) * 0.55;
    const avgFallRate = this.config.maxFallSpeed * 0.55;
    const maxClimb = avgClimbRate * travelTimeSec * this.config.maxDeltaYFactor;
    const maxDrop = avgFallRate * travelTimeSec * this.config.maxDeltaYFactor;

    const low = Math.max(hardMin, this.lastGapCenterY - maxClimb);
    const high = Math.min(hardMax, this.lastGapCenterY + maxDrop);

    if (low >= high) {
      return Math.round((hardMin + hardMax) / 2);
    }
    return Math.round(this.rng.range(low, high));
  }

  private spawnObstacle(x: number): void {
    const idx = this.nextObstacleId - 1;
    const gapHeight = Math.round(this.getEffectiveGapForObstacleIndex(idx));
    const gapCenterY = this.computeNextGapCenterY(idx, gapHeight);
    this.lastGapCenterY = gapCenterY;

    this.obstacles.push({
      id: this.nextObstacleId++,
      x,
      width: OBSTACLE_WIDTH,
      gapCenterY,
      gapHeight,
      passed: false,
    });
  }

  private seedInitialObstacles(): void {
    let x = this.config.firstObstacleX;
    for (let i = 0; i < 4; i++) {
      this.spawnObstacle(x);
      x += this.config.obstacleSpacing;
    }
  }

  /**
   * Advances simulation by exactly 1 fixed tick (1/60s).
   */
  step(flapRequested: boolean): StepResult {
    if (!this.alive) {
      return { flapped: false, scored: false, died: false, deathReason: this.deathReason };
    }

    let flapped = false;
    if (flapRequested && this.tick - this.lastFlapTick >= this.config.minFlapIntervalTicks) {
      this.birdVy = this.config.flapVelocity;
      this.lastFlapTick = this.tick;
      flapped = true;
    }

    // Apply gravity & integrate bird vertical kinematics
    this.birdVy = Math.min(this.birdVy + this.config.gravity * FIXED_DT, this.config.maxFallSpeed);
    this.birdY += this.birdVy * FIXED_DT;

    // Ceiling soft clamp
    if (this.birdY - BIRD_HITBOX_HALF_H < CEILING_Y) {
      this.birdY = CEILING_Y + BIRD_HITBOX_HALF_H;
      if (this.birdVy < 0) {
        this.birdVy = 0;
      }
    }

    // Horizontal motion
    const speed = this.currentSpeed;
    const dx = speed * FIXED_DT;
    this.scrollDistance += dx;

    let scored = false;
    for (const obs of this.obstacles) {
      obs.x -= dx;
      if (!obs.passed && obs.x + obs.width / 2 < BIRD_X) {
        obs.passed = true;
        this.score += 1;
        this.obstaclesPassed += 1;
        scored = true;
      }
    }

    // Remove off-screen obstacles and spawn new ones deterministically
    while (this.obstacles.length > 0 && this.obstacles[0]!.x + this.obstacles[0]!.width < -20) {
      this.obstacles.shift();
    }
    const lastObs = this.obstacles[this.obstacles.length - 1];
    if (!lastObs || lastObs.x < WORLD_WIDTH + this.config.obstacleSpacing) {
      const nextX = lastObs ? lastObs.x + this.config.obstacleSpacing : this.config.firstObstacleX;
      this.spawnObstacle(nextX);
    }

    // Collision check: Ground
    if (this.birdY + BIRD_HITBOX_HALF_H >= GROUND_Y) {
      this.birdY = GROUND_Y - BIRD_HITBOX_HALF_H;
      this.alive = false;
      this.deathReason = "GROUND";
      this.deathTick = this.tick;
      this.tick += 1;
      return { flapped, scored, died: true, deathReason: "GROUND" };
    }

    // Collision check: Obstacles (AABB vs forgiving inner hitbox)
    const birdLeft = BIRD_X - BIRD_HITBOX_HALF_W;
    const birdRight = BIRD_X + BIRD_HITBOX_HALF_W;
    const birdTop = this.birdY - BIRD_HITBOX_HALF_H;
    const birdBottom = this.birdY + BIRD_HITBOX_HALF_H;

    for (const obs of this.obstacles) {
      const obsLeft = obs.x;
      const obsRight = obs.x + obs.width;
      if (birdRight > obsLeft && birdLeft < obsRight) {
        const gapTop = obs.gapCenterY - obs.gapHeight / 2;
        const gapBottom = obs.gapCenterY + obs.gapHeight / 2;
        if (birdTop < gapTop || birdBottom > gapBottom) {
          this.alive = false;
          this.deathReason = "OBSTACLE";
          this.deathTick = this.tick;
          this.tick += 1;
          return { flapped, scored, died: true, deathReason: "OBSTACLE" };
        }
      }
    }

    this.tick += 1;
    return { flapped, scored, died: false, deathReason: "NONE" };
  }

  getState(): SimulationState {
    // Visual rotation derived purely from vertical velocity (-26 deg upward tilt -> +78 deg nose-dive)
    const normalizedVy = Math.max(-1, Math.min(1, this.birdVy / this.config.maxFallSpeed));
    const birdAngle = normalizedVy < 0 ? normalizedVy * 28 : normalizedVy * 78;

    return {
      tick: this.tick,
      birdX: BIRD_X,
      birdY: this.birdY,
      birdVy: this.birdVy,
      birdAngle,
      alive: this.alive,
      deathReason: this.deathReason,
      deathTick: this.deathTick,
      score: this.score,
      obstaclesPassed: this.obstaclesPassed,
      currentSpeed: this.currentSpeed,
      currentGap: this.currentGap,
      scrollDistance: this.scrollDistance,
      lastFlapTick: this.lastFlapTick,
      obstacles: this.obstacles,
    };
  }
}

export interface ReplayVerificationInput {
  seed: string;
  physicsConfig: ModePhysicsConfig;
  antiCheatConfig: AntiCheatConfig;
  flapTicks: number[];
  totalTicks: number;
  clientClaimedScore?: number;
  wallClockElapsedMs: number;
  pauseDurationMs?: number;
}

export interface ReplayVerificationResult {
  valid: boolean;
  rejectReason?: string;
  verifiedScore: number;
  obstaclesPassed: number;
  totalTicks: number;
  durationMs: number;
  flapCount: number;
  deathReason: DeathReason;
  flagged: boolean;
  flagReasons: string[];
}

export function verifyReplay(input: ReplayVerificationInput): ReplayVerificationResult {
  const { seed, physicsConfig, antiCheatConfig, flapTicks, totalTicks, wallClockElapsedMs } = input;
  const flagReasons: string[] = [];

  if (!Number.isInteger(totalTicks) || totalTicks < 0 || totalTicks > antiCheatConfig.maxSessionTicks) {
    return {
      valid: false,
      rejectReason: "INVALID_TOTAL_TICKS",
      verifiedScore: 0,
      obstaclesPassed: 0,
      totalTicks: 0,
      durationMs: 0,
      flapCount: 0,
      deathReason: "NONE",
      flagged: true,
      flagReasons: ["INVALID_TOTAL_TICKS"],
    };
  }

  if (flapTicks.length > antiCheatConfig.maxReplayFlaps) {
    return {
      valid: false,
      rejectReason: "REPLAY_PAYLOAD_TOO_LARGE",
      verifiedScore: 0,
      obstaclesPassed: 0,
      totalTicks: 0,
      durationMs: 0,
      flapCount: flapTicks.length,
      deathReason: "NONE",
      flagged: true,
      flagReasons: ["REPLAY_PAYLOAD_TOO_LARGE"],
    };
  }

  // Validate flap ticks are strictly increasing non-negative integers within range
  let prev = -1;
  const intervals: number[] = [];
  for (const t of flapTicks) {
    if (!Number.isInteger(t) || t < 0 || t > totalTicks || t <= prev) {
      return {
        valid: false,
        rejectReason: "INVALID_FLAP_TICK_SEQUENCE",
        verifiedScore: 0,
        obstaclesPassed: 0,
        totalTicks: 0,
        durationMs: 0,
        flapCount: flapTicks.length,
        deathReason: "NONE",
        flagged: true,
        flagReasons: ["INVALID_FLAP_TICK_SEQUENCE"],
      };
    }
    if (prev >= 0) {
      const diff = t - prev;
      if (diff < physicsConfig.minFlapIntervalTicks) {
        flagReasons.push("SUB_COOLDOWN_FLAP_SPAM");
      }
      intervals.push(diff);
    }
    prev = t;
  }

  // Re-simulate deterministically on the server
  const sim = new GameSimulation(seed, physicsConfig);
  let flapIdx = 0;
  let actualTicks = 0;
  let acceptedFlaps = 0;

  // Run up to totalTicks + safety buffer (if client stopped slightly early or on death tick)
  const maxStepLimit = Math.min(antiCheatConfig.maxSessionTicks, totalTicks + 120);
  for (let tick = 0; tick < maxStepLimit; tick++) {
    let wantFlap = false;
    while (flapIdx < flapTicks.length && flapTicks[flapIdx]! < tick) {
      flapIdx++;
    }
    if (flapIdx < flapTicks.length && flapTicks[flapIdx] === tick) {
      wantFlap = true;
      flapIdx++;
    }

    const res = sim.step(wantFlap);
    if (res.flapped) acceptedFlaps++;
    actualTicks = tick + 1;

    if (res.died) {
      break;
    }
    if (tick + 1 >= totalTicks && flapIdx >= flapTicks.length) {
      // Allow simulation to fall naturally only if client ended mid-air without death;
      // Do NOT accept an unfinished live session as a higher score — stop at totalTicks.
      break;
    }
  }

  const finalState = sim.getState();
  const simDurationMs = Math.round((actualTicks / FIXED_TPS) * 1000);

  // Check wall-clock speedup tampering (simulated duration cannot greatly exceed actual wall time)
  const maxAllowedSimMs =
    wallClockElapsedMs / antiCheatConfig.minWallClockFactor + antiCheatConfig.wallClockToleranceSec * 1000;
  if (simDurationMs > maxAllowedSimMs && simDurationMs > 3000) {
    return {
      valid: false,
      rejectReason: "SPEEDHACK_TIME_DILATION",
      verifiedScore: 0,
      obstaclesPassed: 0,
      totalTicks: actualTicks,
      durationMs: simDurationMs,
      flapCount: acceptedFlaps,
      deathReason: finalState.deathReason,
      flagged: true,
      flagReasons: ["SPEEDHACK_TIME_DILATION"],
    };
  }

  // Check client-claimed score mismatch
  if (
    typeof input.clientClaimedScore === "number" &&
    Math.abs(input.clientClaimedScore - finalState.score) > 1
  ) {
    flagReasons.push(`SCORE_MISMATCH_CLAIMED_${input.clientClaimedScore}_VERIFIED_${finalState.score}`);
  }

  // Heuristic robotic/macro cadence detection (flags for moderator review without falsely rejecting legit runs)
  if (intervals.length >= antiCheatConfig.roboticMinFlapsCheck && finalState.score >= 20) {
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev < antiCheatConfig.roboticIntervalStdDevThreshold) {
      flagReasons.push(`ROBOTIC_INPUT_CADENCE_STDDEV_${stdDev.toFixed(3)}`);
    }
  }

  return {
    valid: true,
    verifiedScore: finalState.score,
    obstaclesPassed: finalState.obstaclesPassed,
    totalTicks: actualTicks,
    durationMs: simDurationMs,
    flapCount: acceptedFlaps,
    deathReason: finalState.deathReason,
    flagged: flagReasons.length > 0,
    flagReasons,
  };
}

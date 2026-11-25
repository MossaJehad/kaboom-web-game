import { describe, expect, it } from "vitest";
import {
  DEFAULT_ANTICHEAT_CONFIG,
  DEFAULT_MODE_CONFIGS,
  GROUND_Y,
  CEILING_Y,
} from "@skyhop/shared";
import { GameSimulation, verifyReplay } from "../src/simulation.js";

/**
 * Helper autopilot that navigates obstacles cleanly using pure simulation state
 * (used strictly in unit tests to verify obstacle reachability & replay determinism).
 */
function runAutopilot(seed: string, mode: keyof typeof DEFAULT_MODE_CONFIGS, targetScore: number) {
  const config = DEFAULT_MODE_CONFIGS[mode];
  const sim = new GameSimulation(seed, config);
  const flapTicks: number[] = [];

  for (let tick = 0; tick < 60 * 120; tick++) {
    const st = sim.getState();
    if (!st.alive) break;
    if (st.score >= targetScore) {
      // Let bird crash cleanly into ground to finish run
      sim.step(false);
      continue;
    }

    const upcoming = st.obstacles.find((o) => o.x + o.width > st.birdX - 14);
    const desiredY = upcoming ? upcoming.gapCenterY + upcoming.gapHeight * 0.18 : 280;
    const flapApex = (config.flapVelocity * config.flapVelocity) / (2 * config.gravity);
    const insideOrNear = upcoming ? upcoming.x < st.birdX + 36 : false;
    const safeTop = upcoming && insideOrNear ? upcoming.gapCenterY - upcoming.gapHeight / 2 + 13 : 36;
    const shouldFlap = st.birdY > desiredY && st.birdY - flapApex > safeTop;
    const res = sim.step(shouldFlap);
    if (res.flapped) flapTicks.push(tick);
  }

  return { state: sim.getState(), flapTicks };
}

describe("GameSimulation physics, obstacles, and replay verification", () => {
  it("applies gravity and terminates when hitting the ground without flaps", () => {
    const sim = new GameSimulation("gravity-seed", DEFAULT_MODE_CONFIGS.classic);
    const startY = sim.getState().birdY;
    let died = false;
    for (let i = 0; i < 300; i++) {
      const res = sim.step(false);
      if (res.died) {
        died = true;
        expect(res.deathReason).toBe("GROUND");
        break;
      }
    }
    expect(died).toBe(true);
    expect(sim.getState().birdY).toBeGreaterThan(startY);
    expect(sim.getState().alive).toBe(false);
  });

  it("flaps upward and enforces minimum flap cooldown", () => {
    const sim = new GameSimulation("flap-seed", DEFAULT_MODE_CONFIGS.classic);
    const r0 = sim.step(true);
    expect(r0.flapped).toBe(true);
    expect(sim.getState().birdVy).toBeLessThan(0);

    // Next tick is within cooldown
    const r1 = sim.step(true);
    expect(r1.flapped).toBe(false);
  });

  it("produces 100% identical deterministic states for the same seed and inputs", () => {
    const run = runAutopilot("deterministic-seed-42", "classic", 12);
    expect(run.state.score).toBeGreaterThanOrEqual(12);

    const replay = verifyReplay({
      seed: "deterministic-seed-42",
      physicsConfig: DEFAULT_MODE_CONFIGS.classic,
      antiCheatConfig: DEFAULT_ANTICHEAT_CONFIG,
      flapTicks: run.flapTicks,
      totalTicks: run.state.tick,
      clientClaimedScore: run.state.score,
      wallClockElapsedMs: (run.state.tick / 60) * 1000 + 500,
    });

    expect(replay.valid).toBe(true);
    expect(replay.verifiedScore).toBe(run.state.score);
    expect(replay.obstaclesPassed).toBe(run.state.obstaclesPassed);
    expect(replay.deathReason).toBe(run.state.deathReason);
  });

  it("generates physically achievable obstacles across all modes and long runs", () => {
    for (const mode of ["classic", "hardcore", "zen", "daily_challenge"] as const) {
      const { state } = runAutopilot(`reachability-${mode}-seed`, mode, 25);
      expect(state.score).toBeGreaterThanOrEqual(25);
      for (const obs of state.obstacles) {
        expect(obs.gapCenterY - obs.gapHeight / 2).toBeGreaterThan(CEILING_Y);
        expect(obs.gapCenterY + obs.gapHeight / 2).toBeLessThan(GROUND_Y);
      }
    }
  });

  it("scales difficulty progressively while respecting configured minGap and maxSpeed limits", () => {
    const cfg = DEFAULT_MODE_CONFIGS.classic;
    const { state } = runAutopilot("difficulty-curve-seed", "classic", 80);
    expect(state.score).toBeGreaterThanOrEqual(80);
    expect(state.currentSpeed).toBeLessThanOrEqual(cfg.maxSpeed);
    expect(state.currentSpeed).toBeGreaterThan(cfg.baseSpeed);
    expect(state.currentGap).toBeGreaterThanOrEqual(cfg.minGap);
    expect(state.currentGap).toBeLessThan(cfg.baseGap);
  });

  it("rejects tampered replays, speedhacks, unsorted flap ticks, and flags score mismatches", () => {
    const run = runAutopilot("tamper-test", "classic", 8);

    // 1. Speedhack: claiming 20 seconds of gameplay happened in 500ms wall-clock
    const speedhack = verifyReplay({
      seed: "tamper-test",
      physicsConfig: DEFAULT_MODE_CONFIGS.classic,
      antiCheatConfig: DEFAULT_ANTICHEAT_CONFIG,
      flapTicks: run.flapTicks,
      totalTicks: run.state.tick,
      wallClockElapsedMs: 500,
    });
    expect(speedhack.valid).toBe(false);
    expect(speedhack.rejectReason).toBe("SPEEDHACK_TIME_DILATION");

    // 2. Unsorted / duplicate flap ticks rejected
    const badTicks = verifyReplay({
      seed: "tamper-test",
      physicsConfig: DEFAULT_MODE_CONFIGS.classic,
      antiCheatConfig: DEFAULT_ANTICHEAT_CONFIG,
      flapTicks: [10, 10, 25],
      totalTicks: 100,
      wallClockElapsedMs: 5000,
    });
    expect(badTicks.valid).toBe(false);
    expect(badTicks.rejectReason).toBe("INVALID_FLAP_TICK_SEQUENCE");

    // 3. Client-claimed inflated score is ignored & flagged, server uses verified score
    const inflated = verifyReplay({
      seed: "tamper-test",
      physicsConfig: DEFAULT_MODE_CONFIGS.classic,
      antiCheatConfig: DEFAULT_ANTICHEAT_CONFIG,
      flapTicks: run.flapTicks,
      totalTicks: run.state.tick,
      clientClaimedScore: 9999,
      wallClockElapsedMs: (run.state.tick / 60) * 1000 + 500,
    });
    expect(inflated.valid).toBe(true);
    expect(inflated.verifiedScore).toBe(run.state.score);
    expect(inflated.flagged).toBe(true);
    expect(inflated.flagReasons.some((r) => r.startsWith("SCORE_MISMATCH"))).toBe(true);
  });
});

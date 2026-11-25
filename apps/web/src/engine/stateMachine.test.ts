import { describe, expect, it } from "vitest";
import { GameStateMachine } from "./stateMachine.js";

describe("GameStateMachine", () => {
  it("enforces valid transitions across the full 9-state arcade lifecycle", () => {
    const history: string[] = [];
    const fsm = new GameStateMachine("LOADING", (next) => history.push(next));

    expect(fsm.state).toBe("LOADING");
    // Cannot jump straight from LOADING to PLAYING
    expect(fsm.transition("PLAYING")).toBe(false);

    expect(fsm.transition("READY")).toBe(true);
    expect(fsm.transition("COUNTDOWN")).toBe(true);
    expect(fsm.transition("PLAYING")).toBe(true);
    expect(fsm.transition("PAUSED")).toBe(true);
    expect(fsm.transition("PLAYING")).toBe(true);
    expect(fsm.transition("GAME_OVER")).toBe(true);
    // Cannot pause after GAME_OVER
    expect(fsm.transition("PAUSED")).toBe(false);
    expect(fsm.transition("RESULTS")).toBe(true);
    expect(fsm.transition("RESTARTING")).toBe(true);
    expect(fsm.transition("READY")).toBe(true);

    expect(history).toEqual([
      "READY",
      "COUNTDOWN",
      "PLAYING",
      "PAUSED",
      "PLAYING",
      "GAME_OVER",
      "RESULTS",
      "RESTARTING",
      "READY",
    ]);
  });
});

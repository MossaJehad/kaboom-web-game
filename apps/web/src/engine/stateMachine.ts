import type { GameState } from "@skyhop/shared";

const VALID_TRANSITIONS: Record<GameState, readonly GameState[]> = {
  LOADING: ["MAIN_MENU", "READY"],
  MAIN_MENU: ["READY", "LOADING"],
  READY: ["COUNTDOWN", "PLAYING", "MAIN_MENU", "RESTARTING"],
  COUNTDOWN: ["PLAYING", "PAUSED", "RESTARTING", "MAIN_MENU"],
  PLAYING: ["PAUSED", "GAME_OVER", "RESTARTING", "MAIN_MENU"],
  PAUSED: ["PLAYING", "RESTARTING", "MAIN_MENU"],
  GAME_OVER: ["RESULTS", "RESTARTING", "MAIN_MENU"],
  RESULTS: ["RESTARTING", "READY", "MAIN_MENU"],
  RESTARTING: ["READY", "COUNTDOWN", "MAIN_MENU"],
};

export class GameStateMachine {
  private current: GameState = "LOADING";
  private listener?: (next: GameState, prev: GameState) => void;

  constructor(initial: GameState = "LOADING", listener?: (next: GameState, prev: GameState) => void) {
    this.current = initial;
    this.listener = listener;
  }

  get state(): GameState {
    return this.current;
  }

  canTransition(next: GameState): boolean {
    if (next === this.current) return false;
    return VALID_TRANSITIONS[this.current].includes(next);
  }

  transition(next: GameState): boolean {
    if (!this.canTransition(next)) {
      return false;
    }
    const prev = this.current;
    this.current = next;
    this.listener?.(next, prev);
    return true;
  }

  forceState(next: GameState): void {
    const prev = this.current;
    if (prev === next) return;
    this.current = next;
    this.listener?.(next, prev);
  }
}

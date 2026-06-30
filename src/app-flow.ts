import { CAMPAIGN_MAPS } from "./game/maps";
import type { MatchOutcome } from "./game/types";

export type AppMode = "title" | "playing" | "paused" | "won" | "lost" | "complete";

export interface FlowState {
  mode: AppMode;
  mapIndex: number;
  runId: number;
}

export const INITIAL_FLOW_STATE: FlowState = {
  mode: "title",
  mapIndex: 0,
  runId: 0,
};

export function startMap(state: FlowState, mapIndex: number): FlowState {
  return {
    mode: "playing",
    mapIndex,
    runId: state.runId + 1,
  };
}

export function applyPrimaryAction(state: FlowState): FlowState {
  if (state.mode === "title") {
    return startMap(state, state.mapIndex);
  }

  if (state.mode === "paused") {
    return { ...state, mode: "playing" };
  }

  if (state.mode === "lost") {
    return startMap(state, state.mapIndex);
  }

  if (state.mode === "complete") {
    return startMap(state, 0);
  }

  if (state.mode === "won") {
    const nextIndex = state.mapIndex + 1;

    if (nextIndex >= CAMPAIGN_MAPS.length) {
      return { ...state, mode: "complete" };
    }

    return startMap(state, nextIndex);
  }

  return state;
}

export function applyBackAction(state: FlowState): FlowState {
  if (state.mode === "playing") {
    return { ...state, mode: "paused" };
  }

  if (state.mode === "paused") {
    return { ...state, mode: "playing" };
  }

  return state;
}

export function applyMapOutcome(state: FlowState, outcome: Exclude<MatchOutcome, "playing">): FlowState {
  return {
    ...state,
    mode: outcome,
  };
}

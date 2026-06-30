import { describe, expect, it } from "vitest";
import { applyBackAction, applyMapOutcome, applyPrimaryAction, startMap } from "../src/app-flow";
import { CAMPAIGN_MAPS } from "../src/game/maps";

describe("single-player campaign flow", () => {
  it("starts on Map 1 from the title screen", () => {
    const next = applyPrimaryAction({ mode: "title", mapIndex: 0, runId: 0 });

    expect(next).toEqual({ mode: "playing", mapIndex: 0, runId: 1 });
  });

  it("advances linearly after wins and completes after the final campaign map", () => {
    let state = { mode: "playing" as const, mapIndex: 0, runId: 1 };

    for (let index = 1; index < CAMPAIGN_MAPS.length; index += 1) {
      state = applyPrimaryAction(applyMapOutcome(state, "won")) as typeof state;
      expect(state).toEqual({ mode: "playing", mapIndex: index, runId: index + 1 });
    }

    expect(applyPrimaryAction(applyMapOutcome(state, "won"))).toEqual({
      mode: "complete",
      mapIndex: CAMPAIGN_MAPS.length - 1,
      runId: CAMPAIGN_MAPS.length,
    });
  });

  it("restarts the current map after a loss", () => {
    const lost = applyMapOutcome({ mode: "playing", mapIndex: 1, runId: 4 }, "lost");

    expect(applyPrimaryAction(lost)).toEqual({ mode: "playing", mapIndex: 1, runId: 5 });
  });

  it("toggles pause with the back action", () => {
    const paused = applyBackAction(startMap({ mode: "title", mapIndex: 0, runId: 0 }, 0));

    expect(paused.mode).toBe("paused");
    expect(applyBackAction(paused).mode).toBe("playing");
  });
});

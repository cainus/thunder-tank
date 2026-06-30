import { describe, expect, it } from "vitest";
import { applyBackAction, applyMapOutcome, applyPrimaryAction, startMap } from "../src/app-flow";

describe("single-player campaign flow", () => {
  it("starts on Map 1 from the title screen", () => {
    const next = applyPrimaryAction({ mode: "title", mapIndex: 0, runId: 0 });

    expect(next).toEqual({ mode: "playing", mapIndex: 0, runId: 1 });
  });

  it("advances linearly after wins and completes after Map 3", () => {
    const map1Won = applyMapOutcome({ mode: "playing", mapIndex: 0, runId: 1 }, "won");
    const map2 = applyPrimaryAction(map1Won);
    const map2Won = applyMapOutcome(map2, "won");
    const map3 = applyPrimaryAction(map2Won);
    const map3Won = applyMapOutcome(map3, "won");

    expect(map2).toEqual({ mode: "playing", mapIndex: 1, runId: 2 });
    expect(map3).toEqual({ mode: "playing", mapIndex: 2, runId: 3 });
    expect(applyPrimaryAction(map3Won)).toEqual({ mode: "complete", mapIndex: 2, runId: 3 });
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

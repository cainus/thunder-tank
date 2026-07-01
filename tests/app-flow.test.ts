import { describe, expect, it } from "vitest";
import { applyBackAction, applyMapOutcome, applyPrimaryAction, startMap } from "../src/app-flow";
import { CAMPAIGN_MAPS } from "../src/game/maps";

describe("single-player campaign flow", () => {
  it("starts on Map 1 from the title screen", () => {
    const next = applyPrimaryAction({ mode: "title", matchMode: "campaign", mapIndex: 0, runId: 0 });

    expect(next).toEqual({ mode: "playing", matchMode: "campaign", mapIndex: 0, runId: 1 });
  });

  it("advances linearly after wins and completes after the final campaign map", () => {
    let state = { mode: "playing" as const, matchMode: "campaign" as const, mapIndex: 0, runId: 1 };

    for (let index = 1; index < CAMPAIGN_MAPS.length; index += 1) {
      state = applyPrimaryAction(applyMapOutcome(state, "won")) as typeof state;
      expect(state).toEqual({ mode: "playing", matchMode: "campaign", mapIndex: index, runId: index + 1 });
    }

    expect(applyPrimaryAction(applyMapOutcome(state, "won"))).toEqual({
      mode: "complete",
      matchMode: "campaign",
      mapIndex: CAMPAIGN_MAPS.length - 1,
      runId: CAMPAIGN_MAPS.length,
    });
  });

  it("restarts the current map after a loss", () => {
    const lost = applyMapOutcome({ mode: "playing", matchMode: "campaign", mapIndex: 1, runId: 4 }, "lost");

    expect(applyPrimaryAction(lost)).toEqual({ mode: "playing", matchMode: "campaign", mapIndex: 1, runId: 5 });
  });

  it("toggles pause with the back action", () => {
    const paused = applyBackAction(startMap({ mode: "title", matchMode: "campaign", mapIndex: 0, runId: 0 }, 0));

    expect(paused.mode).toBe("paused");
    expect(applyBackAction(paused).mode).toBe("playing");
  });
});

describe("two-player deathmatch flow", () => {
  it("starts and rematches on the same map", () => {
    const deathmatch = startMap({ mode: "title", matchMode: "campaign", mapIndex: 0, runId: 0 }, 0, "deathmatch");

    expect(deathmatch).toEqual({ mode: "playing", matchMode: "deathmatch", mapIndex: 0, runId: 1 });
    expect(applyPrimaryAction(applyMapOutcome(deathmatch, "won"))).toEqual({
      mode: "playing",
      matchMode: "deathmatch",
      mapIndex: 0,
      runId: 2,
    });
    expect(applyPrimaryAction(applyMapOutcome(deathmatch, "lost"))).toEqual({
      mode: "playing",
      matchMode: "deathmatch",
      mapIndex: 0,
      runId: 2,
    });
  });
});

describe("co-op campaign flow", () => {
  it("starts as co-op and advances through campaign maps", () => {
    const coOp = startMap({ mode: "title", matchMode: "campaign", mapIndex: 0, runId: 0 }, 0, "coOp");

    expect(coOp).toEqual({ mode: "playing", matchMode: "coOp", mapIndex: 0, runId: 1 });
    expect(applyPrimaryAction(applyMapOutcome(coOp, "won"))).toEqual({
      mode: "playing",
      matchMode: "coOp",
      mapIndex: 1,
      runId: 2,
    });
    expect(applyPrimaryAction(applyMapOutcome({ ...coOp, mode: "playing", mapIndex: 2, runId: 7 }, "lost"))).toEqual({
      mode: "playing",
      matchMode: "coOp",
      mapIndex: 2,
      runId: 8,
    });
  });

  it("restarts as co-op after completing the final map", () => {
    const complete = applyPrimaryAction(
      applyMapOutcome(
        {
          mode: "playing",
          matchMode: "coOp",
          mapIndex: CAMPAIGN_MAPS.length - 1,
          runId: 20,
        },
        "won",
      ),
    );

    expect(complete).toEqual({
      mode: "complete",
      matchMode: "coOp",
      mapIndex: CAMPAIGN_MAPS.length - 1,
      runId: 20,
    });
    expect(applyPrimaryAction(complete)).toEqual({ mode: "playing", matchMode: "coOp", mapIndex: 0, runId: 21 });
  });
});

import { describe, expect, it } from "vitest";
import { TEAM_STRIPE_COLORS, teamStripeColor } from "../src/game/team-stripe";
import type { TankSide } from "../src/game/types";

// Every tank now renders with a neutral grey hull, so the only visual cue that
// distinguishes P1, P2, and enemies is the team stripe color. These tests lock
// in that mapping so a regression can't silently make players indistinguishable.
describe("team stripe color mapping", () => {
  it("maps player (P1) to blue", () => {
    expect(teamStripeColor("player")).toBe(0x4e89d8);
  });

  it("maps playerTwo (P2) to green", () => {
    expect(teamStripeColor("playerTwo")).toBe(0x53c66b);
  });

  it("maps enemy to red", () => {
    expect(teamStripeColor("enemy")).toBe(0xff533f);
  });

  it("assigns every tank side a defined, distinct stripe color", () => {
    const sides: TankSide[] = ["player", "playerTwo", "enemy"];
    const colors = sides.map((side) => teamStripeColor(side));

    // Each side must produce a color (no undefined -> missing stripe).
    for (const color of colors) {
      expect(typeof color).toBe("number");
    }

    // No two sides may share a color, otherwise teams read as the same.
    expect(new Set(colors).size).toBe(sides.length);
  });

  it("keeps TEAM_STRIPE_COLORS in sync with the accessor", () => {
    for (const side of Object.keys(TEAM_STRIPE_COLORS) as TankSide[]) {
      expect(teamStripeColor(side)).toBe(TEAM_STRIPE_COLORS[side]);
    }
  });
});

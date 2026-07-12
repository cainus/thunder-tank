import type { TankSide } from "./types";

// Tank hulls are all rendered grey; a pair of team-colored stripes running along
// the hull identifies each tank's team so P1, P2, and enemies stay readable.
// blue = P1 (player), green = P2 (playerTwo), red = enemy.
export const TEAM_STRIPE_LENGTH = 42;
export const TEAM_STRIPE_THICKNESS = 6;
export const TEAM_STRIPE_OFFSET = 16;
export const TEAM_STRIPE_ALPHA = 0.95;

export const TEAM_STRIPE_COLORS: Record<TankSide, number> = {
  player: 0x4e89d8,
  playerTwo: 0x53c66b,
  enemy: 0xff533f,
};

export function teamStripeColor(side: TankSide): number {
  return TEAM_STRIPE_COLORS[side];
}

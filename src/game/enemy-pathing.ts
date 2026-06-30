import type { Vec2 } from "./types";

export const ENEMY_PATH_LOOKAHEAD = 300;
export const ENEMY_PATH_PADDING = 72;
export const ENEMY_FIRE_LINE_PADDING = 18;
export const ENEMY_FIRE_RANGE = 900;
export const ENEMY_MOVE_DECISION_MS = 350;

const CANDIDATE_OFFSETS = [
  Math.PI / 4,
  -Math.PI / 4,
  Math.PI / 2,
  -Math.PI / 2,
  (Math.PI * 3) / 4,
  (-Math.PI * 3) / 4,
  Math.PI,
];

const PATH_STICKINESS_SCORE = 260;

export interface EnemyMoveAngleInput {
  enemyPosition: Vec2;
  playerPosition: Vec2;
  desiredAngle: number;
  distanceToPlayer: number;
  previousMoveAngle?: number;
  isSegmentBlocked: (start: Vec2, end: Vec2, padding: number) => boolean;
  getObstacleClearance: (point: Vec2) => number;
  isPointInsideWorld: (point: Vec2) => boolean;
}

export function selectEnemyMoveAngle(input: EnemyMoveAngleInput): number {
  const shouldAdvance = input.distanceToPlayer > 360;
  const directAngle = shouldAdvance ? input.desiredAngle : input.desiredAngle + Math.PI * 0.7;
  const directPathBlocked = input.isSegmentBlocked(input.enemyPosition, input.playerPosition, ENEMY_PATH_PADDING);

  const scoredCandidates = [
    scoreAngle(input, directAngle, { pathBlocked: directPathBlocked, angleCostBasis: directAngle }),
    ...CANDIDATE_OFFSETS.map((offset) => scoreAngle(input, input.desiredAngle + offset)),
  ].filter((candidate): candidate is ScoredAngle => candidate !== undefined);

  if (!directPathBlocked) {
    return directAngle;
  }

  const bestCandidate = scoredCandidates.reduce<ScoredAngle | undefined>(
    (best, candidate) => (best === undefined || candidate.score > best.score ? candidate : best),
    undefined,
  );

  if (bestCandidate === undefined) {
    return directAngle;
  }

  const previousCandidate =
    input.previousMoveAngle === undefined ? undefined : scoreAngle(input, input.previousMoveAngle);

  if (previousCandidate && previousCandidate.score >= bestCandidate.score - PATH_STICKINESS_SCORE) {
    return previousCandidate.angle;
  }

  return bestCandidate.angle;
}

export function shouldReuseEnemyMoveAngle(moveAngle: number | undefined, nextDecisionAt: number, now: number): moveAngle is number {
  return moveAngle !== undefined && now < nextDecisionAt;
}

interface ScoredAngle {
  angle: number;
  score: number;
}

function scoreAngle(
  input: EnemyMoveAngleInput,
  angle: number,
  options: { pathBlocked?: boolean; angleCostBasis?: number } = {},
): ScoredAngle | undefined {
  const candidate = {
    x: input.enemyPosition.x + Math.cos(angle) * ENEMY_PATH_LOOKAHEAD,
    y: input.enemyPosition.y + Math.sin(angle) * ENEMY_PATH_LOOKAHEAD,
  };

  if (!input.isPointInsideWorld(candidate)) {
    return undefined;
  }

  const blocked = options.pathBlocked ?? input.isSegmentBlocked(input.enemyPosition, candidate, ENEMY_PATH_PADDING);
  const distanceAfterMove = distanceBetween(candidate, input.playerPosition);
  const progress = input.distanceToPlayer - distanceAfterMove;
  const clearance = input.getObstacleClearance(candidate);
  const angleCostBasis = options.angleCostBasis ?? input.desiredAngle;
  const angleCost = Math.abs(shortestAngleBetween(angleCostBasis, angle)) * 45;
  const score = progress + clearance * 0.35 - angleCost + (blocked ? -700 : 350);

  return { angle, score };
}

function distanceBetween(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function shortestAngleBetween(a: number, b: number): number {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

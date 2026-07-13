// Pure geometry helpers for the 3D tank overlay. Kept free of Phaser and
// three.js (mirroring urban-decor.ts) so the rotation/scale math that keeps the
// 3D tank and turret models registered with the flat 2D gameplay can be
// unit-tested without a rendering engine. The overlay itself lives in tank-3d.ts
// and reuses the tree camera math from urban-decor so both 3D overlays share the
// exact same ground-plane registration with the Phaser camera.
import type { EnemyArchetype } from "./types";

// World-units-per-model-unit applied to the loaded tank models. The hull model
// is authored ~1.8 units long, so this makes a standard tank read at roughly the
// same on-screen size (~83px) as the flat sprite it replaces.
export const TANK_WORLD_SCALE = 46;

/**
 * Per-archetype size multiplier for the 3D tank models. Mirrors the flat-sprite
 * hull scale in CampaignScene so heavier archetypes still read larger and the
 * co-op blue teammate stays slightly smaller, keeping size cues identical
 * whether the tanks render as sprites or 3D models.
 */
export function tankArchetypeScale(archetype: EnemyArchetype | undefined, isBlueTeammate: boolean): number {
  if (isBlueTeammate) {
    return 0.92;
  }
  if (archetype === "boss") {
    return 1.45;
  }
  if (archetype === "heavy") {
    return 1.1;
  }
  return 1;
}

/** Final uniform world scale for a tank model, combining base and archetype. */
export function tankModelScale(archetype: EnemyArchetype | undefined, isBlueTeammate: boolean): number {
  return TANK_WORLD_SCALE * tankArchetypeScale(archetype, isBlueTeammate);
}

/**
 * Converts a Phaser hull rotation into the yaw (rotation about the world up/Y
 * axis) for the 3D hull model. The tank models are authored facing -Z, which the
 * overlay camera maps to screen-up (-Y), matching a Phaser hull whose forward is
 * its local -Y at rotation 0. Because the overlay camera flips world Z onto the
 * downward screen Y, a clockwise Phaser rotation becomes a negative three.js yaw.
 */
export function hullYaw(rotation: number): number {
  return -rotation;
}

/**
 * Yaw for the 3D turret model from a tank's aim angle. The flat turret sprite is
 * drawn at `aimAngle + PI/2` (sprite forward is -Y), so the 3D turret — authored
 * facing -Z like the hull — uses the negated equivalent to point its barrel the
 * same way in world space.
 */
export function turretYaw(aimAngle: number): number {
  return -(aimAngle + Math.PI / 2);
}

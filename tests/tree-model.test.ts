// Regression guard for the "trees have no trunks" defect. The 3D tree overlay
// loads public/assets/models/tree.obj into three.js, whose materials default to
// Material.side === FrontSide (back-face culling on). If a trunk side face is
// wound so its normal points inward (toward the trunk axis), that face becomes a
// back-face and is culled — the trunk disappears and each tree renders as a
// canopy-only blob. This test parses the committed model and asserts every trunk
// face points outward, so a regenerated model with reversed winding fails loudly
// here instead of silently shipping trunk-less trees.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type Vec3 = [number, number, number];

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Parses the .obj into vertices plus the faces belonging to each `usemtl` group. */
function parseObj(source: string): { vertices: Vec3[]; facesByGroup: Map<string, number[][]> } {
  const vertices: Vec3[] = [];
  const facesByGroup = new Map<string, number[][]>();
  let group = "";

  for (const line of source.split("\n")) {
    if (line.startsWith("v ")) {
      const [x, y, z] = line.slice(2).trim().split(/\s+/).map(Number);
      vertices.push([x, y, z]);
    } else if (line.startsWith("usemtl ")) {
      group = line.slice(7).trim();
    } else if (line.startsWith("f ")) {
      const face = line
        .slice(2)
        .trim()
        .split(/\s+/)
        // .obj indices are 1-based and may carry /vt/vn suffixes.
        .map((token) => parseInt(token.split("/")[0], 10) - 1);
      const bucket = facesByGroup.get(group) ?? [];
      bucket.push(face);
      facesByGroup.set(group, bucket);
    }
  }

  return { vertices, facesByGroup };
}

describe("tree model trunk winding", () => {
  const objPath = resolve(process.cwd(), "public/assets/models/tree.obj");
  const { vertices, facesByGroup } = parseObj(readFileSync(objPath, "utf8"));
  const trunkFaces = facesByGroup.get("trunk") ?? [];

  it("has trunk geometry to draw", () => {
    expect(trunkFaces.length).toBeGreaterThan(0);
  });

  it("winds every trunk side face outward so three.js does not cull it", () => {
    for (const [i, j, k] of trunkFaces) {
      const a = vertices[i];
      const b = vertices[j];
      const c = vertices[k];
      // Skip any degenerate cap triangle on the trunk axis (none today).
      const centroidRadial: Vec3 = [(a[0] + b[0] + c[0]) / 3, 0, (a[2] + b[2] + c[2]) / 3];
      if (Math.hypot(centroidRadial[0], centroidRadial[2]) < 1e-6) {
        continue;
      }

      const normal = cross(sub(b, a), sub(c, a));
      // A front-facing side face has a normal pointing away from the trunk axis:
      // positive dot with the outward radial direction at the face centre.
      expect(dot(normal, centroidRadial)).toBeGreaterThan(0);
    }
  });
});

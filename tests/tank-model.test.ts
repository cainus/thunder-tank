// Guards the tank models shipped for the 3D overlay. Both .obj files are loaded
// at runtime by tank-3d.ts (via OBJLoader) and reference their sibling .mtl
// through an `mtllib` directive, so the files must exist, sit side by side, and
// stay internally consistent. In particular the turret's gun barrel carries its
// OWN "barrel" material (split from the "turret" material in TT-25) so the
// renderer can tint just the gun to show its readiness — this fails fast if a
// regenerated model drops or renames that group.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const modelsDir = resolve(process.cwd(), "public/assets/models");

function readModel(name: string): { obj: string; mtl: string } {
  return {
    obj: readFileSync(resolve(modelsDir, `${name}.obj`), "utf8"),
    mtl: readFileSync(resolve(modelsDir, `${name}.mtl`), "utf8"),
  };
}

function usedMaterials(obj: string): string[] {
  return [...obj.matchAll(/^usemtl\s+(\S+)\s*$/gm)].map((match) => match[1]);
}

function declaredMaterials(mtl: string): Set<string> {
  return new Set([...mtl.matchAll(/^newmtl\s+(\S+)\s*$/gm)].map((match) => match[1]));
}

describe.each(["tank-hull", "tank-turret"])("%s model", (name) => {
  const { obj, mtl } = readModel(name);

  it(`references ${name}.mtl so the loader can find the materials`, () => {
    expect(obj).toMatch(new RegExp(`^mtllib\\s+${name}\\.mtl\\s*$`, "m"));
  });

  it("has geometry (vertices and faces)", () => {
    const vertexCount = obj.match(/^v\s/gm)?.length ?? 0;
    const faceCount = obj.match(/^f\s/gm)?.length ?? 0;
    expect(vertexCount).toBeGreaterThan(0);
    expect(faceCount).toBeGreaterThan(0);
  });

  it("only references materials declared in its .mtl", () => {
    const declared = declaredMaterials(mtl);
    const used = usedMaterials(obj);
    expect(used.length).toBeGreaterThan(0);
    for (const material of used) {
      expect(declared).toContain(material);
    }
  });
});

describe("tank-turret barrel material split", () => {
  const { obj, mtl } = readModel("tank-turret");

  it("declares a dedicated 'barrel' material for the gun-readiness tint", () => {
    expect(mtl).toMatch(/^newmtl\s+barrel\s*$/m);
  });

  it("uses the 'barrel' material (and keeps a separate 'turret' material)", () => {
    const used = new Set(usedMaterials(obj));
    expect(used).toContain("barrel");
    expect(used).toContain("turret");
  });
});

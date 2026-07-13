// Guards the crate obstacle model shipped for the 3D overlay. The .obj is loaded
// at runtime by crate-3d.ts (via OBJLoader) and references crate.mtl through an
// `mtllib` directive, so both files must exist, sit side by side, and stay
// internally consistent. This test fails fast if the generated asset drifts or
// goes missing (e.g. someone edits/regenerates it and forgets a material).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const modelsDir = resolve(process.cwd(), "public/assets/models");
const objSource = readFileSync(resolve(modelsDir, "crate.obj"), "utf8");
const mtlSource = readFileSync(resolve(modelsDir, "crate.mtl"), "utf8");

describe("crate.obj", () => {
  it("references crate.mtl so the loader can find the materials", () => {
    expect(objSource).toMatch(/^mtllib\s+crate\.mtl\s*$/m);
  });

  it("has geometry (vertices and faces)", () => {
    const vertexCount = objSource.match(/^v\s/gm)?.length ?? 0;
    const faceCount = objSource.match(/^f\s/gm)?.length ?? 0;
    expect(vertexCount).toBeGreaterThan(0);
    expect(faceCount).toBeGreaterThan(0);
  });

  it("only references materials declared in crate.mtl", () => {
    const declared = new Set(
      [...mtlSource.matchAll(/^newmtl\s+(\S+)\s*$/gm)].map((match) => match[1]),
    );
    const used = [...objSource.matchAll(/^usemtl\s+(\S+)\s*$/gm)].map((match) => match[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const material of used) {
      expect(declared).toContain(material);
    }
  });
});

describe("crate.mtl", () => {
  it("declares the crate frame and panel materials", () => {
    expect(mtlSource).toMatch(/^newmtl\s+crateFrame\s*$/m);
    expect(mtlSource).toMatch(/^newmtl\s+cratePanel\s*$/m);
  });
});

// Guards the parked-car obstacle model shipped for the 3D overlay. The .obj is
// loaded at runtime by car-3d.ts (via OBJLoader) and references car.mtl through
// an `mtllib` directive, so both files must exist, sit side by side, and stay
// internally consistent. This test fails fast if the generated asset drifts or
// goes missing (e.g. someone edits/regenerates it and forgets a material).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const modelsDir = resolve(process.cwd(), "public/assets/models");
const objSource = readFileSync(resolve(modelsDir, "car.obj"), "utf8");
const mtlSource = readFileSync(resolve(modelsDir, "car.mtl"), "utf8");

describe("car.obj", () => {
  it("references car.mtl so the loader can find the materials", () => {
    expect(objSource).toMatch(/^mtllib\s+car\.mtl\s*$/m);
  });

  it("has geometry (vertices and faces)", () => {
    const vertexCount = objSource.match(/^v\s/gm)?.length ?? 0;
    const faceCount = objSource.match(/^f\s/gm)?.length ?? 0;
    expect(vertexCount).toBeGreaterThan(0);
    expect(faceCount).toBeGreaterThan(0);
  });

  it("only references materials declared in car.mtl", () => {
    const declared = new Set(
      [...mtlSource.matchAll(/^newmtl\s+(\S+)\s*$/gm)].map((match) => match[1]),
    );
    const used = [...objSource.matchAll(/^usemtl\s+(\S+)\s*$/gm)].map((match) => match[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const material of used) {
      expect(declared).toContain(material);
    }
  });

  it("keeps the recolourable body in its own object so the overlay can tint it", () => {
    // car-3d.ts recolours the CarBody mesh per parked car; that only works if the
    // body panels are emitted as a distinct object with the carBody material.
    expect(objSource).toMatch(/^o\s+CarBody\s*$/m);
    const bodyObject = objSource.slice(objSource.indexOf("\no CarBody"));
    const nextObject = bodyObject.indexOf("\no ", 1);
    const bodySection = nextObject >= 0 ? bodyObject.slice(0, nextObject) : bodyObject;
    expect(bodySection).toMatch(/^usemtl\s+carBody\s*$/m);
  });
});

describe("car.mtl", () => {
  it("declares the body, glass, and trim materials", () => {
    expect(mtlSource).toMatch(/^newmtl\s+carBody\s*$/m);
    expect(mtlSource).toMatch(/^newmtl\s+carGlass\s*$/m);
    expect(mtlSource).toMatch(/^newmtl\s+carTrim\s*$/m);
  });
});

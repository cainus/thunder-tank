import { describe, expect, it } from "vitest";
import { CAPTURE_THE_FLAG_MAPS } from "../src/game/maps";

describe("built-in capture the flag maps", () => {
  it("ships a twenty-map playlist with classic CTF requirements", () => {
    expect(CAPTURE_THE_FLAG_MAPS).toHaveLength(20);

    for (const map of CAPTURE_THE_FLAG_MAPS) {
      expect(map.ctf).toBeDefined();
      expect(map.ctf?.captureLimit).toBe(3);
      expect(map.ctf?.blueBase.x).toBeLessThan(map.width / 2);
      expect(map.ctf?.redBase.x).toBeGreaterThan(map.width / 2);
      expect(map.ctf?.blueSpawns).toHaveLength(2);
      expect(map.ctf?.redSpawns).toHaveLength(2);
      expect(map.enemySpawns).toHaveLength(2);
    }
  });
});

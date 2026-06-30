import { describe, expect, it } from "vitest";
import {
  CUSTOM_MAP_SCHEMA_VERSION,
  createBlankCustomMap,
  customMapToCampaignMap,
  makeObjectId,
  validateCustomMap,
} from "../src/game/map-schema";

describe("custom map schema", () => {
  it("accepts the default blank editor map", () => {
    const map = createBlankCustomMap();
    const result = validateCustomMap(map);

    expect(result.success).toBe(true);
    expect(result.messages).toEqual([]);
  });

  it("converts custom maps into campaign-compatible maps", () => {
    const map = createBlankCustomMap();
    const campaignMap = customMapToCampaignMap(map);

    expect(campaignMap.id).toBe(map.id);
    expect(campaignMap.name).toBe(map.title);
    expect(campaignMap.playerSpawn).toEqual({ x: map.playerSpawn.x, y: map.playerSpawn.y });
    expect(campaignMap.enemySpawns).toHaveLength(map.enemySpawns.length);
  });

  it("rejects unknown schema versions and bad ids", () => {
    const result = validateCustomMap({
      ...createBlankCustomMap(),
      schemaVersion: CUSTOM_MAP_SCHEMA_VERSION + 1,
      id: "Bad Id",
    });

    expect(result.success).toBe(false);
    expect(result.messages.some((message) => message.code === "schema")).toBe(true);
  });

  it("requires mode-specific spawns", () => {
    const map = {
      ...createBlankCustomMap(),
      playerTwoSpawn: undefined,
      coOpDriverSpawn: undefined,
      coOpGunnerSpawn: undefined,
    };

    expect(validateCustomMap(map, "onePlayer").success).toBe(true);
    expect(validateCustomMap(map, "twoPlayer").messages).toContainEqual(
      expect.objectContaining({ code: "missing-player-two-spawn" }),
    );
    expect(validateCustomMap(map, "coOp").messages).toContainEqual(
      expect.objectContaining({ code: "missing-coop-spawn" }),
    );
  });

  it("reports duplicate ids, out-of-bounds objects, and blocked spawns", () => {
    const map = createBlankCustomMap();
    const result = validateCustomMap({
      ...map,
      pickups: [{ ...map.pickups[0], id: map.obstacles[0].id, x: -5 }],
      obstacles: [{ ...map.obstacles[0], x: map.playerSpawn.x, y: map.playerSpawn.y }],
    });

    expect(result.success).toBe(false);
    expect(result.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "duplicate-id" }),
        expect.objectContaining({ code: "out-of-bounds" }),
        expect.objectContaining({ code: "spawn-obstructed" }),
      ]),
    );
  });

  it("allocates stable unused object ids", () => {
    expect(makeObjectId("crate", ["crate-1", "crate-2"])).toBe("crate-3");
    expect(makeObjectId("Enemy Spawn", [])).toBe("enemy-spawn-1");
  });
});

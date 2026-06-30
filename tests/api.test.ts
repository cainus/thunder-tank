// @vitest-environment node
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApiApp } from "../server/app";
import { InMemoryMapStore } from "../server/map-store";
import { createBlankCustomMap } from "../src/game/map-schema";

describe("map api", () => {
  it("creates, lists, loads, updates, and deletes custom maps", async () => {
    const app = createApiApp(new InMemoryMapStore());
    const map = { ...createBlankCustomMap(), id: "api-arena", title: "API Arena" };

    const created = await request(app).post("/api/maps").send(map).expect(201);
    expect(created.body.id).toBe("api-arena");

    const listed = await request(app).get("/api/maps").expect(200);
    expect(listed.body.maps).toEqual([
      expect.objectContaining({ id: "api-arena", title: "API Arena", authorLabel: "local" }),
    ]);

    const loaded = await request(app).get("/api/maps/api-arena").expect(200);
    expect(loaded.body.mapData.title).toBe("API Arena");

    const updated = await request(app).put("/api/maps/api-arena").send({ ...map, title: "Updated Arena" }).expect(200);
    expect(updated.body.title).toBe("Updated Arena");
    expect(updated.body.mapData.id).toBe("api-arena");

    await request(app).delete("/api/maps/api-arena").expect(204);
    await request(app).get("/api/maps/api-arena").expect(404);
  });

  it("rejects invalid maps", async () => {
    const app = createApiApp(new InMemoryMapStore());
    const invalid = { ...createBlankCustomMap(), id: "bad-arena", enemySpawns: [] };

    const response = await request(app).post("/api/maps").send(invalid).expect(400);
    expect(response.body.messages[0].message).toContain("enemySpawns");
  });

  it("accepts dev log events", async () => {
    const app = createApiApp(new InMemoryMapStore());

    await request(app).post("/api/dev/log").send({ level: "info", message: "hello" }).expect(204);
  });
});

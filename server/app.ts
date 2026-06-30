import cors from "cors";
import express from "express";
import { validateCustomMap } from "../src/game/map-schema";
import type { CustomMapData } from "../src/game/map-schema";
import type { MapStore } from "./map-store";

export function createApiApp(store: MapStore) {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/maps", async (_request, response, next) => {
    try {
      response.json({ maps: await store.list() });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/maps/:id", async (request, response, next) => {
    try {
      const record = await store.get(request.params.id);

      if (!record) {
        response.status(404).json({ error: "Map not found." });
        return;
      }

      response.json(record);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/maps", async (request, response, next) => {
    try {
      const validation = validateCustomMap(request.body, "onePlayer");

      if (!validation.success || !validation.data) {
        response.status(400).json({ error: "Map validation failed.", messages: validation.messages });
        return;
      }

      const existing = await store.get(validation.data.id);
      const record = existing ? await store.update(validation.data.id, validation.data) : await store.create(validation.data);
      response.status(existing ? 200 : 201).json(record);
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/maps/:id", async (request, response, next) => {
    try {
      const candidate: CustomMapData = { ...request.body, id: request.params.id };
      const validation = validateCustomMap(candidate, "onePlayer");

      if (!validation.success || !validation.data) {
        response.status(400).json({ error: "Map validation failed.", messages: validation.messages });
        return;
      }

      const record = await store.update(request.params.id, validation.data);

      if (!record) {
        response.status(404).json({ error: "Map not found." });
        return;
      }

      response.json(record);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/maps/:id", async (request, response, next) => {
    try {
      const deleted = await store.delete(request.params.id);

      if (!deleted) {
        response.status(404).json({ error: "Map not found." });
        return;
      }

      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/dev/log", (request, response) => {
    if (process.env.NODE_ENV !== "production") {
      console.log("[frontend]", request.body);
    }

    response.status(204).send();
  });

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    console.error(error);
    response.status(500).json({ error: "Internal server error." });
  });

  return app;
}

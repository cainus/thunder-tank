import "dotenv/config";
import react from "@vitejs/plugin-react";
import { Pool } from "pg";
import { defineConfig, type PluginOption } from "vite";
import { createApiApp } from "./server/app";
import { InMemoryMapStore, PostgresMapStore, type MapStore } from "./server/map-store";

// Runs the map-library API in-process with the Vite dev server, so a single
// `npm run dev` serves both the game and `/api` on one port/origin (no proxy,
// no second process). Production still uses the standalone `server/index.ts`.
function apiServer(): PluginOption {
  return {
    name: "thunder-tank-api",
    configureServer(server) {
      const store: MapStore = process.env.DATABASE_URL
        ? new PostgresMapStore(new Pool({ connectionString: process.env.DATABASE_URL }))
        : new InMemoryMapStore();

      if (!process.env.DATABASE_URL) {
        server.config.logger.warn(
          "[thunder-tank] DATABASE_URL not set — using in-memory map store (custom maps won't persist).",
        );
      }

      server.middlewares.use(createApiApp(store));
    },
  };
}

export default defineConfig({
  plugins: [react(), apiServer()],
  server: {
    host: process.env.HOST ?? "127.0.0.1",
    port: Number(process.env.PORT ?? 5173),
  },
});

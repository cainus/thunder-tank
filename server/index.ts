import "dotenv/config";
import { Pool } from "pg";
import { createApiApp } from "./app";
import { PostgresMapStore } from "./map-store";

const port = Number(process.env.API_PORT ?? process.env.PORT ?? 3001);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = createApiApp(new PostgresMapStore(pool));

app.listen(port, () => {
  console.log(`Thunder Tank API listening on http://127.0.0.1:${port}`);
});

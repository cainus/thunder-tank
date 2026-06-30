import type { Pool } from "pg";
import type { CustomMapData } from "../src/game/map-schema";

export interface MapSummary {
  id: string;
  title: string;
  authorLabel: string;
  updatedAt: string;
}

export interface MapRecord extends MapSummary {
  mapData: CustomMapData;
}

export interface MapStore {
  list(): Promise<MapSummary[]>;
  get(id: string): Promise<MapRecord | undefined>;
  create(map: CustomMapData): Promise<MapRecord>;
  update(id: string, map: CustomMapData): Promise<MapRecord | undefined>;
  delete(id: string): Promise<boolean>;
}

export class InMemoryMapStore implements MapStore {
  private records = new Map<string, MapRecord>();

  async list(): Promise<MapSummary[]> {
    return [...this.records.values()]
      .map(({ id, title, authorLabel, updatedAt }) => ({ id, title, authorLabel, updatedAt }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<MapRecord | undefined> {
    return this.records.get(id);
  }

  async create(map: CustomMapData): Promise<MapRecord> {
    const record = toRecord(map);
    this.records.set(map.id, record);
    return record;
  }

  async update(id: string, map: CustomMapData): Promise<MapRecord | undefined> {
    if (!this.records.has(id)) {
      return undefined;
    }

    const record = toRecord({ ...map, id });
    this.records.set(id, record);
    return record;
  }

  async delete(id: string): Promise<boolean> {
    return this.records.delete(id);
  }
}

export class PostgresMapStore implements MapStore {
  constructor(private readonly pool: Pool) {}

  async list(): Promise<MapSummary[]> {
    const result = await this.pool.query<DbMapRow>(
      "select id, title, author_label, map_data, created_at, updated_at from maps order by updated_at desc",
    );
    return result.rows.map(rowToSummary);
  }

  async get(id: string): Promise<MapRecord | undefined> {
    const result = await this.pool.query<DbMapRow>(
      "select id, title, author_label, map_data, created_at, updated_at from maps where id = $1",
      [id],
    );
    return result.rows[0] ? rowToRecord(result.rows[0]) : undefined;
  }

  async create(map: CustomMapData): Promise<MapRecord> {
    const result = await this.pool.query<DbMapRow>(
      `insert into maps (id, title, author_label, map_data)
       values ($1, $2, $3, $4)
       returning id, title, author_label, map_data, created_at, updated_at`,
      [map.id, map.title, map.authorLabel, map],
    );
    return rowToRecord(result.rows[0]);
  }

  async update(id: string, map: CustomMapData): Promise<MapRecord | undefined> {
    const result = await this.pool.query<DbMapRow>(
      `update maps
       set title = $2, author_label = $3, map_data = $4, updated_at = now()
       where id = $1
       returning id, title, author_label, map_data, created_at, updated_at`,
      [id, map.title, map.authorLabel, { ...map, id }],
    );
    return result.rows[0] ? rowToRecord(result.rows[0]) : undefined;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query("delete from maps where id = $1", [id]);
    return Number(result.rowCount) > 0;
  }
}

interface DbMapRow {
  id: string;
  title: string;
  author_label: string;
  map_data: CustomMapData;
  updated_at: Date | string;
}

function toRecord(map: CustomMapData): MapRecord {
  return {
    id: map.id,
    title: map.title,
    authorLabel: map.authorLabel,
    mapData: map,
    updatedAt: new Date().toISOString(),
  };
}

function rowToSummary(row: DbMapRow): MapSummary {
  return {
    id: row.id,
    title: row.title,
    authorLabel: row.author_label,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function rowToRecord(row: DbMapRow): MapRecord {
  return {
    ...rowToSummary(row),
    mapData: row.map_data,
  };
}

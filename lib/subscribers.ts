import { runtimeEnv } from "./runtime-env";
import type { Pool, QueryResultRow } from "pg";

export const OVERLAY_STYLES = ["graphite", "paper", "mono"] as const;
export type OverlayStyle = (typeof OVERLAY_STYLES)[number];

export type OverlaySettings = {
  style: OverlayStyle;
  version: number;
  updatedAt: string;
};

export const DEFAULT_OVERLAY_SETTINGS: OverlaySettings = {
  style: "graphite",
  version: 0,
  updatedAt: new Date(0).toISOString(),
};

export type SubscriberRecord = {
  sequence: number;
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  joinedAt: string;
  source: string;
};

export type NewSubscriber = Omit<SubscriberRecord, "sequence"> & { eventKey: string };

type Row = QueryResultRow & {
  sequence: number | string;
  external_id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  joined_at: string;
  source: string;
};

type SettingsRow = QueryResultRow & {
  style: string;
  version: number | string;
  updated_at: string;
};

type D1Statement = {
  bind: (...values: unknown[]) => D1Statement;
  first: <T>() => Promise<T | null>;
  all: <T>() => Promise<{ results?: T[] }>;
  run: () => Promise<unknown>;
};

type D1DatabaseLike = {
  prepare: (query: string) => D1Statement;
  batch: (statements: D1Statement[]) => Promise<unknown>;
};

const memory = globalThis as typeof globalThis & {
  __subscriberEvents?: Array<SubscriberRecord & { eventKey: string }>;
  __overlaySettings?: OverlaySettings;
  __pgPool?: Pool;
  __pgReady?: Promise<void>;
};

export function isOverlayStyle(value: unknown): value is OverlayStyle {
  return typeof value === "string" && OVERLAY_STYLES.includes(value as OverlayStyle);
}

function mapSettingsRow(row: SettingsRow): OverlaySettings {
  return {
    style: isOverlayStyle(row.style) ? row.style : DEFAULT_OVERLAY_SETTINGS.style,
    version: Number(row.version),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapRow(row: Row): SubscriberRecord {
  return {
    sequence: Number(row.sequence),
    id: row.external_id,
    name: row.display_name,
    username: row.username,
    avatarUrl: row.avatar_url,
    joinedAt: new Date(row.joined_at).toISOString(),
    source: row.source,
  };
}

async function postgresPool() {
  const connectionString = await runtimeEnv("DATABASE_URL");
  if (!connectionString) return null;
  if (!memory.__pgPool) {
    const { Pool } = await import("pg");
    memory.__pgPool = new Pool({
      connectionString,
      ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
      max: 3,
    });
  }
  memory.__pgReady ??= (async () => {
    await memory.__pgPool!.query(`
      CREATE TABLE IF NOT EXISTS subscriber_events (
        sequence BIGSERIAL PRIMARY KEY,
        event_key TEXT NOT NULL UNIQUE,
        external_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        username TEXT,
        avatar_url TEXT,
        joined_at TIMESTAMPTZ NOT NULL,
        source TEXT NOT NULL
      )
    `);
    await memory.__pgPool!.query(`
      CREATE TABLE IF NOT EXISTS overlay_settings (
        id SMALLINT PRIMARY KEY CHECK (id = 1),
        style TEXT NOT NULL,
        version BIGINT NOT NULL DEFAULT 1,
        updated_at TIMESTAMPTZ NOT NULL
      )
    `);
  })();
  await memory.__pgReady;
  return memory.__pgPool;
}

async function d1Database() {
  try {
    const { env } = await import("cloudflare:workers");
    const db = (env as unknown as { DB?: D1DatabaseLike }).DB;
    if (!db) return null;
    await db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS subscriber_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        event_key TEXT NOT NULL UNIQUE,
        external_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        username TEXT,
        avatar_url TEXT,
        joined_at TEXT NOT NULL,
        source TEXT NOT NULL
      )`),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS subscriber_events_event_key_idx ON subscriber_events(event_key)"),
      db.prepare(`CREATE TABLE IF NOT EXISTS overlay_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        style TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      )`),
    ]);
    return db;
  } catch {
    return null;
  }
}

function memoryStore() {
  memory.__subscriberEvents ??= [];
  return memory.__subscriberEvents;
}

export async function recordSubscriber(input: NewSubscriber): Promise<SubscriberRecord> {
  const pool = await postgresPool();
  if (pool) {
    const inserted = await pool.query(
      `INSERT INTO subscriber_events (event_key, external_id, display_name, username, avatar_url, joined_at, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (event_key) DO UPDATE SET event_key = EXCLUDED.event_key
       RETURNING sequence, external_id, display_name, username, avatar_url, joined_at, source`,
      [input.eventKey, input.id, input.name, input.username, input.avatarUrl, input.joinedAt, input.source],
    );
    return mapRow(inserted.rows[0]);
  }

  const db = await d1Database();
  if (db) {
    await db.prepare(
      `INSERT OR IGNORE INTO subscriber_events
       (event_key, external_id, display_name, username, avatar_url, joined_at, source)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(input.eventKey, input.id, input.name, input.username, input.avatarUrl, input.joinedAt, input.source).run();
    const row = await db.prepare(
      "SELECT sequence, external_id, display_name, username, avatar_url, joined_at, source FROM subscriber_events WHERE event_key = ?",
    ).bind(input.eventKey).first<Row>();
    if (!row) throw new Error("Subscriber event was not saved");
    return mapRow(row);
  }

  const store = memoryStore();
  const existing = store.find((event) => event.eventKey === input.eventKey);
  if (existing) return existing;
  const next = { ...input, sequence: (store.at(-1)?.sequence ?? 0) + 1 };
  store.push(next);
  return next;
}

export async function subscriberSnapshot(after: number) {
  const pool = await postgresPool();
  if (pool) {
    const [latestResult, eventsResult, settings] = await Promise.all([
      pool.query<Row>("SELECT sequence, external_id, display_name, username, avatar_url, joined_at, source FROM subscriber_events ORDER BY sequence DESC LIMIT 1"),
      pool.query<Row>("SELECT sequence, external_id, display_name, username, avatar_url, joined_at, source FROM subscriber_events WHERE sequence > $1 ORDER BY sequence ASC LIMIT 25", [after]),
      getOverlaySettings(),
    ]);
    return { latest: latestResult.rows[0] ? mapRow(latestResult.rows[0]) : null, events: eventsResult.rows.map(mapRow), settings };
  }

  const db = await d1Database();
  if (db) {
    const [latest, events, settings] = await Promise.all([
      db.prepare("SELECT sequence, external_id, display_name, username, avatar_url, joined_at, source FROM subscriber_events ORDER BY sequence DESC LIMIT 1").first<Row>(),
      db.prepare("SELECT sequence, external_id, display_name, username, avatar_url, joined_at, source FROM subscriber_events WHERE sequence > ? ORDER BY sequence ASC LIMIT 25").bind(after).all<Row>(),
      getOverlaySettings(),
    ]);
    return { latest: latest ? mapRow(latest) : null, events: (events.results ?? []).map(mapRow), settings };
  }

  const store = memoryStore();
  return {
    latest: store.at(-1) ?? null,
    events: store.filter((event) => event.sequence > after).slice(0, 25),
    settings: await getOverlaySettings(),
  };
}

export async function getOverlaySettings(): Promise<OverlaySettings> {
  const pool = await postgresPool();
  if (pool) {
    const result = await pool.query<SettingsRow>("SELECT style, version, updated_at FROM overlay_settings WHERE id = 1");
    return result.rows[0] ? mapSettingsRow(result.rows[0]) : DEFAULT_OVERLAY_SETTINGS;
  }

  const db = await d1Database();
  if (db) {
    const row = await db.prepare("SELECT style, version, updated_at FROM overlay_settings WHERE id = 1").first<SettingsRow>();
    return row ? mapSettingsRow(row) : DEFAULT_OVERLAY_SETTINGS;
  }

  return memory.__overlaySettings ?? DEFAULT_OVERLAY_SETTINGS;
}

export async function setOverlayStyle(style: OverlayStyle): Promise<OverlaySettings> {
  const updatedAt = new Date().toISOString();
  const pool = await postgresPool();
  if (pool) {
    const result = await pool.query<SettingsRow>(
      `INSERT INTO overlay_settings (id, style, version, updated_at)
       VALUES (1, $1, 1, $2)
       ON CONFLICT (id) DO UPDATE
       SET style = EXCLUDED.style, version = overlay_settings.version + 1, updated_at = EXCLUDED.updated_at
       RETURNING style, version, updated_at`,
      [style, updatedAt],
    );
    return mapSettingsRow(result.rows[0]);
  }

  const db = await d1Database();
  if (db) {
    await db.prepare(
      `INSERT INTO overlay_settings (id, style, version, updated_at)
       VALUES (1, ?, 1, ?)
       ON CONFLICT(id) DO UPDATE SET
         style = excluded.style,
         version = overlay_settings.version + 1,
         updated_at = excluded.updated_at`,
    ).bind(style, updatedAt).run();
    const row = await db.prepare("SELECT style, version, updated_at FROM overlay_settings WHERE id = 1").first<SettingsRow>();
    if (!row) throw new Error("Overlay settings were not saved");
    return mapSettingsRow(row);
  }

  const next = {
    style,
    version: (memory.__overlaySettings?.version ?? 0) + 1,
    updatedAt,
  };
  memory.__overlaySettings = next;
  return next;
}

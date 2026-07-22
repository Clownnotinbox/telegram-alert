import { runtimeEnv } from "./runtime-env";

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

type Row = {
  sequence: number | string;
  external_id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  joined_at: string;
  source: string;
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
  __pgPool?: { query: (text: string, values?: unknown[]) => Promise<{ rows: Row[] }> };
  __pgReady?: Promise<void>;
};

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
  memory.__pgReady ??= memory.__pgPool.query(`
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
  `).then(() => undefined);
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
    const [latestResult, eventsResult] = await Promise.all([
      pool.query("SELECT sequence, external_id, display_name, username, avatar_url, joined_at, source FROM subscriber_events ORDER BY sequence DESC LIMIT 1"),
      pool.query("SELECT sequence, external_id, display_name, username, avatar_url, joined_at, source FROM subscriber_events WHERE sequence > $1 ORDER BY sequence ASC LIMIT 25", [after]),
    ]);
    return { latest: latestResult.rows[0] ? mapRow(latestResult.rows[0]) : null, events: eventsResult.rows.map(mapRow) };
  }

  const db = await d1Database();
  if (db) {
    const [latest, events] = await Promise.all([
      db.prepare("SELECT sequence, external_id, display_name, username, avatar_url, joined_at, source FROM subscriber_events ORDER BY sequence DESC LIMIT 1").first<Row>(),
      db.prepare("SELECT sequence, external_id, display_name, username, avatar_url, joined_at, source FROM subscriber_events WHERE sequence > ? ORDER BY sequence ASC LIMIT 25").bind(after).all<Row>(),
    ]);
    return { latest: latest ? mapRow(latest) : null, events: (events.results ?? []).map(mapRow) };
  }

  const store = memoryStore();
  return {
    latest: store.at(-1) ?? null,
    events: store.filter((event) => event.sequence > after).slice(0, 25),
  };
}

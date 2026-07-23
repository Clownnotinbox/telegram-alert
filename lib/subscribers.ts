import type { Pool, QueryResultRow } from "pg";
import { runtimeEnv } from "./runtime-env";

export const OVERLAY_STYLES = ["graphite", "paper", "mono", "anime"] as const;
export type OverlayStyle = (typeof OVERLAY_STYLES)[number];

export type OverlaySettings = {
  style: OverlayStyle;
  version: number;
  updatedAt: string;
};

export type StreamerInstallation = {
  id: string;
  ownerUserId: string;
  ownerChatId: string;
  channelId: string;
  channelTitle: string;
  channelUsername: string | null;
  overlayKey: string;
  style: OverlayStyle;
  version: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type InstallationInput = Pick<
  StreamerInstallation,
  "ownerUserId" | "ownerChatId" | "channelId" | "channelTitle" | "channelUsername"
>;

export type SubscriberRecord = {
  sequence: number;
  installationId: string | null;
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  joinedAt: string;
  source: string;
};

export type NewSubscriber = Omit<SubscriberRecord, "sequence" | "installationId"> & {
  eventKey: string;
  installationId?: string | null;
};

export const DEFAULT_OVERLAY_SETTINGS: OverlaySettings = {
  style: "graphite",
  version: 0,
  updatedAt: new Date(0).toISOString(),
};

type SubscriberRow = QueryResultRow & {
  sequence: number | string;
  installation_id: string | null;
  external_id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  joined_at: string | Date;
  source: string;
};

type SettingsRow = QueryResultRow & {
  style: string;
  version: number | string;
  updated_at: string | Date;
};

type InstallationRow = QueryResultRow & {
  id: string;
  owner_user_id: string;
  owner_chat_id: string;
  channel_id: string;
  channel_title: string;
  channel_username: string | null;
  overlay_key: string;
  style: string;
  version: number | string;
  active: boolean | number;
  created_at: string | Date;
  updated_at: string | Date;
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
  __streamerInstallations?: StreamerInstallation[];
  __pgPool?: Pool;
  __pgReady?: Promise<void>;
  __d1Ready?: Promise<void>;
};

export function isOverlayStyle(value: unknown): value is OverlayStyle {
  return typeof value === "string" && OVERLAY_STYLES.includes(value as OverlayStyle);
}

function toIso(value: string | Date) {
  return new Date(value).toISOString();
}

function mapSettingsRow(row: SettingsRow): OverlaySettings {
  return {
    style: isOverlayStyle(row.style) ? row.style : DEFAULT_OVERLAY_SETTINGS.style,
    version: Number(row.version),
    updatedAt: toIso(row.updated_at),
  };
}

function mapSubscriberRow(row: SubscriberRow): SubscriberRecord {
  return {
    sequence: Number(row.sequence),
    installationId: row.installation_id,
    id: row.external_id,
    name: row.display_name,
    username: row.username,
    avatarUrl: row.avatar_url,
    joinedAt: toIso(row.joined_at),
    source: row.source,
  };
}

function mapInstallationRow(row: InstallationRow): StreamerInstallation {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    ownerChatId: row.owner_chat_id,
    channelId: row.channel_id,
    channelTitle: row.channel_title,
    channelUsername: row.channel_username,
    overlayKey: row.overlay_key,
    style: isOverlayStyle(row.style) ? row.style : DEFAULT_OVERLAY_SETTINGS.style,
    version: Number(row.version),
    active: Boolean(row.active),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
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
        installation_id TEXT,
        external_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        username TEXT,
        avatar_url TEXT,
        joined_at TIMESTAMPTZ NOT NULL,
        source TEXT NOT NULL
      )
    `);
    await memory.__pgPool!.query("ALTER TABLE subscriber_events ADD COLUMN IF NOT EXISTS installation_id TEXT");
    await memory.__pgPool!.query("CREATE INDEX IF NOT EXISTS subscriber_events_installation_idx ON subscriber_events(installation_id, sequence)");
    await memory.__pgPool!.query(`
      CREATE TABLE IF NOT EXISTS overlay_settings (
        id SMALLINT PRIMARY KEY CHECK (id = 1),
        style TEXT NOT NULL,
        version BIGINT NOT NULL DEFAULT 1,
        updated_at TIMESTAMPTZ NOT NULL
      )
    `);
    await memory.__pgPool!.query(`
      CREATE TABLE IF NOT EXISTS streamer_installations (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL,
        owner_chat_id TEXT NOT NULL,
        channel_id TEXT NOT NULL UNIQUE,
        channel_title TEXT NOT NULL,
        channel_username TEXT,
        overlay_key TEXT NOT NULL UNIQUE,
        style TEXT NOT NULL DEFAULT 'graphite',
        version BIGINT NOT NULL DEFAULT 1,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      )
    `);
    await memory.__pgPool!.query("CREATE INDEX IF NOT EXISTS streamer_installations_owner_idx ON streamer_installations(owner_user_id)");
  })();
  await memory.__pgReady;
  return memory.__pgPool;
}

async function d1Database() {
  try {
    const { env } = await import("cloudflare:workers");
    const db = (env as unknown as { DB?: D1DatabaseLike }).DB;
    if (!db) return null;
    memory.__d1Ready ??= (async () => {
      await db.batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS subscriber_events (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT,
          event_key TEXT NOT NULL UNIQUE,
          installation_id TEXT,
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
        db.prepare(`CREATE TABLE IF NOT EXISTS streamer_installations (
          id TEXT PRIMARY KEY,
          owner_user_id TEXT NOT NULL,
          owner_chat_id TEXT NOT NULL,
          channel_id TEXT NOT NULL UNIQUE,
          channel_title TEXT NOT NULL,
          channel_username TEXT,
          overlay_key TEXT NOT NULL UNIQUE,
          style TEXT NOT NULL DEFAULT 'graphite',
          version INTEGER NOT NULL DEFAULT 1,
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`),
        db.prepare("CREATE INDEX IF NOT EXISTS streamer_installations_owner_idx ON streamer_installations(owner_user_id)"),
      ]);
      await db.prepare("ALTER TABLE subscriber_events ADD COLUMN installation_id TEXT").run().catch(() => undefined);
      await db.prepare("CREATE INDEX IF NOT EXISTS subscriber_events_installation_idx ON subscriber_events(installation_id, sequence)").run();
    })();
    await memory.__d1Ready;
    return db;
  } catch {
    return null;
  }
}

function memoryEvents() {
  memory.__subscriberEvents ??= [];
  return memory.__subscriberEvents;
}

function memoryInstallations() {
  memory.__streamerInstallations ??= [];
  return memory.__streamerInstallations;
}

function newInstallation(input: InstallationInput): StreamerInstallation {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    ...input,
    overlayKey: `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`,
    style: "graphite",
    version: 1,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getInstallationById(id: string): Promise<StreamerInstallation | null> {
  const pool = await postgresPool();
  if (pool) {
    const result = await pool.query<InstallationRow>("SELECT * FROM streamer_installations WHERE id = $1", [id]);
    return result.rows[0] ? mapInstallationRow(result.rows[0]) : null;
  }
  const db = await d1Database();
  if (db) {
    const row = await db.prepare("SELECT * FROM streamer_installations WHERE id = ?").bind(id).first<InstallationRow>();
    return row ? mapInstallationRow(row) : null;
  }
  return memoryInstallations().find((item) => item.id === id) ?? null;
}

export async function getInstallationByChannelId(channelId: string): Promise<StreamerInstallation | null> {
  const pool = await postgresPool();
  if (pool) {
    const result = await pool.query<InstallationRow>("SELECT * FROM streamer_installations WHERE channel_id = $1", [channelId]);
    return result.rows[0] ? mapInstallationRow(result.rows[0]) : null;
  }
  const db = await d1Database();
  if (db) {
    const row = await db.prepare("SELECT * FROM streamer_installations WHERE channel_id = ?").bind(channelId).first<InstallationRow>();
    return row ? mapInstallationRow(row) : null;
  }
  return memoryInstallations().find((item) => item.channelId === channelId) ?? null;
}

export async function getInstallationByOverlayKey(overlayKey: string): Promise<StreamerInstallation | null> {
  const pool = await postgresPool();
  if (pool) {
    const result = await pool.query<InstallationRow>("SELECT * FROM streamer_installations WHERE overlay_key = $1", [overlayKey]);
    return result.rows[0] ? mapInstallationRow(result.rows[0]) : null;
  }
  const db = await d1Database();
  if (db) {
    const row = await db.prepare("SELECT * FROM streamer_installations WHERE overlay_key = ?").bind(overlayKey).first<InstallationRow>();
    return row ? mapInstallationRow(row) : null;
  }
  return memoryInstallations().find((item) => item.overlayKey === overlayKey) ?? null;
}

export async function listInstallationsByOwner(ownerUserId: string): Promise<StreamerInstallation[]> {
  const pool = await postgresPool();
  if (pool) {
    const result = await pool.query<InstallationRow>(
      "SELECT * FROM streamer_installations WHERE owner_user_id = $1 ORDER BY created_at ASC",
      [ownerUserId],
    );
    return result.rows.map(mapInstallationRow);
  }
  const db = await d1Database();
  if (db) {
    const result = await db.prepare(
      "SELECT * FROM streamer_installations WHERE owner_user_id = ? ORDER BY created_at ASC",
    ).bind(ownerUserId).all<InstallationRow>();
    return (result.results ?? []).map(mapInstallationRow);
  }
  return memoryInstallations().filter((item) => item.ownerUserId === ownerUserId);
}

export async function upsertStreamerInstallation(input: InstallationInput) {
  const existing = await getInstallationByChannelId(input.channelId);
  if (existing && existing.ownerUserId !== input.ownerUserId) {
    return { installation: existing, created: false, ownershipConflict: true };
  }

  const next = existing
    ? {
        ...existing,
        ownerChatId: input.ownerChatId,
        channelTitle: input.channelTitle,
        channelUsername: input.channelUsername,
        active: true,
        updatedAt: new Date().toISOString(),
      }
    : newInstallation(input);

  const pool = await postgresPool();
  if (pool) {
    const result = await pool.query<InstallationRow>(
      `INSERT INTO streamer_installations
       (id, owner_user_id, owner_chat_id, channel_id, channel_title, channel_username, overlay_key, style, version, active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (channel_id) DO UPDATE SET
         owner_chat_id = EXCLUDED.owner_chat_id,
         channel_title = EXCLUDED.channel_title,
         channel_username = EXCLUDED.channel_username,
         active = TRUE,
         updated_at = EXCLUDED.updated_at
       WHERE streamer_installations.owner_user_id = EXCLUDED.owner_user_id
       RETURNING *`,
      [
        next.id,
        next.ownerUserId,
        next.ownerChatId,
        next.channelId,
        next.channelTitle,
        next.channelUsername,
        next.overlayKey,
        next.style,
        next.version,
        next.active,
        next.createdAt,
        next.updatedAt,
      ],
    );
    if (!result.rows[0]) {
      return {
        installation: (await getInstallationByChannelId(input.channelId))!,
        created: false,
        ownershipConflict: true,
      };
    }
    return { installation: mapInstallationRow(result.rows[0]), created: !existing, ownershipConflict: false };
  }

  const db = await d1Database();
  if (db) {
    await db.prepare(
      `INSERT INTO streamer_installations
       (id, owner_user_id, owner_chat_id, channel_id, channel_title, channel_username, overlay_key, style, version, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(channel_id) DO UPDATE SET
         owner_chat_id = excluded.owner_chat_id,
         channel_title = excluded.channel_title,
         channel_username = excluded.channel_username,
         active = 1,
         updated_at = excluded.updated_at
       WHERE streamer_installations.owner_user_id = excluded.owner_user_id`,
    ).bind(
      next.id,
      next.ownerUserId,
      next.ownerChatId,
      next.channelId,
      next.channelTitle,
      next.channelUsername,
      next.overlayKey,
      next.style,
      next.version,
      next.active ? 1 : 0,
      next.createdAt,
      next.updatedAt,
    ).run();
    const stored = (await getInstallationByChannelId(input.channelId))!;
    return {
      installation: stored,
      created: !existing,
      ownershipConflict: stored.ownerUserId !== input.ownerUserId,
    };
  }

  const store = memoryInstallations();
  if (existing) Object.assign(existing, next);
  else store.push(next);
  return { installation: next, created: !existing, ownershipConflict: false };
}

export async function setInstallationActive(id: string, active: boolean) {
  const updatedAt = new Date().toISOString();
  const pool = await postgresPool();
  if (pool) {
    const result = await pool.query<InstallationRow>(
      "UPDATE streamer_installations SET active = $2, updated_at = $3 WHERE id = $1 RETURNING *",
      [id, active, updatedAt],
    );
    return result.rows[0] ? mapInstallationRow(result.rows[0]) : null;
  }
  const db = await d1Database();
  if (db) {
    await db.prepare("UPDATE streamer_installations SET active = ?, updated_at = ? WHERE id = ?")
      .bind(active ? 1 : 0, updatedAt, id).run();
    return getInstallationById(id);
  }
  const installation = memoryInstallations().find((item) => item.id === id);
  if (!installation) return null;
  installation.active = active;
  installation.updatedAt = updatedAt;
  return installation;
}

export async function recordSubscriber(input: NewSubscriber): Promise<SubscriberRecord> {
  const installationId = input.installationId ?? null;
  const pool = await postgresPool();
  if (pool) {
    const inserted = await pool.query<SubscriberRow>(
      `INSERT INTO subscriber_events
       (event_key, installation_id, external_id, display_name, username, avatar_url, joined_at, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (event_key) DO UPDATE SET event_key = EXCLUDED.event_key
       RETURNING sequence, installation_id, external_id, display_name, username, avatar_url, joined_at, source`,
      [input.eventKey, installationId, input.id, input.name, input.username, input.avatarUrl, input.joinedAt, input.source],
    );
    return mapSubscriberRow(inserted.rows[0]);
  }

  const db = await d1Database();
  if (db) {
    await db.prepare(
      `INSERT OR IGNORE INTO subscriber_events
       (event_key, installation_id, external_id, display_name, username, avatar_url, joined_at, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(input.eventKey, installationId, input.id, input.name, input.username, input.avatarUrl, input.joinedAt, input.source).run();
    const row = await db.prepare(
      "SELECT sequence, installation_id, external_id, display_name, username, avatar_url, joined_at, source FROM subscriber_events WHERE event_key = ?",
    ).bind(input.eventKey).first<SubscriberRow>();
    if (!row) throw new Error("Subscriber event was not saved");
    return mapSubscriberRow(row);
  }

  const store = memoryEvents();
  const existing = store.find((event) => event.eventKey === input.eventKey);
  if (existing) return existing;
  const next = { ...input, installationId, sequence: (store.at(-1)?.sequence ?? 0) + 1 };
  store.push(next);
  return next;
}

export async function installationHasSubscriber(installationId: string, externalId: string) {
  const pool = await postgresPool();
  if (pool) {
    const result = await pool.query(
      "SELECT 1 FROM subscriber_events WHERE installation_id = $1 AND external_id = $2 LIMIT 1",
      [installationId, externalId],
    );
    return Boolean(result.rows[0]);
  }
  const db = await d1Database();
  if (db) {
    const row = await db.prepare(
      "SELECT sequence FROM subscriber_events WHERE installation_id = ? AND external_id = ? LIMIT 1",
    ).bind(installationId, externalId).first<{ sequence: number }>();
    return Boolean(row);
  }
  return memoryEvents().some((event) => event.installationId === installationId && event.id === externalId);
}

export async function subscriberSnapshot(after: number, installationId: string | null = null) {
  const pool = await postgresPool();
  if (pool) {
    const filter = installationId ? "installation_id = $1" : "installation_id IS NULL";
    const values = installationId ? [installationId] : [];
    const afterPosition = installationId ? "$2" : "$1";
    const [latestResult, eventsResult, settings] = await Promise.all([
      pool.query<SubscriberRow>(
        `SELECT sequence, installation_id, external_id, display_name, username, avatar_url, joined_at, source
         FROM subscriber_events WHERE ${filter} ORDER BY sequence DESC LIMIT 1`,
        values,
      ),
      pool.query<SubscriberRow>(
        `SELECT sequence, installation_id, external_id, display_name, username, avatar_url, joined_at, source
         FROM subscriber_events WHERE ${filter} AND sequence > ${afterPosition} ORDER BY sequence ASC LIMIT 25`,
        [...values, after],
      ),
      getOverlaySettings(installationId),
    ]);
    return {
      latest: latestResult.rows[0] ? mapSubscriberRow(latestResult.rows[0]) : null,
      events: eventsResult.rows.map(mapSubscriberRow),
      settings,
    };
  }

  const db = await d1Database();
  if (db) {
    const filter = installationId ? "installation_id = ?" : "installation_id IS NULL";
    const latestStatement = db.prepare(
      `SELECT sequence, installation_id, external_id, display_name, username, avatar_url, joined_at, source
       FROM subscriber_events WHERE ${filter} ORDER BY sequence DESC LIMIT 1`,
    );
    const eventsStatement = db.prepare(
      `SELECT sequence, installation_id, external_id, display_name, username, avatar_url, joined_at, source
       FROM subscriber_events WHERE ${filter} AND sequence > ? ORDER BY sequence ASC LIMIT 25`,
    );
    const [latest, events, settings] = await Promise.all([
      (installationId ? latestStatement.bind(installationId) : latestStatement).first<SubscriberRow>(),
      (installationId ? eventsStatement.bind(installationId, after) : eventsStatement.bind(after)).all<SubscriberRow>(),
      getOverlaySettings(installationId),
    ]);
    return {
      latest: latest ? mapSubscriberRow(latest) : null,
      events: (events.results ?? []).map(mapSubscriberRow),
      settings,
    };
  }

  const store = memoryEvents().filter((event) => event.installationId === installationId);
  return {
    latest: store.at(-1) ?? null,
    events: store.filter((event) => event.sequence > after).slice(0, 25),
    settings: await getOverlaySettings(installationId),
  };
}

export async function getOverlaySettings(installationId: string | null = null): Promise<OverlaySettings> {
  if (installationId) {
    const installation = await getInstallationById(installationId);
    return installation
      ? { style: installation.style, version: installation.version, updatedAt: installation.updatedAt }
      : DEFAULT_OVERLAY_SETTINGS;
  }

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

export async function setOverlayStyle(style: OverlayStyle, installationId: string | null = null): Promise<OverlaySettings> {
  const updatedAt = new Date().toISOString();
  if (installationId) {
    const pool = await postgresPool();
    if (pool) {
      const result = await pool.query<InstallationRow>(
        `UPDATE streamer_installations
         SET style = $2, version = version + 1, updated_at = $3
         WHERE id = $1 RETURNING *`,
        [installationId, style, updatedAt],
      );
      if (!result.rows[0]) throw new Error("Installation not found");
      const installation = mapInstallationRow(result.rows[0]);
      return { style: installation.style, version: installation.version, updatedAt: installation.updatedAt };
    }
    const db = await d1Database();
    if (db) {
      await db.prepare(
        "UPDATE streamer_installations SET style = ?, version = version + 1, updated_at = ? WHERE id = ?",
      ).bind(style, updatedAt, installationId).run();
      const installation = await getInstallationById(installationId);
      if (!installation) throw new Error("Installation not found");
      return { style: installation.style, version: installation.version, updatedAt: installation.updatedAt };
    }
    const installation = memoryInstallations().find((item) => item.id === installationId);
    if (!installation) throw new Error("Installation not found");
    installation.style = style;
    installation.version += 1;
    installation.updatedAt = updatedAt;
    return { style, version: installation.version, updatedAt };
  }

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
  const next = { style, version: (memory.__overlaySettings?.version ?? 0) + 1, updatedAt };
  memory.__overlaySettings = next;
  return next;
}

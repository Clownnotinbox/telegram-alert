import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const subscriberEvents = sqliteTable(
  "subscriber_events",
  {
    sequence: integer("sequence").primaryKey({ autoIncrement: true }),
    eventKey: text("event_key").notNull(),
    installationId: text("installation_id"),
    externalId: text("external_id").notNull(),
    displayName: text("display_name").notNull(),
    username: text("username"),
    avatarUrl: text("avatar_url"),
    joinedAt: text("joined_at").notNull(),
    source: text("source").notNull(),
  },
  (table) => [
    uniqueIndex("subscriber_events_event_key_idx").on(table.eventKey),
    index("subscriber_events_installation_idx").on(table.installationId, table.sequence),
  ],
);

export const overlaySettings = sqliteTable("overlay_settings", {
  id: integer("id").primaryKey(),
  style: text("style").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
});

export const streamerInstallations = sqliteTable(
  "streamer_installations",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    ownerChatId: text("owner_chat_id").notNull(),
    channelId: text("channel_id").notNull(),
    channelTitle: text("channel_title").notNull(),
    channelUsername: text("channel_username"),
    overlayKey: text("overlay_key").notNull(),
    style: text("style").notNull().default("graphite"),
    version: integer("version").notNull().default(1),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("streamer_installations_channel_idx").on(table.channelId),
    uniqueIndex("streamer_installations_overlay_key_idx").on(table.overlayKey),
    index("streamer_installations_owner_idx").on(table.ownerUserId),
  ],
);

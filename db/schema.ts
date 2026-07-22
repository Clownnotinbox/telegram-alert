import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const subscriberEvents = sqliteTable(
  "subscriber_events",
  {
    sequence: integer("sequence").primaryKey({ autoIncrement: true }),
    eventKey: text("event_key").notNull(),
    externalId: text("external_id").notNull(),
    displayName: text("display_name").notNull(),
    username: text("username"),
    avatarUrl: text("avatar_url"),
    joinedAt: text("joined_at").notNull(),
    source: text("source").notNull(),
  },
  (table) => [uniqueIndex("subscriber_events_event_key_idx").on(table.eventKey)],
);

export const overlaySettings = sqliteTable("overlay_settings", {
  id: integer("id").primaryKey(),
  style: text("style").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
});

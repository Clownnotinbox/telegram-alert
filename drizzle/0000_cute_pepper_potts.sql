CREATE TABLE `subscriber_events` (
	`sequence` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_key` text NOT NULL,
	`external_id` text NOT NULL,
	`display_name` text NOT NULL,
	`username` text,
	`avatar_url` text,
	`joined_at` text NOT NULL,
	`source` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscriber_events_event_key_idx` ON `subscriber_events` (`event_key`);
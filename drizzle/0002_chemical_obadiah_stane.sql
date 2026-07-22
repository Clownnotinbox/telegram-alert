CREATE TABLE `streamer_installations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`owner_chat_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`channel_title` text NOT NULL,
	`channel_username` text,
	`overlay_key` text NOT NULL,
	`style` text DEFAULT 'graphite' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `streamer_installations_channel_idx` ON `streamer_installations` (`channel_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `streamer_installations_overlay_key_idx` ON `streamer_installations` (`overlay_key`);--> statement-breakpoint
CREATE INDEX `streamer_installations_owner_idx` ON `streamer_installations` (`owner_user_id`);--> statement-breakpoint
ALTER TABLE `subscriber_events` ADD `installation_id` text;--> statement-breakpoint
CREATE INDEX `subscriber_events_installation_idx` ON `subscriber_events` (`installation_id`,`sequence`);
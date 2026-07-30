PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_streamer_installations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`owner_chat_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`channel_title` text NOT NULL,
	`channel_username` text,
	`overlay_key` text NOT NULL,
	`style` text DEFAULT 'noir' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_streamer_installations`("id", "owner_user_id", "owner_chat_id", "channel_id", "channel_title", "channel_username", "overlay_key", "style", "version", "active", "created_at", "updated_at") SELECT "id", "owner_user_id", "owner_chat_id", "channel_id", "channel_title", "channel_username", "overlay_key", "style", "version", "active", "created_at", "updated_at" FROM `streamer_installations`;--> statement-breakpoint
DROP TABLE `streamer_installations`;--> statement-breakpoint
ALTER TABLE `__new_streamer_installations` RENAME TO `streamer_installations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `streamer_installations_channel_idx` ON `streamer_installations` (`channel_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `streamer_installations_overlay_key_idx` ON `streamer_installations` (`overlay_key`);--> statement-breakpoint
CREATE INDEX `streamer_installations_owner_idx` ON `streamer_installations` (`owner_user_id`);--> statement-breakpoint
UPDATE `streamer_installations`
SET `style` = 'noir', `version` = `version` + 1, `updated_at` = CURRENT_TIMESTAMP;--> statement-breakpoint
UPDATE `overlay_settings`
SET `style` = 'noir', `version` = `version` + 1, `updated_at` = CURRENT_TIMESTAMP;

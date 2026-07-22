CREATE TABLE `overlay_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`style` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);

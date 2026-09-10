CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`mime` text DEFAULT '' NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`parent` text,
	`starred` integer DEFAULT 0 NOT NULL,
	`trashed` integer DEFAULT 0 NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	`share_token` text,
	`share_expires` integer
);
--> statement-breakpoint
CREATE INDEX `entries_owner_parent` ON `entries` (`owner`,`parent`);--> statement-breakpoint
CREATE UNIQUE INDEX `entries_share_token` ON `entries` (`share_token`);
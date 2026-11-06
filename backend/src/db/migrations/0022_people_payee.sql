CREATE TABLE `people` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `transactions` ADD COLUMN `person_id` integer REFERENCES people(id);
--> statement-breakpoint
ALTER TABLE `transactions` ADD COLUMN `payee` text;

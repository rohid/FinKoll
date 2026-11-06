ALTER TABLE `transactions` ADD COLUMN `house_id` integer REFERENCES houses(id);--> statement-breakpoint
ALTER TABLE `categories` ADD COLUMN `is_housing` integer DEFAULT false NOT NULL;

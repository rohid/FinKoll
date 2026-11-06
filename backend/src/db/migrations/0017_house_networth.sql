ALTER TABLE `houses` ADD COLUMN `valuation` real;--> statement-breakpoint
ALTER TABLE `houses` ADD COLUMN `valuation_as_of` text;--> statement-breakpoint
ALTER TABLE `houses` ADD COLUMN `ownership_pct` real DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE `mortgages` ADD COLUMN `house_id` integer REFERENCES houses(id);

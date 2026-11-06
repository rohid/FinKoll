CREATE TABLE `pension_holdings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'TJANSTE' NOT NULL,
	`manager` text,
	`current_value` real DEFAULT 0 NOT NULL,
	`projected_monthly_payout` real,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`as_of` text
);
--> statement-breakpoint
CREATE TABLE `pension_snapshots` (
	`date` text PRIMARY KEY NOT NULL,
	`total_value_sek` real DEFAULT 0 NOT NULL
);

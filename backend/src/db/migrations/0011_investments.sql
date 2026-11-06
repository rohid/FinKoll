CREATE TABLE `holdings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`isin` text,
	`symbol` text,
	`asset_type` text DEFAULT 'STOCK' NOT NULL,
	`quantity` real DEFAULT 0 NOT NULL,
	`avg_cost` real DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'SEK' NOT NULL,
	`manual_price` real,
	`source` text DEFAULT 'MANUAL' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `holding_provider_symbols` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`holding_id` integer NOT NULL,
	`provider_id` text NOT NULL,
	`symbol` text NOT NULL,
	`resolved_at` text NOT NULL,
	FOREIGN KEY (`holding_id`) REFERENCES `holdings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `holding_quotes` (
	`holding_id` integer PRIMARY KEY NOT NULL,
	`price` real DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'SEK' NOT NULL,
	`change_pct` real DEFAULT 0 NOT NULL,
	`day_change` real DEFAULT 0 NOT NULL,
	`fx_to_sek` real DEFAULT 1 NOT NULL,
	`market_value_sek` real DEFAULT 0 NOT NULL,
	`as_of` text NOT NULL,
	FOREIGN KEY (`holding_id`) REFERENCES `holdings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `portfolio_snapshots` (
	`date` text PRIMARY KEY NOT NULL,
	`total_value_sek` real DEFAULT 0 NOT NULL,
	`total_cost_sek` real DEFAULT 0 NOT NULL,
	`gain_sek` real DEFAULT 0 NOT NULL
);

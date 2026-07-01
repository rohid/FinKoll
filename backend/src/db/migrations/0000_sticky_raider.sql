CREATE TABLE `budget_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`year` integer NOT NULL,
	`month` integer NOT NULL,
	`category_id` integer NOT NULL,
	`planned_amount` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`subtype` text DEFAULT 'OTHER' NOT NULL,
	`color` text DEFAULT '#6366f1' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `electricity_readings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`year` integer NOT NULL,
	`month` integer NOT NULL,
	`house_id` integer NOT NULL,
	`grid_subscription_fee` real DEFAULT 0 NOT NULL,
	`transfer_rate_per_kwh` real DEFAULT 0 NOT NULL,
	`total_kwh` real DEFAULT 0 NOT NULL,
	`energy_tax_per_kwh` real DEFAULT 0 NOT NULL,
	`ev_kwh` real DEFAULT 0 NOT NULL,
	`ev_cost_vattenfall` real DEFAULT 0 NOT NULL,
	`ev_cost_tibber` real DEFAULT 0 NOT NULL,
	`ev_vat` real DEFAULT 0 NOT NULL,
	`transfer_cost` real DEFAULT 0 NOT NULL,
	`energy_tax_total` real DEFAULT 0 NOT NULL,
	`vattenfall_total` real DEFAULT 0 NOT NULL,
	`ev_total` real DEFAULT 0 NOT NULL,
	`total_bill` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`house_id`) REFERENCES `houses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `houses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recurring_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`description` text NOT NULL,
	`amount` real NOT NULL,
	`category_id` integer NOT NULL,
	`frequency` text DEFAULT 'MONTHLY' NOT NULL,
	`active_from_year` integer NOT NULL,
	`active_from_month` integer NOT NULL,
	`active_to_year` integer,
	`active_to_month` integer,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`description` text NOT NULL,
	`amount` real NOT NULL,
	`category_id` integer NOT NULL,
	`notes` text,
	`is_recurring_instance` integer DEFAULT false NOT NULL,
	`recurring_template_id` integer,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);

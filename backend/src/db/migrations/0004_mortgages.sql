CREATE TABLE `mortgages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`principal_amount` real NOT NULL,
	`interest_rate` real NOT NULL,
	`amortization_years` integer NOT NULL DEFAULT 25,
	`monthly_payment_override` real,
	`effective_from` text NOT NULL,
	`notes` text
);

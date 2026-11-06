CREATE TABLE `fundamentals` (
	`holding_id` integer PRIMARY KEY NOT NULL,
	`pe` real,
	`pb` real,
	`dividend_yield` real,
	`debt_equity` real,
	`market_cap` real,
	`currency` text,
	`as_of` text NOT NULL,
	FOREIGN KEY (`holding_id`) REFERENCES `holdings`(`id`) ON UPDATE no action ON DELETE cascade
);

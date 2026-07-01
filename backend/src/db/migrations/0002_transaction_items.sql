CREATE TABLE `transaction_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`transaction_id` integer NOT NULL REFERENCES `transactions`(`id`) ON DELETE CASCADE,
	`description` text NOT NULL,
	`amount` real NOT NULL
);

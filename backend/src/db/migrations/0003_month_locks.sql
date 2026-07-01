CREATE TABLE `month_locks` (
	`year` integer NOT NULL,
	`month` integer NOT NULL,
	`locked_at` text NOT NULL,
	PRIMARY KEY (`year`, `month`)
);

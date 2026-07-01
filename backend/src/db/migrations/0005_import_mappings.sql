CREATE TABLE `import_mappings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`label` text NOT NULL UNIQUE,
	`category_id` integer NOT NULL
);

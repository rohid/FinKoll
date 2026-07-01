ALTER TABLE `electricity_readings` ADD COLUMN `price_per_kwh` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `electricity_readings` ADD COLUMN `vat_pct` real DEFAULT 25 NOT NULL;

ALTER TABLE `transaction_items` ADD COLUMN `house_id` integer REFERENCES houses(id);

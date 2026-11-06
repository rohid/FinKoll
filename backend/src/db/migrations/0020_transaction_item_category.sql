ALTER TABLE `transaction_items` ADD COLUMN `category_id` integer REFERENCES categories(id);

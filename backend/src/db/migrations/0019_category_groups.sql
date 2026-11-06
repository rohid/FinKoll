CREATE TABLE `category_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`color` text DEFAULT '#6366f1' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
INSERT INTO `category_groups` (`name`, `type`, `color`, `sort_order`) VALUES
	('Salary', 'INCOME', '#22c55e', 1),
	('Reimbursements', 'INCOME', '#16a34a', 2),
	('Transfers In', 'INCOME', '#15803d', 3),
	('Other Income', 'INCOME', '#4ade80', 4),
	('Housing', 'EXPENSE', '#ef4444', 5),
	('Food', 'EXPENSE', '#eab308', 6),
	('Transport', 'EXPENSE', '#84cc16', 7),
	('Bills & Subscriptions', 'EXPENSE', '#f59e0b', 8),
	('Other Expenses', 'EXPENSE', '#6b7280', 9),
	('Investments', 'SAVINGS', '#3b82f6', 10),
	('Goals', 'SAVINGS', '#06b6d4', 11),
	('Personal', 'SAVINGS', '#a855f7', 12);
--> statement-breakpoint
ALTER TABLE `categories` ADD COLUMN `group_id` integer REFERENCES category_groups(id);
--> statement-breakpoint
UPDATE `categories` SET `group_id` = (
	SELECT g.id FROM `category_groups` g
	WHERE g.type = categories.type AND g.name = (
		CASE
			WHEN categories.type = 'INCOME'  AND categories.subtype = 'SALARY'            THEN 'Salary'
			WHEN categories.type = 'INCOME'  AND categories.subtype = 'EXPENSE_PAYMENT'   THEN 'Reimbursements'
			WHEN categories.type = 'INCOME'  AND categories.subtype = 'SAVINGS_INJECTION' THEN 'Transfers In'
			WHEN categories.type = 'INCOME'                                               THEN 'Other Income'
			WHEN categories.type = 'EXPENSE' AND categories.is_housing = 1                THEN 'Housing'
			WHEN categories.type = 'EXPENSE' AND (lower(categories.name) LIKE '%grocer%' OR lower(categories.name) LIKE '%food%') THEN 'Food'
			WHEN categories.type = 'EXPENSE' AND (lower(categories.name) LIKE '%transport%' OR lower(categories.name) LIKE '%travel%') THEN 'Transport'
			WHEN categories.type = 'EXPENSE' AND (categories.subtype = 'BILL' OR lower(categories.name) LIKE '%subscri%') THEN 'Bills & Subscriptions'
			WHEN categories.type = 'EXPENSE'                                              THEN 'Other Expenses'
			WHEN categories.type = 'SAVINGS' AND (categories.subtype = 'STOCK' OR lower(categories.name) LIKE '%stock%' OR lower(categories.name) LIKE '%invest%') THEN 'Investments'
			WHEN categories.type = 'SAVINGS' AND categories.subtype IN ('PERSONAL_A', 'PERSONAL_B') THEN 'Personal'
			WHEN categories.type = 'SAVINGS'                                              THEN 'Goals'
		END
	)
);

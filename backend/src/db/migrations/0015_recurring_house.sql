ALTER TABLE `recurring_templates` ADD COLUMN `house_id` integer REFERENCES houses(id);--> statement-breakpoint
UPDATE `recurring_templates`
SET `house_id` = COALESCE(
  (SELECT h.id FROM houses h
     JOIN app_settings s ON s.key = 'primary_house_id' AND CAST(s.value AS INTEGER) = h.id),
  (SELECT id FROM houses ORDER BY sort_order ASC LIMIT 1)
)
WHERE house_id IS NULL
  AND category_id IN (SELECT id FROM categories WHERE is_housing = 1)
  AND (SELECT COUNT(*) FROM houses) > 0;

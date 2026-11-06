# Data model & analysis

How FinKoll stores money and what the analysis views bucket on. Companion to
`market-data-providers.md`. Kept current as the data-quality work lands (see the
plan in this repo's history / `squishy-finding-corbato`).

## Core tables (`backend/src/db/schema.ts`)

- **`category_groups`** — the canonical taxonomy (Housing, Food, Investments, …) per
  type. **`categories`** roll up into one via `groupId` (nullable). Seeded + backfilled
  from the legacy `subtype` code by migration `0019`; `subtype` is now deprecated and
  read by nothing.
- **`categories`** — `name`, `type` (`INCOME` | `EXPENSE` | `SAVINGS`), `groupId`,
  `color`, `sortOrder`, `isActive`, `isHousing`.
- **`transactions`** — `date` (YYYY-MM-DD), `description`, `amount`, `categoryId`,
  `personId` (attribution, nullable), `payee` (nullable), `notes`, `houseId`, and the
  recurring-instance link. Amounts are stored as **positive magnitudes**; direction
  comes from the category's `type` (net = income − expenses − savings). A zero amount
  is rejected at the route.
- **`transaction_items`** — split lines (`description`, `amount`, `houseId`,
  `categoryId`). A line counts under `categoryId ?? parent.categoryId`; see the
  line-aware allocation below.
- **`tags`** + **`transaction_tags`** — orthogonal many-to-many labels.
- **`people`** — household members a transaction can be attributed to.
- **`budget_plans`**, **`recurring_templates`**, **`import_mappings`** — all key off
  `categoryId`; the merge endpoint repoints these (plus `transaction_items`).

## How analysis buckets (`backend/src/services/{summary,insights}.ts`)

- **Line-aware category allocation** — `getCategoryContributions(from, to)` is the
  shared primitive: a transaction counts under its own category **unless** one of its
  split lines carries an explicit `categoryId`, in which case each line counts under
  `line.categoryId ?? parent.categoryId`. The "only when a line has a category" rule
  means a transaction with no categorised line contributes exactly its own amount
  under its own category — identical to a plain `SUM(amount)` — so existing totals
  never move until a line is actually categorised. `getMonthlySummary`,
  `getYearlySummary`, template signals and the savings breakdown all go through it.
- **Groups** — `rollupGroups` / the yearly group rows aggregate category totals into
  `category_groups` (ungrouped categories bucket under a synthetic "Ungrouped" per
  type, so group totals always reconcile to category totals).
- **Housing** — `getHousingContributions` sums each split line under
  `line.houseId ?? transaction.houseId` for the primary home.
- **Data Health** — `getDataHealth()` is a read-only review queue (negative amounts,
  ungrouped/duplicate/unused categories, split mismatches, housing-unassigned).

## Data-quality constraints — addressed

1. ~~Category is the only axis~~ → category **groups** add a rollup axis; **tags** and
   **person/payee** add orthogonal dimensions.
2. ~~No sign discipline~~ → zero rejected at the route; negatives flagged in Data Health
   and warned at entry.
3. ~~Split lines carry no category~~ → `transaction_items.category_id`, line-aware.
4. ~~No per-person dimension~~ → `people` + `transactions.person_id` + the assistant's
   `get_income_by_person` tool.
Duplicates are collapsed with the category **merge** endpoint
(`POST /categories/:id/merge`).

## Migrations

Manual, append-only. Never edit a deployed migration (Drizzle keys by the `when`
timestamp in `meta/_journal.json` and skips already-applied ones → schema drift).
Add a new `NNNN_*.sql` plus a journal entry with the next ascending `idx`/`when`.

# Changelog

All notable changes to FinKoll are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.2.0] — 2026-11-06

### Added
- **Themes, dark mode & custom backgrounds.** A proper appearance system in
  Settings → Appearance:
  - **Light / Dark / Auto** theme modes — dark mode is now actually wired (it existed
    in the stylesheet but was never switched on; Auto follows your OS setting live).
  - **Accent palettes** — Nordic, Evergreen, Graphite, Sunset and Plum, plus a
    **custom-hue** picker — recolour the whole app instantly.
  - **Backgrounds** — subtle built-in styles (Aurora, Mist, Dunes, Topo) or your own
    **uploaded photo**, always dimmed by an adaptive scrim (capped visibility) with
    cards kept fully opaque, so clarity never suffers.
  - All choices **persist server-side** and sync across devices, applied before first
    paint so there's no flash.
- **Data quality — category groups, tags, people & a review queue.** A pass to make
  the numbers trustworthy and the analysis richer:
  - **Category groups** — a canonical set of groups (Housing, Food, Transport,
    Investments, …) that categories roll up into, so you get a coarse axis above the
    free-form category. Analytics gains a **Spending by group** breakdown and the
    Yearly/monthly summaries carry group subtotals. Assign a category's group in
    Settings. (Revives the previously unused `subtype` field.)
  - **Split lines can carry their own category** — a single receipt can be split
    across categories (groceries + household) so each part lands in the right total.
    Totals for everything already entered are unchanged until you actually categorise
    a line.
  - **Tags** — orthogonal labels (e.g. *reimbursable*, *work*) you can attach to any
    transaction, managed in Settings.
  - **People / payee** — attribute a transaction to a **person** (so *one* person's
    salary is a first-class figure, not a text match) and record a **payee**. The
    assistant can answer "how much is X's salary" exactly via a new attribution tool.
  - **Strict input guardrails** — a zero amount is rejected, and the entry form warns
    (without blocking) on a likely duplicate or a negative expense (a refund).
  - **Data Health** — a new page listing data-quality issues (negative amounts,
    categories with no group, duplicate category names, splits that don't add up,
    housing costs with no house, unused categories), each linking to its fix. Nothing
    is changed automatically.
  - **Merge categories** — collapse a duplicate category into another from Settings;
    all its transactions, budgets and templates move over and the source is hidden.
- **Experimental modules marked** — Investments, the Assistant and Worksheets now carry
  a "Beta" badge and a one-line note, separating them from the stable modules.
- **Assistant (financial copilot)** — a single natural-language chat to **query and add
  data**. Ask open-ended questions ("what's our net worth?", "average monthly electricity
  use?", "how much do we spend on X per month?") or add entries in plain language ("add this
  month's main-house mortgage, 2 500 kr"). The model only **routes**: numbers are computed by
  FinKoll (never invented), analysis it can't cover runs as **read-only SQL** over your own DB
  (writes/DDL rejected by SQLite's own classification, same guard as the SQL console), and every
  write is a **draft you confirm** before anything is saved (no deletes). There's also an
  **inline quick-add** on the Monthly page — type an entry in words ("groceries 850") and it
  drafts a transaction for the month you're viewing. The **AI provider is
  pluggable** (Settings): off by default, a **cloud key (Claude)** or a **local model (Ollama**
  on a box you run — the Pi stays unloaded), with an offline rule-based mode for trying it
  without a model. The API key lives in the encrypted DB and is never returned to the browser;
  cloud use carries an explicit data-egress notice.
- **Pension** — a dedicated **Pension** page for manually tracking pension capital,
  typically pasted from **minpension.se**. Holdings are grouped into the three Swedish
  buckets (**allmän / tjänste / privat**) with per-bucket and grand totals, an optional
  **projected monthly payout**, a **value-over-time** chart, and a **paste importer**
  (one holding per line). Each time you update a value a snapshot is recorded, and a
  **monthly movement** table shows the month-over-month change (kr and %) with the
  current total. Pension is **capital / net worth**, not monthly cash flow, so it is
  kept out of the budget's income − expenses − savings net result (and is no longer
  shown in the Yearly overview — it lives on this page). *Future:* withdrawal/takeout
  planning.
- **Net worth & home equity** — the Pension page is now the net-worth hub: **net worth
  = investments + pension capital + home equity**. Each property can be given a
  **market value** and **your ownership share** (e.g. 50% for a co-owned home), and
  mortgages are **assigned to the property they're secured on**, so your equity =
  **(market value − that property's loan) × your share**. Only valued properties count
  toward net worth.
- **Housing costs (boendekostnader)** — track the recurring cost of your *primary
  home*, separated from everything else. Each transaction can be assigned to a
  **house/property** (reusing the houses from the Electricity module); housing costs =
  the transactions of the **primary residence** (chosen on the Housing page). One
  shared category per cost type — housing-type categories (Rent/Electricity/Insurance)
  default new transactions to the primary house, and you re-assign the country house's
  ones per transaction. Surfaced on the Monthly view (KPI + breakdown), the Yearly view
  (a Housing table in the summary and a subtotal row in the detailed matrix), and a
  dedicated **Housing** page.
- Housing costs support **split lines across houses**: a single bill (e.g. one
  electricity payment covering two homes) can be split, with each line assigned to its
  own house (defaulting to the transaction's house). Housing costs then count only the
  primary-home portion of the split — the country-home line is excluded — while the
  transaction stays one entry with one total.
- **Recurring templates can be assigned a house** (main house, country house, or
  *general* when left unset). Generated instances inherit the template's house, so
  recurring housing costs land on the right property automatically. Housing-type
  categories default a new template to the primary residence; existing housing
  templates are migrated to the primary residence so current behaviour is preserved.
- Monthly view: a **search box** on the transaction list — filters by description,
  category, notes, split-item text, or amount (duplicate detection stays on the
  full list).
- **Investments** — track your portfolio of stocks/funds with live-ish gain/loss.
  Add holdings (with symbol autocomplete), and quotes + FX are pulled and converted
  to **SEK**; see per-position and total gain/loss, day change, and a
  **performance-over-time** chart (from daily portfolio snapshots).
- Investments use a **pluggable market-data provider**: **Yahoo Finance**
  (`yahoo-finance2`, free, no key — quotes/FX/fundamentals/history, delayed/EOD) by
  default, or a **manual** provider (prices you enter) for a fully offline/private
  setup. The source is swappable via a settings key with no code change, and the
  provider interface leaves a seam for future sources (e.g. a broker portfolio
  import). Automatic quote refresh is opt-in (`INVESTMENTS_AUTO_REFRESH`).
- Investments **analysis** — a sortable **Analysis** tab with three category views:
  **Valuation** (P/E, P/B, dividend yield; cheap-looking rows highlighted),
  **Debt** (debt/equity, market cap; high-leverage rows highlighted), and
  **Performance** (1M / 3M / 1Y returns plus total gain). Fundamentals come from the
  active provider and refresh with prices.
- Mortgage **loan groups** (by house/object/type): combined total loan, blended
  interest rate with the spread shown when rates diverge, and total monthly cost.
  Grouping is done by **selection** — hit *Group loans*, tick the ones to combine,
  name the group, and confirm. Loans can be removed from a group or ungrouped again.
- Mortgage **group projection**: combined monthly cost and remaining balance at
  1, 5, and 10 years, and how much has been paid down.
- Forecasting is now **group-level** for grouped loans, with a choice of **one
  forecast for the whole group** (the default — the group is planned as a single
  loan at the blended rate and combined amortization) or **per loan**. Ungrouped
  loans keep their own per-card forecast. The group forecast (mode + planned
  changes) is persisted in app settings.
- Mortgage **payment forecast**: plan future changes to the rate and/or the fixed
  monthly amortization, see the impact on monthly payment, total interest, and
  payoff time, and **save the forecast** (persisted per mortgage).

### Changed
- **Monthly view decluttered — data entry separated from display.** Adding and editing
  a transaction now happen in a focused **slide-over panel** (with the natural-language
  quick-add alongside the full form), and the secondary month actions (apply recurring,
  clear month, lock) collapse into a single **⋯ menu**. The planned-vs-actual budget
  tables and the housing-cost breakdown — which duplicated the Dashboard — have moved
  entirely to the **Dashboard** (also monthly), leaving Monthly a clean, full-width
  **transaction statement** with type filters (income / expenses / savings) and search.
  The KPI summary row is unchanged.
- **Dashboard is now display-only.** Removed the inline add-transaction form (entry lives
  in the Monthly drawer) and added the monthly **housing-cost** card.
- **Experimental modules grouped in the nav.** The Assistant, Worksheets and Investments
  modules now fold into a single collapsible **Beta** group in the sidebar and mobile
  drawer (collapsed by default, auto-expanded while you're on one of those pages), instead
  of being scattered through the list with inline badges.
- Mortgage now uses a **fixed-amortization** model throughout (total = interest +
  fixed monthly amortization); the summary card and forecast speak one model.
- The manual mortgage field is now the **monthly amortization** (excl. interest),
  not a full-payment override.

### Migrations
- `0009_mortgage_forecast` — adds a nullable `forecast` column to `mortgages`.
- `0010_mortgage_group` — adds a nullable `group_name` column to `mortgages`.
- `0011_investments` — adds `holdings`, `holding_provider_symbols`,
  `holding_quotes`, and `portfolio_snapshots` tables.
- `0012_fundamentals` — adds a `fundamentals` table for the analysis views.
- `0013_housing_costs` — adds a `house_id` column to `transactions` and an
  `is_housing` column to `categories`.
- `0014_item_house` — adds a nullable `house_id` column to `transaction_items`,
  so split lines can each belong to their own house.
- `0015_recurring_house` — adds a nullable `house_id` column to
  `recurring_templates`, and backfills existing housing-type templates to the
  primary residence.
- `0016_pension` — adds `pension_holdings` and `pension_snapshots` tables.
- `0017_house_networth` — adds `valuation`, `valuation_as_of` and `ownership_pct` to
  `houses`, and `house_id` to `mortgages` (for the home-equity net-worth calculation).
- `0018_assistant_history` — adds `assistant_messages` (persisted copilot chat history).
  (All run automatically on startup after a pre-migration backup.)

## [1.0.0] — 2026-07-01

First public release.

### Added
- Monthly & yearly budgeting with planned-vs-actual variance and net result
- Recurring templates (monthly / quarterly / semi-annual / yearly)
- Analytics: forecast, savings breakdown, category trends, and an electricity section
- Electricity module — Tibber-centric, auto-calculating, multi-house, EV share
- Mortgage tracker with rate-change scenarios
- Worksheets — custom spreadsheets (HyperFormula) with a live FinKoll-data bridge
- CSV import with remembered category mapping
- Read-only-friendly SQL console
- Multilingual UI (English, Swedish, Spanish) with browser-locale auto-detection
- Mobile-responsive layout (bottom tab bar + drawer)
- AES-256 encrypted database, JWT auth in httpOnly cookies, login lockout & rate limiting
- Automatic daily/weekly backups with pre-migration snapshots
- Interactive first-run setup script (`scripts/setup.sh` / `setup.ps1`)
- Docs: Getting Started (EN/SV/ES), visual runthrough, TLS/Let's Encrypt, cloud hosting, roadmap

[Unreleased]: https://github.com/rohid/FinKoll/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/rohid/FinKoll/compare/v1.0.0...v1.2.0
[1.0.0]: https://github.com/rohid/FinKoll/releases/tag/v1.0.0

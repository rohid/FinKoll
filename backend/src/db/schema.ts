import { sqliteTable, text, integer, real, primaryKey } from "drizzle-orm/sqlite-core";

// ── Category groups (canonical taxonomy) ─────────────────────────────────────────
// A small, curated set of groups per type (Housing, Food, Transport, Investments…)
// that categories roll up into, so analysis has a coarse axis above the free-form
// category. Replaces the dormant `categories.subtype` as the grouping dimension.
export const categoryGroups = sqliteTable("category_groups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type", { enum: ["INCOME", "EXPENSE", "SAVINGS"] }).notNull(),
  color: text("color").notNull().default("#6366f1"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type", { enum: ["INCOME", "EXPENSE", "SAVINGS"] }).notNull(),
  // Legacy grouping code (SALARY, BILL, …). Superseded by groupId; kept for back-
  // compat and the group backfill. No analysis reads it.
  subtype: text("subtype").notNull().default("OTHER"),
  // Canonical group this category rolls up into (null = ungrouped; surfaced in Data
  // Health for the user to assign).
  groupId: integer("group_id").references(() => categoryGroups.id),
  color: text("color").notNull().default("#6366f1"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  // Housing-type category (rent, electricity, insurance…): new transactions here
  // default to the primary house so they count toward housing costs.
  isHousing: integer("is_housing", { mode: "boolean" }).notNull().default(false),
});

export const budgetPlans = sqliteTable("budget_plans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  categoryId: integer("category_id")
    .notNull()
    .references(() => categories.id),
  plannedAmount: real("planned_amount").notNull().default(0),
});

// ── People (income/expense attribution) ─────────────────────────────────────────
// A household member (or other party) a transaction can be attributed to, so e.g.
// one person's salary is a first-class filter rather than a free-text match.
export const people = sqliteTable("people", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ── Tags (orthogonal labels) ────────────────────────────────────────────────────
// A cross-cutting label independent of category (e.g. "reimbursable", "work",
// "vacation-2026"). Many-to-many with transactions via transaction_tags.
export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#6366f1"),
});

export const transactionTags = sqliteTable("transaction_tags", {
  transactionId: integer("transaction_id").notNull().references(() => transactions.id, { onDelete: "cascade" }),
  tagId: integer("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
}, (t) => ({ pk: primaryKey({ columns: [t.transactionId, t.tagId] }) }));

export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(), // ISO date string YYYY-MM-DD
  description: text("description").notNull(),
  amount: real("amount").notNull(),
  categoryId: integer("category_id")
    .notNull()
    .references(() => categories.id),
  // Who this transaction is attributed to (null = household/shared).
  personId: integer("person_id").references(() => people.id),
  // Counterparty / merchant, free text (null = none).
  payee: text("payee"),
  notes: text("notes"),
  isRecurringInstance: integer("is_recurring_instance", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  recurringTemplateId: integer("recurring_template_id"),
  // Which property this cost belongs to (null = not tied to a house). Housing costs
  // for the primary home = transactions whose houseId is the primary house.
  houseId: integer("house_id").references(() => houses.id),
});

export const recurringTemplates = sqliteTable("recurring_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  description: text("description").notNull(),
  amount: real("amount").notNull(),
  categoryId: integer("category_id")
    .notNull()
    .references(() => categories.id),
  frequency: text("frequency", { enum: ["MONTHLY", "BIMONTHLY", "QUARTERLY", "HALFYEARLY", "YEARLY"] })
    .notNull()
    .default("MONTHLY"),
  activeFromYear: integer("active_from_year").notNull(),
  activeFromMonth: integer("active_from_month").notNull(),
  activeToYear: integer("active_to_year"),
  activeToMonth: integer("active_to_month"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  // Which property this recurring cost belongs to (null = general / not tied to a
  // house). Generated instances inherit this house.
  houseId: integer("house_id").references(() => houses.id),
});

export const transactionItems = sqliteTable("transaction_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  transactionId: integer("transaction_id")
    .notNull()
    .references(() => transactions.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  amount: real("amount").notNull(),
  // Which property this split line belongs to. null = inherit the parent
  // transaction's houseId. Lets one bill (e.g. electricity) be split across houses.
  houseId: integer("house_id").references(() => houses.id),
  // Which category this split line counts under. null = inherit the parent
  // transaction's category. Lets one receipt (e.g. a shop run) split across
  // categories (groceries + household) so each lands in the right total.
  categoryId: integer("category_id").references(() => categories.id),
});

export const houses = sqliteTable("houses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  // Net-worth inputs (manual, like a minpension estimate). valuation null = not
  // tracked for net worth. ownershipPct is your share of the property (e.g. 50
  // for a co-owned home); it scales the whole position — value minus mortgage.
  valuation: real("valuation"),
  valuationAsOf: text("valuation_as_of"),
  ownershipPct: real("ownership_pct").notNull().default(100),
});

export const mortgages = sqliteTable("mortgages", {
  id:                      integer("id").primaryKey({ autoIncrement: true }),
  name:                    text("name").notNull(),
  principalAmount:         real("principal_amount").notNull(),
  interestRate:            real("interest_rate").notNull(),        // annual %, e.g. 4.5
  amortizationYears:       integer("amortization_years").notNull().default(25),
  monthlyPaymentOverride:  real("monthly_payment_override"),       // null = use formula
  effectiveFrom:           text("effective_from").notNull(),       // YYYY-MM-DD
  notes:                   text("notes"),
  forecast:                text("forecast"),                       // JSON array of saved rate/amortization changes
  groupName:               text("group_name"),                    // group loans by house/object/type
  houseId:                 integer("house_id").references(() => houses.id), // which property this loan is secured on (net worth)
});

export const importMappings = sqliteTable("import_mappings", {
  id:         integer("id").primaryKey({ autoIncrement: true }),
  label:      text("label").notNull().unique(),   // normalized source row label
  categoryId: integer("category_id").notNull(),
});

export const monthLocks = sqliteTable("month_locks", {
  year:     integer("year").notNull(),
  month:    integer("month").notNull(),
  lockedAt: text("locked_at").notNull(),
});

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const worksheets = sqliteTable("worksheets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("Worksheet"),
  // Serialized sheet: JSON { v, rows, cols, cells } stored as text.
  data: text("data").notNull().default("{}"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ── Investments ───────────────────────────────────────────────────────────────
// A held position. `isin` is the stable cross-provider key; `symbol` is the
// provider-facing ticker (e.g. Yahoo `VOLV-B.ST`). `manualPrice` feeds the
// offline ManualProvider when no external quote is fetched.
export const holdings = sqliteTable("holdings", {
  id:          integer("id").primaryKey({ autoIncrement: true }),
  name:        text("name").notNull(),
  isin:        text("isin"),
  symbol:      text("symbol"),
  assetType:   text("asset_type", { enum: ["STOCK", "FUND", "ETF", "OTHER"] }).notNull().default("STOCK"),
  quantity:    real("quantity").notNull().default(0),
  avgCost:     real("avg_cost").notNull().default(0),   // per share, native currency
  currency:    text("currency").notNull().default("SEK"),
  manualPrice: real("manual_price"),                     // per share, native currency
  source:      text("source").notNull().default("MANUAL"), // MANUAL | NORDNET | ...
  sortOrder:   integer("sort_order").notNull().default(0),
  notes:       text("notes"),
});

// Caches each provider's resolved symbol for a holding, so switching providers
// re-resolves from ISIN rather than forcing the user to re-enter tickers.
export const holdingProviderSymbols = sqliteTable("holding_provider_symbols", {
  id:         integer("id").primaryKey({ autoIncrement: true }),
  holdingId:  integer("holding_id").notNull().references(() => holdings.id, { onDelete: "cascade" }),
  providerId: text("provider_id").notNull(),
  symbol:     text("symbol").notNull(),
  resolvedAt: text("resolved_at").notNull(),
});

// Latest cached quote per holding (one row per holding, upserted on refresh).
export const holdingQuotes = sqliteTable("holding_quotes", {
  holdingId:      integer("holding_id").primaryKey().references(() => holdings.id, { onDelete: "cascade" }),
  price:          real("price").notNull().default(0),        // per share, native currency
  currency:       text("currency").notNull().default("SEK"),
  changePct:      real("change_pct").notNull().default(0),   // day change %
  dayChange:      real("day_change").notNull().default(0),   // day change, native per share
  fxToSek:        real("fx_to_sek").notNull().default(1),
  marketValueSek: real("market_value_sek").notNull().default(0),
  asOf:           text("as_of").notNull(),                   // ISO timestamp
});

// Daily total-portfolio snapshot for the performance-over-time chart.
export const portfolioSnapshots = sqliteTable("portfolio_snapshots", {
  date:          text("date").primaryKey(),                  // YYYY-MM-DD
  totalValueSek: real("total_value_sek").notNull().default(0),
  totalCostSek:  real("total_cost_sek").notNull().default(0),
  gainSek:       real("gain_sek").notNull().default(0),
});

// Latest fundamentals per holding (for the analysis views: undervalued / debt).
// All ratios nullable — providers may not have every field for every instrument.
export const fundamentals = sqliteTable("fundamentals", {
  holdingId:     integer("holding_id").primaryKey().references(() => holdings.id, { onDelete: "cascade" }),
  pe:            real("pe"),
  pb:            real("pb"),
  dividendYield: real("dividend_yield"),   // fraction, e.g. 0.037
  debtEquity:    real("debt_equity"),       // debt as % of equity (Yahoo debtToEquity)
  marketCap:     real("market_cap"),
  currency:      text("currency"),
  asOf:          text("as_of").notNull(),
});

export const electricityReadings = sqliteTable("electricity_readings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  houseId: integer("house_id")
    .notNull()
    .references(() => houses.id),
  gridSubscriptionFee: real("grid_subscription_fee").notNull().default(0),
  transferRatePerKwh: real("transfer_rate_per_kwh").notNull().default(0),
  totalKwh: real("total_kwh").notNull().default(0),
  energyTaxPerKwh: real("energy_tax_per_kwh").notNull().default(0),
  // Tibber-centric model: the supplier (Tibber) total is entered directly,
  // incl. VAT/fees; the grid side is computed from the rates + VAT %.
  pricePerKwh: real("price_per_kwh").notNull().default(0), // legacy, unused
  tibberTotal: real("tibber_total").notNull().default(0),
  vatPct: real("vat_pct").notNull().default(25),
  evKwh: real("ev_kwh").notNull().default(0),
  evCostVattenfall: real("ev_cost_vattenfall").notNull().default(0),
  evCostTibber: real("ev_cost_tibber").notNull().default(0),
  evVat: real("ev_vat").notNull().default(0),
  // Computed columns stored for fast reporting
  transferCost: real("transfer_cost").notNull().default(0),
  energyTaxTotal: real("energy_tax_total").notNull().default(0),
  vattenfallTotal: real("vattenfall_total").notNull().default(0),
  evTotal: real("ev_total").notNull().default(0),
  totalBill: real("total_bill").notNull().default(0),
});

// ── Pension ────────────────────────────────────────────────────────────────────
// Manual pension capital, typically copied from minpension.se: one row per pension
// holding, grouped into the three Swedish buckets (allmän / tjänste / privat). This
// is net-worth/capital, not cash-flow — it never enters the monthly budget math.
export const pensionHoldings = sqliteTable("pension_holdings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  // ALLMAN = public pension, TJANSTE = occupational, PRIVAT = private savings
  type: text("type", { enum: ["ALLMAN", "TJANSTE", "PRIVAT"] }).notNull().default("TJANSTE"),
  manager: text("manager"),                              // e.g. Alecta, AMF, Avanza
  currentValue: real("current_value").notNull().default(0),
  projectedMonthlyPayout: real("projected_monthly_payout"), // minpension's forecast
  sortOrder: integer("sort_order").notNull().default(0),
  notes: text("notes"),
  asOf: text("as_of"),                                   // date the figure was read (YYYY-MM-DD)
});

// Total-capital snapshot over time, upserted whenever holdings change, for the
// value-over-time chart (mirrors portfolio_snapshots).
export const pensionSnapshots = sqliteTable("pension_snapshots", {
  date: text("date").primaryKey(),                       // YYYY-MM-DD
  totalValueSek: real("total_value_sek").notNull().default(0),
});

// ── Assistant (financial copilot) ───────────────────────────────────────────────
// Persisted chat history for the natural-language assistant so the conversation
// survives reloads. Content is plain text (the model's visible turns); tool-call
// plumbing is not persisted. Lives in the encrypted DB like everything else.
export const assistantMessages = sqliteTable("assistant_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull(),               // ISO timestamp
});

import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type", { enum: ["INCOME", "EXPENSE", "SAVINGS"] }).notNull(),
  subtype: text("subtype").notNull().default("OTHER"),
  color: text("color").notNull().default("#6366f1"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
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

export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(), // ISO date string YYYY-MM-DD
  description: text("description").notNull(),
  amount: real("amount").notNull(),
  categoryId: integer("category_id")
    .notNull()
    .references(() => categories.id),
  notes: text("notes"),
  isRecurringInstance: integer("is_recurring_instance", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  recurringTemplateId: integer("recurring_template_id"),
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
});

export const transactionItems = sqliteTable("transaction_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  transactionId: integer("transaction_id")
    .notNull()
    .references(() => transactions.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  amount: real("amount").notNull(),
});

export const houses = sqliteTable("houses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
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

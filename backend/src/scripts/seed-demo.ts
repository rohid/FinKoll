#!/usr/bin/env tsx
/**
 * seed-demo.ts
 *
 * Builds a complete, fully-synthetic demo dataset covering EVERY module, for
 * documentation screenshots and local trials. All figures are made up; no real
 * personal or financial data is used. Safe to run against a throwaway database.
 *
 * It populates:
 *   - A year of budget data (transactions, budget plans, recurring templates)
 *   - Electricity readings (Tibber-style) for the primary house
 *   - Housing: the primary residence + house-assigned housing costs
 *   - Mortgage: two grouped loans secured on the house (+ a market valuation)
 *   - Investments: holdings (manual prices), fundamentals, a value history
 *   - Pension: holdings across the three Swedish buckets + a value history
 *   - A sample worksheet
 *
 * It CLEARS the modules it owns before inserting, so it is safe to re-run.
 * Categories, houses and auth settings are preserved / created by the base seed.
 *
 * Run from backend/ with the app's env (DB_ENCRYPTION_KEY, etc.):
 *   npx tsx src/scripts/seed-demo.ts
 */
import "dotenv/config";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import path from "path";
import { db } from "../db";
import { seed } from "../db/seed";
import {
  categories, transactions, budgetPlans, recurringTemplates,
  electricityReadings, houses, mortgages,
  holdings, holdingQuotes, fundamentals, portfolioSnapshots,
  pensionHoldings, pensionSnapshots, worksheets, appSettings,
} from "../db/schema";

const YEAR = 2026;
const THROUGH_MONTH = 11; // seed Jan..Nov of the current demo year
const d = (y: number, m: number, day: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
const todayISO = () => new Date().toISOString();

// Per-month actuals (one household, synthetic). ep = bonus/refund income,
// si = transfer in from savings. All amounts in SEK.
type M = {
  month: number; salary: number; ep: number; si: number;
  rent: number; elec: number; ins: number; subs: number;
  groc: number; trans: number; other: number;
  stock: number; vac: number; spec: number; pa: number; pb: number;
};
const MONTHS: M[] = [
  { month: 1,  salary: 52000, ep: 0,     si: 0,    rent: 12500, elec: 2800, ins: 3200, subs: 850, groc: 8200,  trans: 2800, other: 1500,  stock: 5000,  vac: 2000, spec: 1500, pa: 2000, pb: 2000 },
  { month: 2,  salary: 52000, ep: 0,     si: 0,    rent: 12500, elec: 2500, ins: 3200, subs: 850, groc: 7800,  trans: 2600, other: 800,   stock: 5000,  vac: 2000, spec: 1500, pa: 2000, pb: 2000 },
  { month: 3,  salary: 52000, ep: 8500,  si: 0,    rent: 12500, elec: 2000, ins: 3200, subs: 850, groc: 8500,  trans: 3200, other: 2200,  stock: 8000,  vac: 2000, spec: 1500, pa: 2000, pb: 2000 },
  { month: 4,  salary: 52000, ep: 0,     si: 0,    rent: 12500, elec: 1200, ins: 3200, subs: 850, groc: 7500,  trans: 2500, other: 1800,  stock: 5000,  vac: 2000, spec: 1500, pa: 2000, pb: 2000 },
  { month: 5,  salary: 52000, ep: 0,     si: 0,    rent: 12500, elec: 800,  ins: 3200, subs: 850, groc: 7800,  trans: 2800, other: 3500,  stock: 5000,  vac: 2000, spec: 1500, pa: 2000, pb: 2000 },
  { month: 6,  salary: 52000, ep: 3500,  si: 0,    rent: 12500, elec: 600,  ins: 3200, subs: 850, groc: 9200,  trans: 3500, other: 4500,  stock: 5000,  vac: 2000, spec: 1500, pa: 2000, pb: 2000 },
  { month: 7,  salary: 52000, ep: 0,     si: 8000, rent: 12500, elec: 550,  ins: 3200, subs: 850, groc: 10500, trans: 4200, other: 12000, stock: 3000,  vac: 0,    spec: 0,    pa: 1000, pb: 1000 },
  { month: 8,  salary: 52000, ep: 0,     si: 0,    rent: 12500, elec: 600,  ins: 3200, subs: 850, groc: 8500,  trans: 2800, other: 2500,  stock: 5000,  vac: 2000, spec: 1500, pa: 2000, pb: 2000 },
  { month: 9,  salary: 52000, ep: 0,     si: 0,    rent: 12500, elec: 900,  ins: 3200, subs: 850, groc: 7800,  trans: 2600, other: 1200,  stock: 5000,  vac: 2000, spec: 1500, pa: 2000, pb: 2000 },
  { month: 10, salary: 52000, ep: 2200,  si: 0,    rent: 12500, elec: 1400, ins: 3200, subs: 850, groc: 8000,  trans: 2700, other: 3500,  stock: 5000,  vac: 2000, spec: 1500, pa: 2000, pb: 2000 },
  { month: 11, salary: 52000, ep: 0,     si: 0,    rent: 12500, elec: 2200, ins: 3200, subs: 850, groc: 9500,  trans: 2500, other: 5000,  stock: 5000,  vac: 2000, spec: 1500, pa: 2000, pb: 2000 },
  { month: 12, salary: 52000, ep: 15000, si: 0,    rent: 12500, elec: 2800, ins: 3200, subs: 850, groc: 12000, trans: 2200, other: 8000,  stock: 10000, vac: 3000, spec: 2000, pa: 3000, pb: 3000 },
];

async function main() {
  migrate(db, { migrationsFolder: path.resolve(__dirname, "../db/migrations") });
  await seed();
  console.log("✓ migrations + base seed");

  // ── Clear the modules this script owns ──────────────────────────────────────
  db.delete(recurringTemplates).run();
  db.delete(budgetPlans).run();
  db.delete(transactions).run();
  db.delete(electricityReadings).run();
  db.delete(fundamentals).run();
  db.delete(holdingQuotes).run();
  db.delete(portfolioSnapshots).run();
  db.delete(holdings).run();
  db.delete(pensionSnapshots).run();
  db.delete(pensionHoldings).run();
  db.delete(mortgages).run();
  db.delete(worksheets).run();
  console.log("✓ cleared demo modules");

  // ── Category lookup ─────────────────────────────────────────────────────────
  const cats = db.select().from(categories).all();
  const C: Record<string, number> = Object.fromEntries(cats.map((c) => [c.name, c.id]));
  const need = [
    "Salary", "Expense Payment", "Savings Injection", "Rent / Mortgage", "Electricity",
    "Insurance", "Subscriptions", "Groceries", "Transport", "Other Expenses",
    "Stock Savings", "Vacation Savings", "Specific Savings",
    "Personal Savings (Person A)", "Personal Savings (Person B)",
  ];
  for (const n of need) if (!C[n]) throw new Error(`Missing category "${n}" — run the app once to seed categories.`);

  // Mark the housing-cost categories so they roll up on the Housing page.
  for (const n of ["Rent / Mortgage", "Electricity", "Insurance"]) {
    db.update(categories).set({ isHousing: true }).where(eq(categories.id, C[n])).run();
  }

  const HOUSE = 1; // "Main House" from the base seed
  const tx = (date: string, description: string, amount: number, categoryId: number, opts: { notes?: string; houseId?: number } = {}) =>
    db.insert(transactions).values({
      date, description, amount, categoryId,
      notes: opts.notes ?? null, isRecurringInstance: 0, houseId: opts.houseId ?? null,
    } as any).run();

  // ── Recurring templates ─────────────────────────────────────────────────────
  const recur = [
    { description: "Salary",                 amount: 52000, cat: "Salary",                      house: null },
    { description: "Rent / Mortgage",        amount: 12500, cat: "Rent / Mortgage",             house: HOUSE },
    { description: "Home & car insurance",   amount: 3200,  cat: "Insurance",                   house: HOUSE },
    { description: "Streaming & internet",   amount: 850,   cat: "Subscriptions",               house: null },
    { description: "Stock savings transfer", amount: 5000,  cat: "Stock Savings",               house: null },
    { description: "Vacation savings",       amount: 2000,  cat: "Vacation Savings",            house: null },
    { description: "Specific savings",       amount: 1500,  cat: "Specific Savings",            house: null },
    { description: "Personal savings (A)",   amount: 2000,  cat: "Personal Savings (Person A)", house: null },
    { description: "Personal savings (B)",   amount: 2000,  cat: "Personal Savings (Person B)", house: null },
  ];
  for (const r of recur) {
    db.insert(recurringTemplates).values({
      description: r.description, amount: r.amount, categoryId: C[r.cat],
      frequency: "MONTHLY", activeFromYear: YEAR, activeFromMonth: 1, isActive: true,
      houseId: r.house,
    } as any).run();
  }

  // ── Budget plans + transactions (Jan..THROUGH_MONTH) ────────────────────────
  const plannedElec = [3000, 2800, 1800, 1000, 700, 500, 500, 500, 800, 1500, 2500, 3000];
  const epDesc: Record<number, string> = { 3: "Annual work bonus", 6: "Insurance refund", 10: "Tax refund", 12: "Christmas bonus" };

  for (const m of MONTHS.filter((x) => x.month <= THROUGH_MONTH)) {
    const mo = m.month;
    const plan = (cat: string, amt: number) => { if (amt > 0) db.insert(budgetPlans).values({ year: YEAR, month: mo, categoryId: C[cat], plannedAmount: amt }).run(); };
    plan("Salary", 52000); plan("Rent / Mortgage", 12500); plan("Electricity", plannedElec[mo - 1]);
    plan("Insurance", 3200); plan("Subscriptions", 900); plan("Groceries", 8000); plan("Transport", 2500);
    plan("Other Expenses", 2000); plan("Stock Savings", 5000); plan("Vacation Savings", 2000);
    plan("Specific Savings", 1500); plan("Personal Savings (Person A)", 2000); plan("Personal Savings (Person B)", 2000);

    // Income
    tx(d(YEAR, mo, 25), "Salary — monthly pay", m.salary, C["Salary"]);
    if (m.ep > 0) tx(d(YEAR, mo, 15), epDesc[mo] ?? "Expense payment", m.ep, C["Expense Payment"]);
    if (m.si > 0) tx(d(YEAR, mo, 2), "Transfer from vacation savings", m.si, C["Savings Injection"], { notes: "Summer trip" });

    // Housing-tagged costs (house-assigned → counted on the Housing page)
    tx(d(YEAR, mo, 1), "Mortgage payment", m.rent, C["Rent / Mortgage"], { houseId: HOUSE });
    tx(d(YEAR, mo, 14), "Electricity bill", m.elec, C["Electricity"], { houseId: HOUSE });
    tx(d(YEAR, mo, 1), "Home insurance", 1800, C["Insurance"], { houseId: HOUSE });
    tx(d(YEAR, mo, 1), "Car insurance", 900, C["Insurance"]);
    tx(d(YEAR, mo, 5), "Life insurance", m.ins - 1800 - 900, C["Insurance"]);

    // Subscriptions
    tx(d(YEAR, mo, 3), "Streaming bundle", 408, C["Subscriptions"]);
    tx(d(YEAR, mo, 5), "Internet", 399, C["Subscriptions"]);
    if (m.subs - 408 - 399 > 0) tx(d(YEAR, mo, 8), "Mobile plan", m.subs - 408 - 399, C["Subscriptions"]);

    // Groceries — 4 weekly shops
    const w = Math.round(m.groc / 4);
    tx(d(YEAR, mo, 4), "Weekly groceries", w, C["Groceries"]);
    tx(d(YEAR, mo, 11), "Weekly groceries", w, C["Groceries"]);
    tx(d(YEAR, mo, 18), "Weekly groceries", w, C["Groceries"]);
    tx(d(YEAR, mo, 25), "Weekly groceries", m.groc - w * 3, C["Groceries"]);

    // Transport
    const fuel = Math.round(m.trans * 0.55), park = Math.round(m.trans * 0.2), transit = m.trans - fuel - park;
    if (transit > 0) tx(d(YEAR, mo, 2), "Transit card", transit, C["Transport"]);
    tx(d(YEAR, mo, 10), "Fuel", fuel, C["Transport"]);
    if (park > 0) tx(d(YEAR, mo, 15), "Parking & tolls", park, C["Transport"]);

    // Other
    tx(d(YEAR, mo, 10), "Miscellaneous", m.other, C["Other Expenses"]);

    // Savings
    if (m.stock > 0) tx(d(YEAR, mo, 28), "Stock savings transfer", m.stock, C["Stock Savings"]);
    if (m.vac > 0) tx(d(YEAR, mo, 28), "Vacation savings", m.vac, C["Vacation Savings"]);
    if (m.spec > 0) tx(d(YEAR, mo, 28), "Specific savings", m.spec, C["Specific Savings"]);
    if (m.pa > 0) tx(d(YEAR, mo, 28), "Personal savings — Person A", m.pa, C["Personal Savings (Person A)"]);
    if (m.pb > 0) tx(d(YEAR, mo, 28), "Personal savings — Person B", m.pb, C["Personal Savings (Person B)"]);
  }
  console.log("✓ budget: transactions, plans, recurring");

  // ── Electricity readings (Tibber-style) ─────────────────────────────────────
  const transferRatePerKwh = 0.25, energyTaxPerKwh = 0.535, gridSubscriptionFee = 150, vatPct = 25;
  db.insert(appSettings).values({
    key: "electricity_rates",
    value: JSON.stringify({ vatPct, shared: false, sharedSubscription: false, global: { transferRatePerKwh, energyTaxPerKwh }, perHouse: {} }),
  }).onConflictDoUpdate({ target: appSettings.key, set: { value: JSON.stringify({ vatPct, shared: false, sharedSubscription: false, global: { transferRatePerKwh, energyTaxPerKwh }, perHouse: {} }) } }).run();

  const elec = [
    { m: 1, kwh: 1850, tibber: 2100, ev: 380 }, { m: 2, kwh: 1720, tibber: 1850, ev: 360 },
    { m: 3, kwh: 1400, tibber: 1500, ev: 340 }, { m: 4, kwh: 1050, tibber: 900,  ev: 300 },
    { m: 5, kwh: 820,  tibber: 600,  ev: 280 }, { m: 6, kwh: 700,  tibber: 450,  ev: 260 },
    { m: 7, kwh: 680,  tibber: 420,  ev: 250 }, { m: 8, kwh: 720,  tibber: 460,  ev: 270 },
    { m: 9, kwh: 980,  tibber: 720,  ev: 300 }, { m: 10, kwh: 1300, tibber: 1150, ev: 340 },
    { m: 11, kwh: 1700, tibber: 1800, ev: 360 },
  ];
  for (const e of elec.filter((x) => x.m <= THROUGH_MONTH)) {
    const vatMul = 1 + vatPct / 100;
    const transferCost = e.kwh * transferRatePerKwh;
    const energyTaxTotal = e.kwh * energyTaxPerKwh;
    const gridExVat = transferCost + energyTaxTotal + gridSubscriptionFee;
    const gridTotal = gridExVat * vatMul;
    const totalBill = e.tibber + gridTotal;
    const evEnergy = e.kwh > 0 ? (e.ev / e.kwh) * e.tibber : 0;
    const evGrid = e.ev * (transferRatePerKwh + energyTaxPerKwh) * vatMul;
    db.insert(electricityReadings).values({
      year: YEAR, month: e.m, houseId: HOUSE,
      gridSubscriptionFee, transferRatePerKwh, totalKwh: e.kwh, energyTaxPerKwh,
      pricePerKwh: 0, tibberTotal: e.tibber, vatPct, evKwh: e.ev,
      evCostVattenfall: 0, evCostTibber: 0, evVat: 0,
      transferCost, energyTaxTotal, vattenfallTotal: gridExVat, evTotal: evEnergy + evGrid, totalBill,
    } as any).run();
  }
  console.log("✓ electricity readings");

  // ── House valuation (for net worth / home equity) ───────────────────────────
  db.update(houses).set({ valuation: 6_000_000, ownershipPct: 50, valuationAsOf: d(YEAR, 11, 1) }).where(eq(houses.id, HOUSE)).run();

  // ── Mortgage: two grouped loans secured on the house ────────────────────────
  db.insert(mortgages).values([
    { name: "Mortgage — SEB",           principalAmount: 1_800_000, interestRate: 3.9, amortizationYears: 40, monthlyPaymentOverride: 3500, effectiveFrom: d(YEAR, 1, 1), groupName: "Main House", houseId: HOUSE },
    { name: "Mortgage — Handelsbanken", principalAmount: 1_200_000, interestRate: 4.6, amortizationYears: 40, monthlyPaymentOverride: 2000, effectiveFrom: d(YEAR, 1, 1), groupName: "Main House", houseId: HOUSE },
  ] as any).run();
  console.log("✓ mortgage loans + valuation");

  // ── Investments: holdings (manual prices), fundamentals, value history ───────
  // Keep the default Yahoo market provider so the Analysis tab (which is gated on
  // the provider's `fundamentals` capability) shows the seeded fundamentals.
  // Prices still come from each holding's manualPrice until the user refreshes.
  db.insert(appSettings).values({ key: "investments_market_provider", value: "yahoo" })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: "yahoo" } }).run();

  const inv = [
    { name: "Investor B",                       symbol: "INVE-B.ST",     assetType: "STOCK", quantity: 150, avgCost: 240, manualPrice: 292, pe: 7.2,  pb: 1.3, dy: 0.021, de: 12, mc: 620e9 },
    { name: "Volvo B",                          symbol: "VOLV-B.ST",     assetType: "STOCK", quantity: 120, avgCost: 255, manualPrice: 283, pe: 11.5, pb: 2.1, dy: 0.045, de: 48, mc: 560e9 },
    { name: "Avanza Global",                    symbol: "",              assetType: "FUND",  quantity: 300, avgCost: 180, manualPrice: 221, pe: 22.0, pb: 3.1, dy: 0.012, de: 0,  mc: 0 },
    { name: "Spiltan Aktiefond Investmentbolag",symbol: "",              assetType: "FUND",  quantity: 220, avgCost: 95,  manualPrice: 112, pe: 9.0,  pb: 1.1, dy: 0.028, de: 20, mc: 8e9 },
    { name: "Xact Högutdelande",                symbol: "XACT-HDIV.ST",  assetType: "ETF",   quantity: 180, avgCost: 118, manualPrice: 109, pe: 13.0, pb: 1.6, dy: 0.052, de: 60, mc: 4e9 },
  ];
  const asOf = todayISO();
  inv.forEach((h, i) => {
    const row = db.insert(holdings).values({
      name: h.name, symbol: h.symbol || null, assetType: h.assetType as any,
      quantity: h.quantity, avgCost: h.avgCost, currency: "SEK", manualPrice: h.manualPrice, sortOrder: i + 1,
    } as any).returning().get();
    db.insert(fundamentals).values({
      holdingId: row.id, pe: h.pe || null, pb: h.pb || null, dividendYield: h.dy || null,
      debtEquity: h.de || null, marketCap: h.mc || null, currency: "SEK", asOf,
    } as any).run();
  });
  const totalVal = inv.reduce((s, h) => s + h.quantity * h.manualPrice, 0);
  const totalCost = inv.reduce((s, h) => s + h.quantity * h.avgCost, 0);
  // 8-month rising value history ending at today's totals.
  for (let k = 7; k >= 0; k--) {
    const mo = THROUGH_MONTH - k;
    if (mo < 1) continue;
    const f = (8 - k) / 8; // 0.125 .. 1.0
    const value = Math.round(totalVal * (0.82 + 0.18 * f));
    const cost = Math.round(totalCost * (0.88 + 0.12 * f));
    db.insert(portfolioSnapshots).values({ date: d(YEAR, mo, 1), totalValueSek: value, totalCostSek: cost, gainSek: value - cost }).run();
  }
  console.log("✓ investments: holdings, fundamentals, history");

  // ── Pension: holdings + value history ───────────────────────────────────────
  const pens = [
    { name: "Allmän pension",        type: "ALLMAN",  manager: "Pensionsmyndigheten", currentValue: 950_000, payout: 14500 },
    { name: "Tjänstepension ITP",    type: "TJANSTE", manager: "Alecta",              currentValue: 780_000, payout: 9000 },
    { name: "Tjänstepension",        type: "TJANSTE", manager: "AMF",                 currentValue: 185_000, payout: 2200 },
    { name: "Privat pensionssparande", type: "PRIVAT", manager: "Avanza",             currentValue: 200_000, payout: 2000 },
  ];
  pens.forEach((p, i) => db.insert(pensionHoldings).values({
    name: p.name, type: p.type as any, manager: p.manager, currentValue: p.currentValue,
    projectedMonthlyPayout: p.payout, sortOrder: i + 1, asOf: d(YEAR, 11, 1),
  } as any).run());
  const pensTotal = pens.reduce((s, p) => s + p.currentValue, 0);
  const pensSeries = [1_980_000, 2_015_000, 2_050_000, 2_080_000, 2_100_000, pensTotal];
  pensSeries.forEach((v, idx) => {
    const mo = THROUGH_MONTH - (pensSeries.length - 1) + idx;
    if (mo >= 1) db.insert(pensionSnapshots).values({ date: d(YEAR, mo, 1), totalValueSek: v }).run();
  });
  console.log("✓ pension: holdings + history");

  // ── A sample worksheet (simple {v,rows,cols,cells,fills} model) ─────────────
  const ROWS = 40, COLS = 8;
  const grid: string[][] = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => ""));
  const put = (r: number, c: number, v: string) => { grid[r][c] = v; };
  put(0, 0, "Household budget — quarterly plan");
  put(2, 0, "Category"); put(2, 1, "Jan"); put(2, 2, "Feb"); put(2, 3, "Mar"); put(2, 4, "Q1 total");
  const rows: [string, number, number, number][] = [
    ["Income", 52000, 52000, 54000], ["Housing", -12500, -12500, -12500],
    ["Food", -6200, -5800, -6400], ["Transport", -2100, -1950, -2300], ["Savings", -8000, -8000, -9000],
  ];
  rows.forEach((row, i) => {
    const r = 3 + i;
    put(r, 0, row[0]); put(r, 1, String(row[1])); put(r, 2, String(row[2])); put(r, 3, String(row[3]));
    put(r, 4, `=SUM(B${r + 1}:D${r + 1})`);
  });
  put(9, 0, "Net");
  put(9, 1, "=SUM(B4:B8)"); put(9, 2, "=SUM(C4:C8)"); put(9, 3, "=SUM(D4:D8)"); put(9, 4, "=SUM(B10:D10)");
  put(11, 0, "Savings rate"); put(11, 1, "=-B8/B4");
  const fills: Record<string, string> = { "0:0": "#dbe4f3", "2:0": "#eef2f8", "2:1": "#eef2f8", "2:2": "#eef2f8", "2:3": "#eef2f8", "2:4": "#eef2f8", "9:0": "#e7f3ea", "9:1": "#e7f3ea", "9:2": "#e7f3ea", "9:3": "#e7f3ea", "9:4": "#e7f3ea" };
  const now = todayISO();
  db.insert(worksheets).values({
    name: "Budget planner", kind: "Budget",
    data: JSON.stringify({ v: 1, rows: ROWS, cols: COLS, cells: grid, fills }),
    sortOrder: 0, createdAt: now, updatedAt: now,
  } as any).run();
  console.log("✓ sample worksheet");

  console.log("\n✓ Demo data ready — synthetic figures only.\n");
}

main().catch((e) => { console.error(e); process.exit(1); });

#!/usr/bin/env tsx
/**
 * seed-mock-data.ts
 *
 * Populates the FinKoll database with a realistic full year (2025) of
 * mock household budget data. Clears existing budget plans, transactions
 * and recurring templates before inserting, but keeps categories, houses
 * and auth settings intact.
 *
 * Run from the backend/ directory:
 *   npx tsx src/scripts/seed-mock-data.ts
 */
import "dotenv/config";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "../db";
import { categories, budgetPlans, transactions, recurringTemplates } from "../db/schema";
import { seed } from "../db/seed";
import path from "path";

// ── Helpers ────────────────────────────────────────────────────────────────────
function d(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function tx(
  date: string,
  description: string,
  amount: number,
  categoryId: number,
  notes?: string,
) {
  db.insert(transactions)
    .values({ date, description, amount, categoryId, notes: notes ?? null, isRecurringInstance: 0 } as any)
    .run();
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  // 1. Migrate
  migrate(db, { migrationsFolder: path.resolve(__dirname, "../db/migrations") });
  console.log("✓ Migrations applied");

  // 2. Seed categories + houses + password hash if empty
  await seed();

  // 3. Clear existing transactional data (keep categories / auth)
  db.delete(recurringTemplates).run();
  db.delete(budgetPlans).run();
  db.delete(transactions).run();
  console.log("✓ Existing data cleared");

  // 4. Look up category IDs by name
  const cats = db.select().from(categories).all();
  const C: Record<string, number> = Object.fromEntries(cats.map((c) => [c.name, c.id]));

  const required = [
    "Salary", "Expense Payment", "Savings Injection",
    "Rent / Mortgage", "Electricity", "Insurance", "Subscriptions",
    "Groceries", "Transport", "Other Expenses",
    "Stock Savings", "Vacation Savings", "Specific Savings",
    "Personal Savings (Person A)", "Personal Savings (Person B)",
  ];
  for (const name of required) {
    if (!C[name]) throw new Error(`Category not found: "${name}" — run the app once to seed categories first.`);
  }

  // 5. Recurring templates
  const templates = [
    { description: "Salary",                  amount: 52000, categoryId: C["Salary"],                  frequency: "MONTHLY", activeFromYear: 2025, activeFromMonth: 1 },
    { description: "Rent / Mortgage",         amount: 12500, categoryId: C["Rent / Mortgage"],          frequency: "MONTHLY", activeFromYear: 2025, activeFromMonth: 1 },
    { description: "Home & Car Insurance",    amount: 3200,  categoryId: C["Insurance"],                frequency: "MONTHLY", activeFromYear: 2025, activeFromMonth: 1 },
    { description: "Streaming & Internet",    amount:  850,  categoryId: C["Subscriptions"],            frequency: "MONTHLY", activeFromYear: 2025, activeFromMonth: 1 },
    { description: "Stock savings transfer",  amount: 5000,  categoryId: C["Stock Savings"],            frequency: "MONTHLY", activeFromYear: 2025, activeFromMonth: 1 },
    { description: "Vacation savings",        amount: 2000,  categoryId: C["Vacation Savings"],         frequency: "MONTHLY", activeFromYear: 2025, activeFromMonth: 1 },
    { description: "Specific savings",        amount: 1500,  categoryId: C["Specific Savings"],         frequency: "MONTHLY", activeFromYear: 2025, activeFromMonth: 1 },
    { description: "Personal savings (Person A)",   amount: 2000,  categoryId: C["Personal Savings (Person A)"],    frequency: "MONTHLY", activeFromYear: 2025, activeFromMonth: 1 },
    { description: "Personal savings (Person B)", amount: 2000,  categoryId: C["Personal Savings (Person B)"],  frequency: "MONTHLY", activeFromYear: 2025, activeFromMonth: 1 },
  ];
  for (const t of templates) {
    db.insert(recurringTemplates).values({ ...t, isActive: true } as any).run();
  }
  console.log(`✓ ${templates.length} recurring templates inserted`);

  // 6. Monthly actuals data
  //    ep = Expense Payment (bonus/refund), si = Savings Injection (from vacation fund)
  type MonthDef = {
    month: number;
    salary: number; ep: number; si: number;
    rent: number; elec: number; ins: number; subs: number;
    groc: number; trans: number; other: number;
    stock: number; vac: number; spec: number; pme: number; pwife: number;
  };

  const monthData: MonthDef[] = [
    { month:  1, salary:52000, ep:    0, si:    0, rent:12500, elec: 2800, ins:3200, subs: 850, groc: 8200, trans:2800, other: 1500, stock: 5000, vac:2000, spec:1500, pme:2000, pwife:2000 },
    { month:  2, salary:52000, ep:    0, si:    0, rent:12500, elec: 2500, ins:3200, subs: 850, groc: 7800, trans:2600, other:  800, stock: 5000, vac:2000, spec:1500, pme:2000, pwife:2000 },
    { month:  3, salary:52000, ep: 8500, si:    0, rent:12500, elec: 2000, ins:3200, subs: 850, groc: 8500, trans:3200, other: 2200, stock: 8000, vac:2000, spec:1500, pme:2000, pwife:2000 },
    { month:  4, salary:52000, ep:    0, si:    0, rent:12500, elec: 1200, ins:3200, subs: 850, groc: 7500, trans:2500, other: 1800, stock: 5000, vac:2000, spec:1500, pme:2000, pwife:2000 },
    { month:  5, salary:52000, ep:    0, si:    0, rent:12500, elec:  800, ins:3200, subs: 850, groc: 7800, trans:2800, other: 3500, stock: 5000, vac:2000, spec:1500, pme:2000, pwife:2000 },
    { month:  6, salary:52000, ep: 3500, si:    0, rent:12500, elec:  600, ins:3200, subs: 850, groc: 9200, trans:3500, other: 4500, stock: 5000, vac:2000, spec:1500, pme:2000, pwife:2000 },
    { month:  7, salary:52000, ep:    0, si: 8000, rent:12500, elec:  550, ins:3200, subs: 850, groc:10500, trans:4200, other:12000, stock: 3000, vac:   0, spec:   0, pme:1000, pwife:1000 },
    { month:  8, salary:52000, ep:    0, si:    0, rent:12500, elec:  600, ins:3200, subs: 850, groc: 8500, trans:2800, other: 2500, stock: 5000, vac:2000, spec:1500, pme:2000, pwife:2000 },
    { month:  9, salary:52000, ep:    0, si:    0, rent:12500, elec:  900, ins:3200, subs: 850, groc: 7800, trans:2600, other: 1200, stock: 5000, vac:2000, spec:1500, pme:2000, pwife:2000 },
    { month: 10, salary:52000, ep: 2200, si:    0, rent:12500, elec: 1400, ins:3200, subs: 850, groc: 8000, trans:2700, other: 3500, stock: 5000, vac:2000, spec:1500, pme:2000, pwife:2000 },
    { month: 11, salary:52000, ep:    0, si:    0, rent:12500, elec: 2200, ins:3200, subs: 850, groc: 9500, trans:2500, other: 5000, stock: 5000, vac:2000, spec:1500, pme:2000, pwife:2000 },
    { month: 12, salary:52000, ep:15000, si:    0, rent:12500, elec: 2800, ins:3200, subs: 850, groc:12000, trans:2200, other: 8000, stock:10000, vac:3000, spec:2000, pme:3000, pwife:3000 },
  ];

  // 7. Budget plans (planned at start of year — slight difference from actuals)
  const YEAR = 2025;
  const plannedElec = [3000, 2800, 1800, 1000, 700, 500, 500, 500, 800, 1500, 2500, 3000];

  for (const m of monthData) {
    const plan = (catName: string, amount: number) => {
      if (amount > 0) {
        db.insert(budgetPlans)
          .values({ year: YEAR, month: m.month, categoryId: C[catName], plannedAmount: amount })
          .run();
      }
    };
    plan("Salary",                   52000);
    plan("Rent / Mortgage",          12500);
    plan("Electricity",              plannedElec[m.month - 1]);
    plan("Insurance",                3200);
    plan("Subscriptions",            900);
    plan("Groceries",                8000);
    plan("Transport",                2500);
    plan("Other Expenses",           2000);
    plan("Stock Savings",            5000);
    plan("Vacation Savings",         2000);
    plan("Specific Savings",         1500);
    plan("Personal Savings (Person A)",    2000);
    plan("Personal Savings (Person B)",  2000);
  }
  console.log("✓ Budget plans inserted");

  // 8. Transactions (realistic breakdown per category)
  const monthNames = ["","January","February","March","April","May","June",
                       "July","August","September","October","November","December"];

  const epDesc: Record<number, string> = {
    3: "Annual work bonus", 6: "Home insurance refund",
    10: "Tax refund",       12: "Christmas bonus",
  };

  const otherItems: Record<number, Array<[number, string, number, string?]>> = {
     1: [[8, "Pharmacy & health products", 450], [15, "Hardware store (Jula)", 1050]],
     2: [[12, "Dentist", 800]],
     3: [[5, "Clothes — spring season", 1400], [20, "Garden supplies (Plantagen)", 800]],
     4: [[3, "Car annual service", 1800]],
     5: [[8, "Garden furniture (Biltema)", 2200], [22, "Barbecue & outdoor supplies", 1300]],
     6: [[1, "Vacation — hotel pre-booking", 2800], [18, "Summer clothing & accessories", 1700]],
     7: [[1, "Accommodation — Gotland", 6500, "Summer vacation 2025"], [10, "Restaurants & activities", 3500, "Summer vacation 2025"], [20, "Souvenirs & misc shopping", 2000, "Summer vacation 2025"]],
     8: [[15, "Back-to-school supplies", 1500], [20, "Pharmacy & vitamins", 1000]],
     9: [[8, "Car wash + annual service kit", 700], [18, "Books & hobby supplies", 500]],
    10: [[5, "Roof repair — handyman", 2800, "Found small leak after autumn rains"], [20, "Autumn home maintenance", 700]],
    11: [[1, "Black Friday shopping", 2500, "Electronics & gifts"], [15, "Christmas gifts — batch 1", 2500]],
    12: [[5, "Christmas gifts — batch 2", 3500], [15, "Christmas food & drinks", 2500], [23, "New Year supplies & celebrations", 2000]],
  };

  for (const m of monthData) {
    const mo = m.month;

    // Income
    tx(d(YEAR, mo, 25), "Salary — monthly pay", m.salary, C["Salary"]);
    if (m.ep > 0)
      tx(d(YEAR, mo, 15), epDesc[mo] ?? "Expense payment", m.ep, C["Expense Payment"]);
    if (m.si > 0)
      tx(d(YEAR, mo, 2), "Withdrawal from vacation savings", m.si, C["Savings Injection"],
         "Vacation fund used for summer trip to Gotland");

    // Rent
    tx(d(YEAR, mo, 1), "Rent / Mortgage (Swedbank)", m.rent, C["Rent / Mortgage"]);

    // Electricity
    tx(d(YEAR, mo, 14), "Electricity bill (Vattenfall)", m.elec, C["Electricity"]);

    // Insurance — 3 policies
    const insHome = 1800;
    const insCar  =  900;
    const insLife = m.ins - insHome - insCar;
    tx(d(YEAR, mo,  1), "Home insurance (Länsförsäkringar)", insHome, C["Insurance"]);
    tx(d(YEAR, mo,  1), "Car insurance (Folksam)",           insCar,  C["Insurance"]);
    tx(d(YEAR, mo,  5), "Life insurance (Skandia)",          insLife, C["Insurance"]);

    // Subscriptions — 4 lines
    tx(d(YEAR, mo,  3), "Netflix",         179,             C["Subscriptions"]);
    tx(d(YEAR, mo,  3), "Spotify Family",  229,             C["Subscriptions"]);
    tx(d(YEAR, mo,  5), "Telia Internet",  399,             C["Subscriptions"]);
    const subsRest = m.subs - 179 - 229 - 399;
    if (subsRest > 0)
      tx(d(YEAR, mo,  8), "Misc subscriptions", subsRest,   C["Subscriptions"]);

    // Groceries — 4 weekly shops
    const grocPerWeek = Math.round(m.groc / 4);
    tx(d(YEAR, mo,  4), "ICA Maxi — weekly groceries",  grocPerWeek,              C["Groceries"]);
    tx(d(YEAR, mo, 11), "Coop Forum — weekly groceries", grocPerWeek,              C["Groceries"]);
    tx(d(YEAR, mo, 18), "ICA Maxi — weekly groceries",  grocPerWeek,              C["Groceries"]);
    tx(d(YEAR, mo, 25), "Hemköp — weekly groceries",    m.groc - grocPerWeek * 3, C["Groceries"]);

    // Transport — fuel + parking + transit
    const fuel     = Math.round(m.trans * 0.55);
    const parking  = Math.round(m.trans * 0.20);
    const transit  = m.trans - fuel - parking;
    if (transit > 0) tx(d(YEAR, mo,  2), "SL monthly card",      transit,  C["Transport"]);
    tx(d(YEAR, mo, 10), "OKQ8 — fuel",                           fuel,     C["Transport"]);
    if (parking > 0) tx(d(YEAR, mo, 15), "Parking & toll fees",  parking,  C["Transport"]);

    // Other Expenses
    const items = otherItems[mo] ?? [[10, "Miscellaneous", m.other]];
    for (const [day, desc, amt, note] of items) {
      tx(d(YEAR, mo, day as number), desc as string, amt as number, C["Other Expenses"], note as string | undefined);
    }

    // Savings
    const stockNote = mo === 3 ? "Extra transfer after annual bonus"
                    : mo === 12 ? "Year-end boost after Christmas bonus" : undefined;
    if (m.stock > 0)  tx(d(YEAR, mo, 28), "Stock savings transfer",          m.stock, C["Stock Savings"],            stockNote);
    if (m.vac > 0)    tx(d(YEAR, mo, 28), "Vacation savings",                 m.vac,  C["Vacation Savings"]);
    if (m.spec > 0)   tx(d(YEAR, mo, 28), "Specific savings",                 m.spec, C["Specific Savings"]);
    if (m.pme > 0)    tx(d(YEAR, mo, 28), "Personal savings — Person A",            m.pme,  C["Personal Savings (Person A)"]);
    if (m.pwife > 0)  tx(d(YEAR, mo, 28), "Personal savings — Person B",          m.pwife,C["Personal Savings (Person B)"]);

    console.log(`  ✓ ${monthNames[mo]} ${YEAR}`);
  }

  // 9. Print summary
  const totalIncome  = monthData.reduce((s, m) => s + m.salary + m.ep + m.si, 0);
  const totalExpense = monthData.reduce((s, m) => s + m.rent + m.elec + m.ins + m.subs + m.groc + m.trans + m.other, 0);
  const totalSavings = monthData.reduce((s, m) => s + m.stock + m.vac + m.spec + m.pme + m.pwife, 0);
  const netResult    = totalIncome - totalExpense - totalSavings;

  console.log("\n── 2025 Year Summary ────────────────────────────────────────");
  console.log(`  Income:   ${totalIncome.toLocaleString("sv-SE")} kr`);
  console.log(`  Expenses: ${totalExpense.toLocaleString("sv-SE")} kr`);
  console.log(`  Savings:  ${totalSavings.toLocaleString("sv-SE")} kr`);
  console.log(`  Net:      ${netResult.toLocaleString("sv-SE")} kr`);
  console.log("────────────────────────────────────────────────────────────");
  console.log("\n✓ Done. Start the app and explore 2025 data.\n");
}

main().catch((err) => { console.error(err); process.exit(1); });

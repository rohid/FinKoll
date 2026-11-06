import { db } from "./index";
import { categories, categoryGroups, houses, appSettings } from "./schema";
import { eq } from "drizzle-orm";

export async function seed() {
  // Migrate password hash from env into DB on first run
  const existingHash = db.select().from(appSettings).where(eq(appSettings.key, "password_hash")).get();
  if (!existingHash) {
    const envHash = process.env.ADMIN_PASSWORD_HASH;
    if (envHash) {
      db.insert(appSettings).values({ key: "password_hash", value: envHash }).run();
    }
  }

  const existingCategories = db.select().from(categories).all();
  if (existingCategories.length > 0) return;

  db.insert(categories)
    .values([
      // Income
      { name: "Salary", type: "INCOME", subtype: "SALARY", color: "#22c55e", sortOrder: 1 },
      { name: "Expense Payment", type: "INCOME", subtype: "EXPENSE_PAYMENT", color: "#16a34a", sortOrder: 2 },
      { name: "Savings Injection", type: "INCOME", subtype: "SAVINGS_INJECTION", color: "#15803d", sortOrder: 3 },
      // Expenses
      { name: "Rent / Mortgage", type: "EXPENSE", subtype: "BILL", color: "#ef4444", sortOrder: 10, isHousing: true },
      { name: "Electricity", type: "EXPENSE", subtype: "BILL", color: "#f97316", sortOrder: 11, isHousing: true },
      { name: "Insurance", type: "EXPENSE", subtype: "BILL", color: "#fb923c", sortOrder: 12, isHousing: true },
      { name: "Subscriptions", type: "EXPENSE", subtype: "BILL", color: "#f59e0b", sortOrder: 13 },
      { name: "Groceries", type: "EXPENSE", subtype: "BILL", color: "#eab308", sortOrder: 14 },
      { name: "Transport", type: "EXPENSE", subtype: "BILL", color: "#84cc16", sortOrder: 15 },
      { name: "Other Expenses", type: "EXPENSE", subtype: "OTHER", color: "#6b7280", sortOrder: 19 },
      // Savings
      { name: "Stock Savings", type: "SAVINGS", subtype: "STOCK", color: "#3b82f6", sortOrder: 20 },
      { name: "Vacation Savings", type: "SAVINGS", subtype: "VACATION", color: "#06b6d4", sortOrder: 21 },
      { name: "Specific Savings", type: "SAVINGS", subtype: "SPECIFIC", color: "#8b5cf6", sortOrder: 22 },
      { name: "Personal Savings (Person A)", type: "SAVINGS", subtype: "PERSONAL_A", color: "#a855f7", sortOrder: 23 },
      { name: "Personal Savings (Person B)", type: "SAVINGS", subtype: "PERSONAL_B", color: "#ec4899", sortOrder: 24 },
    ])
    .run();

  // Roll each seeded category up into its canonical group (the groups themselves are
  // created by migration 0019, which runs before this seed). Keyed by the default
  // category names we just inserted.
  const groups = db.select().from(categoryGroups).all();
  const gid = (name: string, type: string) => groups.find((g) => g.name === name && g.type === type)?.id ?? null;
  const nameToGroup: Record<string, string> = {
    "Salary": "Salary",
    "Expense Payment": "Reimbursements",
    "Savings Injection": "Transfers In",
    "Rent / Mortgage": "Housing",
    "Electricity": "Housing",
    "Insurance": "Housing",
    "Subscriptions": "Bills & Subscriptions",
    "Groceries": "Food",
    "Transport": "Transport",
    "Other Expenses": "Other Expenses",
    "Stock Savings": "Investments",
    "Vacation Savings": "Goals",
    "Specific Savings": "Goals",
    "Personal Savings (Person A)": "Personal",
    "Personal Savings (Person B)": "Personal",
  };
  for (const c of db.select().from(categories).all()) {
    const g = nameToGroup[c.name];
    if (g) db.update(categories).set({ groupId: gid(g, c.type) }).where(eq(categories.id, c.id)).run();
  }

  // New databases start with a single house. Additional houses (a second/third
  // property) are added by the user from the Electricity page. Existing DBs that
  // already have houses (incl. a custom-named second house) are left untouched.
  const existingHouses = db.select().from(houses).all();
  if (existingHouses.length === 0) {
    db.insert(houses)
      .values([{ name: "Main House", sortOrder: 1 }])
      .run();
  }

  console.log("Seed data inserted.");
}

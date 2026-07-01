import { db } from "../db";
import { transactions, categories, budgetPlans } from "../db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

export interface CategorySummary {
  categoryId: number;
  categoryName: string;
  type: "INCOME" | "EXPENSE" | "SAVINGS";
  color: string;
  plannedAmount: number;
  actualAmount: number;
  variance: number;
  percentOfIncome: number;
}

export interface MonthlySummary {
  totalIncome: number;
  totalExpenses: number;
  totalSavings: number;
  netResult: number;
  savingsRate: number;
  categories: CategorySummary[];
}

export function getMonthlySummary(year: number, month: number): MonthlySummary {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const to = `${year}-${String(month).padStart(2, "0")}-31`;

  // Get actuals grouped by category
  const actuals = db
    .select({
      categoryId: transactions.categoryId,
      total: sql<number>`SUM(${transactions.amount})`,
    })
    .from(transactions)
    .where(and(gte(transactions.date, from), lte(transactions.date, to)))
    .groupBy(transactions.categoryId)
    .all();

  // Get planned amounts
  const planned = db
    .select()
    .from(budgetPlans)
    .where(and(eq(budgetPlans.year, year), eq(budgetPlans.month, month)))
    .all();

  // Get all active categories
  const cats = db.select().from(categories).where(eq(categories.isActive, true)).all();

  const actualsMap = new Map(actuals.map((a) => [a.categoryId, a.total ?? 0]));
  const plannedMap = new Map(planned.map((p) => [p.categoryId, p.plannedAmount]));

  const totalIncome = actuals.reduce((sum, a) => {
    const cat = cats.find((c) => c.id === a.categoryId);
    return cat?.type === "INCOME" ? sum + (a.total ?? 0) : sum;
  }, 0);

  const totalExpenses = actuals.reduce((sum, a) => {
    const cat = cats.find((c) => c.id === a.categoryId);
    return cat?.type === "EXPENSE" ? sum + (a.total ?? 0) : sum;
  }, 0);

  const totalSavings = actuals.reduce((sum, a) => {
    const cat = cats.find((c) => c.id === a.categoryId);
    return cat?.type === "SAVINGS" ? sum + (a.total ?? 0) : sum;
  }, 0);

  const netResult = totalIncome - totalExpenses - totalSavings;
  const savingsRate = totalIncome > 0 ? (totalSavings / totalIncome) * 100 : 0;

  const categorySummaries: CategorySummary[] = cats.map((cat) => {
    const actual = actualsMap.get(cat.id) ?? 0;
    const planned = plannedMap.get(cat.id) ?? 0;
    return {
      categoryId: cat.id,
      categoryName: cat.name,
      type: cat.type,
      color: cat.color,
      plannedAmount: planned,
      actualAmount: actual,
      variance: actual - planned,
      percentOfIncome: totalIncome > 0 ? (actual / totalIncome) * 100 : 0,
    };
  });

  return {
    totalIncome,
    totalExpenses,
    totalSavings,
    netResult,
    savingsRate,
    categories: categorySummaries,
  };
}

export interface YearlyRow {
  categoryId: number;
  categoryName: string;
  type: "INCOME" | "EXPENSE" | "SAVINGS";
  color: string;
  months: number[]; // index 0 = Jan, 11 = Dec
  total: number;
}

export interface YearlySummary {
  monthlyTotals: {
    income: number[];
    expenses: number[];
    savings: number[];
    netResult: number[];
  };
  yearlyTotals: {
    income: number;
    expenses: number;
    savings: number;
    netResult: number;
    savingsRate: number;
  };
  rows: YearlyRow[];
}

// ── Detailed yearly view: every transaction, grouped by category & type ────────
export interface YearlyDetailedTransaction {
  id: number;
  date: string;
  description: string;
  amount: number;
  notes: string | null;
  month: number; // 1-based
}

export interface YearlyDetailedCategory {
  categoryId: number;
  categoryName: string;
  color: string;
  total: number;
  transactions: YearlyDetailedTransaction[];
}

export interface YearlyDetailedSection {
  type: "INCOME" | "EXPENSE" | "SAVINGS";
  total: number;
  categories: YearlyDetailedCategory[];
}

export interface YearlyDetailed {
  year: number;
  sections: YearlyDetailedSection[];
  grandTotals: { income: number; expenses: number; savings: number; netResult: number };
}

export function getYearlyDetailed(year: number): YearlyDetailed {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  const rows = db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      amount: transactions.amount,
      notes: transactions.notes,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryType: categories.type,
      sortOrder: categories.sortOrder,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(gte(transactions.date, from), lte(transactions.date, to)))
    .orderBy(categories.sortOrder, transactions.date)
    .all();

  const order: YearlyDetailed["sections"][number]["type"][] = ["INCOME", "EXPENSE", "SAVINGS"];

  const sections: YearlyDetailedSection[] = order.map((type) => {
    const typeRows = rows.filter((r) => r.categoryType === type);

    // Preserve category order (sortOrder, then first appearance)
    const catMap = new Map<number, YearlyDetailedCategory>();
    for (const r of typeRows) {
      let cat = catMap.get(r.categoryId);
      if (!cat) {
        cat = {
          categoryId: r.categoryId,
          categoryName: r.categoryName,
          color: r.categoryColor,
          total: 0,
          transactions: [],
        };
        catMap.set(r.categoryId, cat);
      }
      cat.total += r.amount;
      cat.transactions.push({
        id: r.id,
        date: r.date,
        description: r.description,
        amount: r.amount,
        notes: r.notes,
        month: parseInt(r.date.substring(5, 7)),
      });
    }

    const cats = [...catMap.values()];
    return { type, total: cats.reduce((s, c) => s + c.total, 0), categories: cats };
  });

  const income = sections.find((s) => s.type === "INCOME")?.total ?? 0;
  const expenses = sections.find((s) => s.type === "EXPENSE")?.total ?? 0;
  const savings = sections.find((s) => s.type === "SAVINGS")?.total ?? 0;

  return {
    year,
    sections,
    grandTotals: { income, expenses, savings, netResult: income - expenses - savings },
  };
}

export function getYearlySummary(year: number): YearlySummary {
  const cats = db.select().from(categories).where(eq(categories.isActive, true)).all();

  // Fetch all transactions for the year
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  const actuals = db
    .select({
      categoryId: transactions.categoryId,
      date: transactions.date,
      total: sql<number>`SUM(${transactions.amount})`,
    })
    .from(transactions)
    .where(and(gte(transactions.date, from), lte(transactions.date, to)))
    .groupBy(transactions.categoryId, sql`strftime('%m', ${transactions.date})`)
    .all();

  // Build month→category→amount map
  const map = new Map<string, number>();
  for (const row of actuals) {
    const m = parseInt(row.date.substring(5, 7)) - 1; // 0-based
    map.set(`${row.categoryId}_${m}`, (map.get(`${row.categoryId}_${m}`) ?? 0) + (row.total ?? 0));
  }

  const rows: YearlyRow[] = cats.map((cat) => {
    const months = Array.from({ length: 12 }, (_, i) => map.get(`${cat.id}_${i}`) ?? 0);
    return {
      categoryId: cat.id,
      categoryName: cat.name,
      type: cat.type,
      color: cat.color,
      months,
      total: months.reduce((s, v) => s + v, 0),
    };
  });

  const monthlyIncome = Array.from({ length: 12 }, (_, i) =>
    rows.filter((r) => r.type === "INCOME").reduce((s, r) => s + r.months[i], 0)
  );
  const monthlyExpenses = Array.from({ length: 12 }, (_, i) =>
    rows.filter((r) => r.type === "EXPENSE").reduce((s, r) => s + r.months[i], 0)
  );
  const monthlySavings = Array.from({ length: 12 }, (_, i) =>
    rows.filter((r) => r.type === "SAVINGS").reduce((s, r) => s + r.months[i], 0)
  );
  const monthlyNet = Array.from({ length: 12 }, (_, i) => monthlyIncome[i] - monthlyExpenses[i] - monthlySavings[i]);

  const yearIncome = monthlyIncome.reduce((s, v) => s + v, 0);
  const yearExpenses = monthlyExpenses.reduce((s, v) => s + v, 0);
  const yearSavings = monthlySavings.reduce((s, v) => s + v, 0);

  return {
    monthlyTotals: {
      income: monthlyIncome,
      expenses: monthlyExpenses,
      savings: monthlySavings,
      netResult: monthlyNet,
    },
    yearlyTotals: {
      income: yearIncome,
      expenses: yearExpenses,
      savings: yearSavings,
      netResult: yearIncome - yearExpenses - yearSavings,
      savingsRate: yearIncome > 0 ? (yearSavings / yearIncome) * 100 : 0,
    },
    rows,
  };
}

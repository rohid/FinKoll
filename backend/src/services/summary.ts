import { db } from "../db";
import { transactions, categories, categoryGroups, budgetPlans, transactionItems } from "../db/schema";
import { eq, and, gte, lte, sql, inArray } from "drizzle-orm";
import { getPrimaryHouseId } from "./houses";

const TYPE_ORDER: Record<string, number> = { INCOME: 0, EXPENSE: 1, SAVINGS: 2 };

// A category group's total for a period. groupId null = categories with no group
// assigned yet (surfaced so the rollup still sums to the category totals).
export interface GroupSummary {
  groupId: number | null;
  groupName: string;
  type: "INCOME" | "EXPENSE" | "SAVINGS";
  color: string;
  amount: number;
}

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

export interface HousingCategoryTotal {
  categoryId: number;
  categoryName: string;
  color: string;
  amount: number;
}

export interface MonthlySummary {
  totalIncome: number;
  totalExpenses: number;
  totalSavings: number;
  netResult: number;
  savingsRate: number;
  categories: CategorySummary[];
  groups: GroupSummary[];
  housingTotal: number;
  housingCategories: HousingCategoryTotal[];
}

// Roll category actuals up into their canonical groups. Ungrouped categories bucket
// under a synthetic "Ungrouped" row per type, so the group totals always reconcile
// to the category totals.
function rollupGroups(
  cats: { id: number; type: "INCOME" | "EXPENSE" | "SAVINGS"; groupId: number | null }[],
  amountOf: (categoryId: number) => number,
): GroupSummary[] {
  const groupsMeta = db.select().from(categoryGroups).all();
  const metaById = new Map(groupsMeta.map((g) => [g.id, g]));
  const agg = new Map<string, GroupSummary>();
  for (const cat of cats) {
    const amount = amountOf(cat.id);
    if (amount === 0) continue;
    const meta = cat.groupId != null ? metaById.get(cat.groupId) : undefined;
    const key = meta ? `g${meta.id}` : `u:${cat.type}`;
    let e = agg.get(key);
    if (!e) {
      e = { groupId: meta?.id ?? null, groupName: meta?.name ?? "Ungrouped", type: cat.type, color: meta?.color ?? "#9ca3af", amount: 0 };
      agg.set(key, e);
    }
    e.amount += amount;
  }
  return [...agg.values()].sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || b.amount - a.amount);
}

// Line-aware category allocation for a date range. A transaction counts under its
// own category UNLESS one of its split lines carries an explicit category — then each
// line counts under (line category ?? parent category) using the line amount. The
// "only when a line has a category" rule means a transaction with no categorised line
// contributes exactly its own amount under its own category, identical to a plain
// SUM(amount) GROUP BY category — so existing totals are unchanged until the user
// actually categorises a split line.
interface CategoryContribution { categoryId: number; date: string; amount: number; }
export function getCategoryContributions(from: string, to: string): CategoryContribution[] {
  const txs = db
    .select({ id: transactions.id, date: transactions.date, amount: transactions.amount, categoryId: transactions.categoryId })
    .from(transactions)
    .where(and(gte(transactions.date, from), lte(transactions.date, to)))
    .all();
  if (txs.length === 0) return [];

  const its = db
    .select({ transactionId: transactionItems.transactionId, amount: transactionItems.amount, categoryId: transactionItems.categoryId })
    .from(transactionItems)
    .where(inArray(transactionItems.transactionId, txs.map((t) => t.id)))
    .all();
  const byTx = new Map<number, typeof its>();
  for (const it of its) {
    if (!byTx.has(it.transactionId)) byTx.set(it.transactionId, []);
    byTx.get(it.transactionId)!.push(it);
  }

  const out: CategoryContribution[] = [];
  for (const t of txs) {
    const list = byTx.get(t.id);
    const hasLineCategory = !!list && list.some((it) => it.categoryId != null);
    if (hasLineCategory) {
      for (const it of list!) out.push({ categoryId: it.categoryId ?? t.categoryId, date: t.date, amount: it.amount });
    } else {
      out.push({ categoryId: t.categoryId, date: t.date, amount: t.amount });
    }
  }
  return out;
}

export function getMonthlySummary(year: number, month: number): MonthlySummary {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const to = `${year}-${String(month).padStart(2, "0")}-31`;

  // Line-aware actuals per category (see getCategoryContributions).
  const actualsMap = new Map<number, number>();
  for (const c of getCategoryContributions(from, to)) {
    actualsMap.set(c.categoryId, (actualsMap.get(c.categoryId) ?? 0) + c.amount);
  }

  // Get planned amounts
  const planned = db
    .select()
    .from(budgetPlans)
    .where(and(eq(budgetPlans.year, year), eq(budgetPlans.month, month)))
    .all();

  // Get all active categories
  const cats = db.select().from(categories).where(eq(categories.isActive, true)).all();

  const plannedMap = new Map(planned.map((p) => [p.categoryId, p.plannedAmount]));

  let totalIncome = 0, totalExpenses = 0, totalSavings = 0;
  for (const [catId, amt] of actualsMap) {
    const cat = cats.find((c) => c.id === catId);
    if (cat?.type === "INCOME") totalIncome += amt;
    else if (cat?.type === "EXPENSE") totalExpenses += amt;
    else if (cat?.type === "SAVINGS") totalSavings += amt;
  }

  const netResult = totalIncome - totalExpenses - totalSavings;
  const savingsRate = totalIncome > 0 ? (totalSavings / totalIncome) * 100 : 0;

  // Housing costs: the primary residence's transactions, grouped by category.
  // Isolated in try/catch so this optional breakdown can never take down the core
  // monthly summary (which powers the Dashboard, Monthly and Analytics views). If
  // the house_id migration hasn't applied yet, housing just reads as empty.
  const housingCategories = getMonthlyHousing(from, to);
  const housingTotal = housingCategories.reduce((s, h) => s + h.amount, 0);

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

  const groups = rollupGroups(cats, (id) => actualsMap.get(id) ?? 0);

  return {
    totalIncome,
    totalExpenses,
    totalSavings,
    netResult,
    savingsRate,
    categories: categorySummaries,
    groups,
    housingTotal,
    housingCategories,
  };
}

// One primary-home contribution: the portion of a transaction (or a single split
// line) that belongs to the primary house. Split lines carry their own houseId and
// fall back to the transaction's houseId; un-split transactions use their own.
interface HousingContribution {
  categoryId: number;
  categoryName: string;
  color: string;
  sortOrder: number;
  date: string;
  amount: number;
}

// Line-aware housing contributions for the primary home over a date range. A split
// transaction contributes each line whose (line house ?? transaction house) is the
// primary; an un-split transaction contributes its full amount when its house is the
// primary. Throws if the house_id columns are missing (callers guard).
function getHousingContributions(from: string, to: string): HousingContribution[] {
  const primaryHouseId = getPrimaryHouseId();
  if (primaryHouseId == null) return [];

  const txs = db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      houseId: transactions.houseId,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      color: categories.color,
      sortOrder: categories.sortOrder,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(gte(transactions.date, from), lte(transactions.date, to)))
    .all();
  if (txs.length === 0) return [];

  const items = db
    .select({
      transactionId: transactionItems.transactionId,
      amount: transactionItems.amount,
      houseId: transactionItems.houseId,
    })
    .from(transactionItems)
    .where(inArray(transactionItems.transactionId, txs.map((t) => t.id)))
    .all();
  const itemsByTx = new Map<number, typeof items>();
  for (const it of items) {
    if (!itemsByTx.has(it.transactionId)) itemsByTx.set(it.transactionId, []);
    itemsByTx.get(it.transactionId)!.push(it);
  }

  const out: HousingContribution[] = [];
  for (const t of txs) {
    const base = { categoryId: t.categoryId, categoryName: t.categoryName, color: t.color, sortOrder: t.sortOrder, date: t.date };
    const its = itemsByTx.get(t.id);
    if (its && its.length > 0) {
      for (const it of its) {
        const house = it.houseId ?? t.houseId;
        if (house === primaryHouseId) out.push({ ...base, amount: it.amount });
      }
    } else if (t.houseId === primaryHouseId) {
      out.push({ ...base, amount: t.amount });
    }
  }
  return out;
}

// Per-category housing totals for a single month range. Returns [] if there is no
// primary house, or if the housing query fails (e.g. the house_id columns have not
// been migrated yet) — the core monthly summary must survive regardless.
function getMonthlyHousing(from: string, to: string): HousingCategoryTotal[] {
  try {
    const byCat = new Map<number, HousingCategoryTotal & { sortOrder: number }>();
    for (const c of getHousingContributions(from, to)) {
      let e = byCat.get(c.categoryId);
      if (!e) { e = { categoryId: c.categoryId, categoryName: c.categoryName, color: c.color, amount: 0, sortOrder: c.sortOrder }; byCat.set(c.categoryId, e); }
      e.amount += c.amount;
    }
    return [...byCat.values()]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(({ sortOrder, ...rest }) => rest);
  } catch (err) {
    console.error("[summary] housing breakdown skipped:", (err as Error).message);
    return [];
  }
}

// ── Housing costs: monthly totals + per-category breakdown for a year ──────────
// Sums only transactions flagged isHousing (primary home). Powers the yearly
// housing section, the detailed subtotal row, and the dedicated Housing page.
export interface HousingSummaryCategory {
  categoryId: number;
  categoryName: string;
  color: string;
  months: number[]; // 12, index 0 = Jan
  total: number;
}

export interface HousingSummary {
  year: number;
  monthly: number[]; // 12
  total: number;
  categories: HousingSummaryCategory[];
}

export function getHousingSummary(year: number): HousingSummary {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  // Line-aware and guarded: a missing house_id column (not yet migrated) yields an
  // empty housing summary rather than a 500.
  const catMap = new Map<number, HousingSummaryCategory & { sortOrder: number }>();
  try {
    for (const c of getHousingContributions(from, to)) {
      let e = catMap.get(c.categoryId);
      if (!e) {
        e = { categoryId: c.categoryId, categoryName: c.categoryName, color: c.color, sortOrder: c.sortOrder, months: Array(12).fill(0), total: 0 };
        catMap.set(c.categoryId, e);
      }
      const m = parseInt(c.date.substring(5, 7)) - 1;
      e.months[m] += c.amount;
      e.total += c.amount;
    }
  } catch (err) {
    console.error("[summary] housing summary skipped:", (err as Error).message);
  }

  const cats = [...catMap.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ sortOrder, ...rest }) => rest);
  const monthly = Array.from({ length: 12 }, (_, i) => cats.reduce((s, c) => s + c.months[i], 0));
  const total = monthly.reduce((s, v) => s + v, 0);

  return { year, monthly, total, categories: cats };
}

export interface YearlyRow {
  categoryId: number;
  categoryName: string;
  type: "INCOME" | "EXPENSE" | "SAVINGS";
  color: string;
  months: number[]; // index 0 = Jan, 11 = Dec
  total: number;
}

export interface YearlyGroupRow {
  groupId: number | null;
  groupName: string;
  type: "INCOME" | "EXPENSE" | "SAVINGS";
  color: string;
  months: number[]; // index 0 = Jan
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
  groupRows: YearlyGroupRow[];
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

  // Line-aware actuals per category per month (see getCategoryContributions).
  const map = new Map<string, number>();
  for (const c of getCategoryContributions(from, to)) {
    const m = parseInt(c.date.substring(5, 7)) - 1; // 0-based
    map.set(`${c.categoryId}_${m}`, (map.get(`${c.categoryId}_${m}`) ?? 0) + c.amount);
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

  // Group rollup: aggregate each category row's 12 months into its canonical group.
  const groupsMeta = db.select().from(categoryGroups).all();
  const metaById = new Map(groupsMeta.map((g) => [g.id, g]));
  const groupById = new Map(cats.map((c) => [c.id, c.groupId]));
  const gAgg = new Map<string, YearlyGroupRow>();
  for (const r of rows) {
    const gId = groupById.get(r.categoryId) ?? null;
    const meta = gId != null ? metaById.get(gId) : undefined;
    const key = meta ? `g${meta.id}` : `u:${r.type}`;
    let e = gAgg.get(key);
    if (!e) {
      e = { groupId: meta?.id ?? null, groupName: meta?.name ?? "Ungrouped", type: r.type, color: meta?.color ?? "#9ca3af", months: Array(12).fill(0), total: 0 };
      gAgg.set(key, e);
    }
    for (let i = 0; i < 12; i++) e.months[i] += r.months[i];
    e.total += r.total;
  }
  const groupRows = [...gAgg.values()]
    .filter((g) => g.total !== 0)
    .sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || b.total - a.total);

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
    groupRows,
  };
}

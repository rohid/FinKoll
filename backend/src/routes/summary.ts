import { Router, Request, Response } from "express";
import { getMonthlySummary, getYearlySummary, getYearlyDetailed, getHousingSummary } from "../services/summary";
import { db } from "../db";
import { transactions, categories, budgetPlans } from "../db/schema";
import { eq, and, gte, lte } from "drizzle-orm";

const router = Router();

router.get("/month", (req: Request, res: Response) => {
  const year = parseInt(req.query.year as string);
  const month = parseInt(req.query.month as string);
  if (!year || !month) {
    res.status(400).json({ error: "year and month required" });
    return;
  }
  res.json(getMonthlySummary(year, month));
});

router.get("/year", (req: Request, res: Response) => {
  const year = parseInt(req.query.year as string);
  if (!year) {
    res.status(400).json({ error: "year required" });
    return;
  }
  res.json(getYearlySummary(year));
});

// Detailed yearly view: every transaction grouped by category and type
router.get("/year/detailed", (req: Request, res: Response) => {
  const year = parseInt(req.query.year as string);
  if (!year) {
    res.status(400).json({ error: "year required" });
    return;
  }
  res.json(getYearlyDetailed(year));
});

// Housing costs (primary home): monthly totals + per-category breakdown for a year
router.get("/housing", (req: Request, res: Response) => {
  const year = parseInt(req.query.year as string);
  if (!year) {
    res.status(400).json({ error: "year required" });
    return;
  }
  res.json(getHousingSummary(year));
});

// Trends: monthly totals per category for a date range (for analytics)
router.get("/trends", (req: Request, res: Response) => {
  const fromYear = parseInt(req.query.fromYear as string);
  const toYear = parseInt(req.query.toYear as string);

  if (!fromYear || !toYear) {
    res.status(400).json({ error: "fromYear and toYear required" });
    return;
  }

  const results: { year: number; summary: ReturnType<typeof getMonthlySummary> }[] = [];
  for (let y = fromYear; y <= toYear; y++) {
    for (let m = 1; m <= 12; m++) {
      // Only return months in the past or current
      const now = new Date();
      if (y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth() + 1)) break;
      results.push({ year: y, summary: getMonthlySummary(y, m) });
    }
  }

  res.json(results);
});

// Forecast: actuals for past/current months, budget-plan-based projection for future months
router.get("/forecast", (req: Request, res: Response) => {
  const year = parseInt(req.query.year as string);
  if (!year) { res.status(400).json({ error: "year required" }); return; }

  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-based
  const isCurrentYear = year === now.getFullYear();

  // ── Actuals for months 1..currentMonth ──────────────────────────────────────
  const actualMonths: { month: number; income: number; expenses: number; savings: number }[] = [];
  const maxActualMonth = isCurrentYear ? currentMonth : 12;

  for (let m = 1; m <= maxActualMonth; m++) {
    const s = getMonthlySummary(year, m);
    actualMonths.push({ month: m, income: s.totalIncome, expenses: s.totalExpenses, savings: s.totalSavings });
  }

  // Average of months that have any actual data (income > 0) for fallback
  const monthsWithData = actualMonths.filter((a) => a.income > 0 || a.expenses > 0 || a.savings > 0);
  const n = monthsWithData.length || 1;
  const avgIncome   = monthsWithData.reduce((s, m) => s + m.income,   0) / n;
  const avgExpenses = monthsWithData.reduce((s, m) => s + m.expenses, 0) / n;
  const avgSavings  = monthsWithData.reduce((s, m) => s + m.savings,  0) / n;

  // ── Budget plans for future months ──────────────────────────────────────────
  const allPlans = db.select().from(budgetPlans).where(eq(budgetPlans.year, year)).all();
  const allCats  = db.select().from(categories).where(eq(categories.isActive, true)).all();

  function budgetForMonth(m: number): { income: number; expenses: number; savings: number } {
    const plans = allPlans.filter((p) => p.month === m);
    if (plans.length === 0) return { income: avgIncome, expenses: avgExpenses, savings: avgSavings };
    let income = 0, expenses = 0, savings = 0;
    for (const p of plans) {
      const cat = allCats.find((c) => c.id === p.categoryId);
      if (!cat) continue;
      if (cat.type === "INCOME")   income   += p.plannedAmount;
      if (cat.type === "EXPENSE")  expenses += p.plannedAmount;
      if (cat.type === "SAVINGS")  savings  += p.plannedAmount;
    }
    // If plans exist but a type has 0, fall back to average for that type
    return {
      income:   income   > 0 ? income   : avgIncome,
      expenses: expenses > 0 ? expenses : avgExpenses,
      savings:  savings  > 0 ? savings  : avgSavings,
    };
  }

  // ── Build 12-month result ───────────────────────────────────────────────────
  const months = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const isForecast = isCurrentYear ? m > currentMonth : false;
    const { income, expenses, savings } = isForecast
      ? budgetForMonth(m)
      : (actualMonths.find((a) => a.month === m) ?? { income: 0, expenses: 0, savings: 0 });
    const net = income - expenses - savings;
    const savingsRate = income > 0 ? (savings / income) * 100 : 0;
    return { month: m, income, expenses, savings, net, savingsRate: parseFloat(savingsRate.toFixed(1)), isForecast };
  });

  res.json({ year, currentMonth: isCurrentYear ? currentMonth : 12, months });
});

// CSV export
router.get("/export", (req: Request, res: Response) => {
  const year = parseInt(req.query.year as string);
  const month = req.query.month ? parseInt(req.query.month as string) : undefined;

  const from = month
    ? `${year}-${String(month).padStart(2, "0")}-01`
    : `${year}-01-01`;
  const to = month
    ? `${year}-${String(month).padStart(2, "0")}-31`
    : `${year}-12-31`;

  const rows = db
    .select({
      date: transactions.date,
      description: transactions.description,
      amount: transactions.amount,
      category: categories.name,
      type: categories.type,
      notes: transactions.notes,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(gte(transactions.date, from), lte(transactions.date, to)))
    .orderBy(transactions.date)
    .all();

  const headers = ["Date", "Description", "Amount", "Category", "Type", "Notes"];
  const csv = [
    headers.join(","),
    ...rows.map((r) =>
      [r.date, `"${r.description}"`, r.amount, `"${r.category}"`, r.type, `"${r.notes ?? ""}"`].join(",")
    ),
  ].join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="finkoll-${year}${month ? `-${month}` : ""}.csv"`
  );
  res.send(csv);
});

export default router;

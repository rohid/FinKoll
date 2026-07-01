import { db } from "../db";
import { recurringTemplates, transactions, categories, appSettings } from "../db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { getMonthlySummary } from "./summary";

// ── Shared: check if a template fires for a given month ───────────────────────
export function templateAppliesTo(
  tmpl: {
    activeFromYear: number; activeFromMonth: number;
    activeToYear: number | null; activeToMonth: number | null;
    frequency: string; isActive: boolean;
  },
  year: number, month: number
): boolean {
  if (!tmpl.isActive) return false;
  const offset = (year - tmpl.activeFromYear) * 12 + (month - tmpl.activeFromMonth);
  if (offset < 0) return false;
  const beforeEnd =
    tmpl.activeToYear == null ||
    year < tmpl.activeToYear ||
    (year === tmpl.activeToYear && month <= (tmpl.activeToMonth ?? 12));
  if (!beforeEnd) return false;
  if (tmpl.frequency === "YEARLY"     && offset % 12 !== 0) return false;
  if (tmpl.frequency === "HALFYEARLY" && offset % 6  !== 0) return false;
  if (tmpl.frequency === "QUARTERLY"  && offset % 3  !== 0) return false;
  if (tmpl.frequency === "BIMONTHLY"  && offset % 2  !== 0) return false;
  return true;
}

// ── Module 1: Template signals ─────────────────────────────────────────────────
export interface TemplateSignal {
  categoryId: number;
  categoryName: string;
  categoryType: "INCOME" | "EXPENSE" | "SAVINGS";
  templateAmount: number;
  actualAmount: number;
  variance: number;
  variancePct: number;
  signal: "overrun" | "missing" | "under_budget" | "on_track";
}

export function getTemplateSignals(year: number, month: number): TemplateSignal[] {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const to   = `${year}-${String(month).padStart(2, "0")}-31`;

  const allTemplates = db.select().from(recurringTemplates).all();
  const applicable   = allTemplates.filter((t) => templateAppliesTo(t, year, month));
  if (applicable.length === 0) return [];

  const actuals = db
    .select({ categoryId: transactions.categoryId, total: sql<number>`SUM(${transactions.amount})` })
    .from(transactions)
    .where(and(gte(transactions.date, from), lte(transactions.date, to)))
    .groupBy(transactions.categoryId)
    .all();

  const actualsMap = new Map(actuals.map((a) => [a.categoryId, a.total ?? 0]));
  const cats = new Map(db.select().from(categories).all().map((c) => [c.id, c]));

  // Sum template amounts per category (multiple templates may share a category)
  const tmplByCat = new Map<number, number>();
  for (const t of applicable) {
    tmplByCat.set(t.categoryId, (tmplByCat.get(t.categoryId) ?? 0) + t.amount);
  }

  const signals: TemplateSignal[] = [];
  for (const [catId, tmplTotal] of tmplByCat) {
    const cat = cats.get(catId);
    if (!cat) continue;
    const actual     = actualsMap.get(catId) ?? 0;
    const variance   = actual - tmplTotal;
    const variancePct = tmplTotal > 0 ? (variance / tmplTotal) * 100 : 0;

    let signal: TemplateSignal["signal"];
    if (actual === 0)                   signal = "missing";
    else if (variancePct > 15)          signal = "overrun";
    else if (variancePct < -20)         signal = "under_budget";
    else                                signal = "on_track";

    signals.push({
      categoryId: catId,
      categoryName: cat.name,
      categoryType: cat.type as TemplateSignal["categoryType"],
      templateAmount: tmplTotal,
      actualAmount: actual,
      variance: parseFloat(variance.toFixed(2)),
      variancePct: parseFloat(variancePct.toFixed(1)),
      signal,
    });
  }

  const order: Record<string, number> = { missing: 0, overrun: 1, on_track: 2, under_budget: 3 };
  return signals.sort((a, b) => order[a.signal] - order[b.signal]);
}

// ── Module 3: Health score ─────────────────────────────────────────────────────
export function computeHealthScore(
  signals: TemplateSignal[],
  summary: { netResult: number; savingsRate: number },
  netTarget: number | null,
  savingsTarget: number
): number {
  let score = 100;
  for (const s of signals) {
    if      (s.signal === "missing")                    score -= 12;
    else if (s.signal === "overrun" && s.variancePct > 30) score -= 10;
    else if (s.signal === "overrun")                    score -= 5;
    else if (s.signal === "under_budget")               score += 2;
  }
  if      (summary.savingsRate >= savingsTarget)             score += 8;
  else if (summary.savingsRate < savingsTarget * 0.5)        score -= 10;
  else                                                       score -= 4;

  if      (summary.netResult < 0)                           score -= 15;
  else if (netTarget !== null && summary.netResult >= netTarget) score += 8;
  else if (netTarget !== null && summary.netResult < netTarget * 0.5) score -= 6;
  else if (netTarget !== null)                              score -= 3;

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ── Module 5: Trend observations ──────────────────────────────────────────────
export interface TrendObservation {
  type: string;
  severity: "good" | "warning" | "info";
  data: Record<string, string | number>;
}

export function getTrendObservations(year: number, currentMonth: number): TrendObservation[] {
  if (currentMonth < 2) return [];
  const obs: TrendObservation[] = [];
  const lookback = Math.min(currentMonth, 3);

  const recent = Array.from({ length: lookback }, (_, i) => {
    const m = currentMonth - (lookback - 1) + i;
    return { month: m, ...getMonthlySummary(year, m) };
  });

  const latest = recent[recent.length - 1];

  // Net result trend
  if (recent.length >= 3) {
    const nets = recent.map((s) => s.netResult);
    const allRising  = nets[0] < nets[1] && nets[1] < nets[2];
    const allFalling = nets[0] > nets[1] && nets[1] > nets[2];
    const base = Math.abs(nets[0]) || 1;
    const pct  = Math.abs(Math.round(((nets[2] - nets[0]) / base) * 100));
    if (allRising)  obs.push({ type: "net_improving", severity: "good",    data: { months: 3, pct } });
    if (allFalling) obs.push({ type: "net_declining", severity: "warning", data: { months: 3, pct } });
  }

  // Negative net result
  if (latest.netResult < 0)
    obs.push({ type: "negative_net", severity: "warning", data: { amount: Math.abs(Math.round(latest.netResult)) } });

  // Savings rate
  const savingsRates = recent.map((s) => s.savingsRate);
  if (savingsRates.every((r) => r < 15) && recent.length >= 2)
    obs.push({ type: "savings_below_target", severity: "warning", data: { months: recent.length, rate: Math.round(latest.savingsRate) } });
  else if (latest.savingsRate >= 25)
    obs.push({ type: "savings_strong", severity: "good", data: { rate: Math.round(latest.savingsRate) } });

  // Best month YTD
  const allNets = Array.from({ length: currentMonth }, (_, i) => getMonthlySummary(year, i + 1).netResult);
  const maxNet  = Math.max(...allNets);
  if (currentMonth > 2 && latest.netResult === maxNet && latest.netResult > 0)
    obs.push({ type: "best_month_ytd", severity: "good", data: { amount: Math.round(maxNet) } });

  return obs;
}

// ── Module 2: Savings breakdown ───────────────────────────────────────────────
export interface SavingsCatTotal {
  categoryId: number;
  categoryName: string;
  color: string;
  amount: number;
}

export interface SavingsBreakdown {
  ytdByCat: SavingsCatTotal[];
  ytdTotal: number;
  projectedTotal: number;
  avgMonthly: number;
  monthsOfEmergencyFund: number;
  monthly: { month: number; byCat: Record<number, number> }[];
}

export function getSavingsBreakdown(year: number, currentMonth: number): SavingsBreakdown {
  const from = `${year}-01-01`;
  const to   = `${year}-${String(currentMonth).padStart(2, "0")}-31`;

  const cats = db.select().from(categories).where(eq(categories.isActive, true)).all();
  const savingsCats = cats.filter((c) => c.type === "SAVINGS");

  const actuals = db
    .select({
      categoryId: transactions.categoryId,
      month: sql<string>`strftime('%m', ${transactions.date})`,
      total: sql<number>`SUM(${transactions.amount})`,
    })
    .from(transactions)
    .where(and(gte(transactions.date, from), lte(transactions.date, to)))
    .groupBy(transactions.categoryId, sql`strftime('%m', ${transactions.date})`)
    .all();

  // YTD total per savings category
  const ytdMap = new Map<number, number>();
  for (const a of actuals) {
    const cat = cats.find((c) => c.id === a.categoryId);
    if (cat?.type === "SAVINGS") ytdMap.set(a.categoryId, (ytdMap.get(a.categoryId) ?? 0) + (a.total ?? 0));
  }

  const ytdByCat: SavingsCatTotal[] = savingsCats
    .map((c) => ({ categoryId: c.id, categoryName: c.name, color: c.color, amount: Math.round(ytdMap.get(c.id) ?? 0) }))
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const ytdTotal   = ytdByCat.reduce((s, c) => s + c.amount, 0);
  const avgMonthly = currentMonth > 0 ? ytdTotal / currentMonth : 0;
  const projectedTotal = Math.round(avgMonthly * 12);

  // Average monthly expenses for emergency fund estimate
  const expenseActual = db
    .select({ total: sql<number>`SUM(${transactions.amount})` })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(gte(transactions.date, from), lte(transactions.date, to), eq(categories.type, "EXPENSE")))
    .get();
  const avgExpenses = ((expenseActual?.total ?? 0) / (currentMonth || 1));
  const monthsOfEmergencyFund = avgExpenses > 0
    ? parseFloat((ytdTotal / avgExpenses).toFixed(1))
    : 0;

  // Monthly breakdown per savings category
  const monthly = Array.from({ length: currentMonth }, (_, i) => {
    const m = i + 1;
    const mStr = String(m).padStart(2, "0");
    const byCat: Record<number, number> = {};
    for (const sc of savingsCats) {
      const row = actuals.find((a) => a.categoryId === sc.id && a.month === mStr);
      byCat[sc.id] = row ? Math.round(row.total ?? 0) : 0;
    }
    return { month: m, byCat };
  });

  return { ytdByCat, ytdTotal, projectedTotal, avgMonthly: Math.round(avgMonthly), monthsOfEmergencyFund, monthly };
}

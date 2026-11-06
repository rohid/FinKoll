import { db } from "../db";
import { recurringTemplates, transactions, categories, transactionItems, appSettings } from "../db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { getMonthlySummary, getCategoryContributions } from "./summary";

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

  // Line-aware actuals per category (matches the monthly/yearly summaries).
  const actualsMap = new Map<number, number>();
  for (const c of getCategoryContributions(from, to)) {
    actualsMap.set(c.categoryId, (actualsMap.get(c.categoryId) ?? 0) + c.amount);
  }
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

  // Line-aware actuals per category per month (matches the summaries).
  const aggMC = new Map<string, { categoryId: number; month: string; total: number }>();
  for (const c of getCategoryContributions(from, to)) {
    const month = c.date.substring(5, 7);
    const key = `${c.categoryId}_${month}`;
    const e = aggMC.get(key) ?? { categoryId: c.categoryId, month, total: 0 };
    e.total += c.amount;
    aggMC.set(key, e);
  }
  const actuals = [...aggMC.values()];

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

// ── Data Health ────────────────────────────────────────────────────────────────
// A read-only review queue of data-quality problems that quietly distort analysis,
// each with enough context to jump to the fix. Never mutates anything — the user
// decides what to correct. Lists are capped; `count` is the true total.
export interface HealthIssue<T> { count: number; items: T[]; }
export interface DataHealth {
  negativeAmounts: HealthIssue<{ id: number; date: string; description: string; amount: number; categoryName: string }>;
  ungroupedCategories: HealthIssue<{ id: number; name: string; type: string }>;
  duplicateCategoryNames: HealthIssue<{ name: string; ids: number[] }>;
  unusedCategories: HealthIssue<{ id: number; name: string; type: string }>;
  splitMismatches: HealthIssue<{ id: number; date: string; description: string; amount: number; itemsTotal: number }>;
  housingUnassigned: HealthIssue<{ id: number; date: string; description: string; categoryName: string }>;
  totalIssues: number;
}

const CAP = 100;
const issue = <T>(all: T[]): HealthIssue<T> => ({ count: all.length, items: all.slice(0, CAP) });

export function getDataHealth(): DataHealth {
  const cats = db.select().from(categories).all();
  const catById = new Map(cats.map((c) => [c.id, c]));
  const activeCats = cats.filter((c) => c.isActive);

  const txs = db.select().from(transactions).all();
  const items = db.select().from(transactionItems).all();
  const itemsByTx = new Map<number, typeof items>();
  for (const it of items) {
    if (!itemsByTx.has(it.transactionId)) itemsByTx.set(it.transactionId, []);
    itemsByTx.get(it.transactionId)!.push(it);
  }
  const usedCatIds = new Set(txs.map((t) => t.categoryId));

  // 1. Negative amounts (likely a refund/sign slip quietly offsetting a total).
  const negativeAmounts = issue(
    txs.filter((t) => t.amount < 0)
      .map((t) => ({ id: t.id, date: t.date, description: t.description, amount: t.amount, categoryName: catById.get(t.categoryId)?.name ?? "—" })),
  );

  // 2. Active categories with no group assigned (won't roll up in the group views).
  const ungroupedCategories = issue(
    activeCats.filter((c) => c.groupId == null).map((c) => ({ id: c.id, name: c.name, type: c.type })),
  );

  // 3. Duplicate category names (normalized) — a common cause of split/confused totals.
  const byNorm = new Map<string, number[]>();
  for (const c of activeCats) {
    const key = c.name.trim().toLowerCase();
    if (!byNorm.has(key)) byNorm.set(key, []);
    byNorm.get(key)!.push(c.id);
  }
  const duplicateCategoryNames = issue(
    [...byNorm.entries()].filter(([, ids]) => ids.length > 1).map(([name, ids]) => ({ name, ids })),
  );

  // 4. Active categories never used by any transaction (clutter the pickers).
  const unusedCategories = issue(
    activeCats.filter((c) => !usedCatIds.has(c.id)).map((c) => ({ id: c.id, name: c.name, type: c.type })),
  );

  // 5. Split lines that don't sum to the parent amount (the split is wrong somewhere).
  const splitMismatches = issue(
    txs.filter((t) => {
      const its = itemsByTx.get(t.id);
      if (!its || its.length === 0) return false;
      const sum = its.reduce((s, i) => s + i.amount, 0);
      return Math.abs(sum - t.amount) > 0.005;
    }).map((t) => ({ id: t.id, date: t.date, description: t.description, amount: t.amount, itemsTotal: itemsByTx.get(t.id)!.reduce((s, i) => s + i.amount, 0) })),
  );

  // 6. Housing-category transactions with no house assigned (miss the housing totals).
  const housingUnassigned = issue(
    txs.filter((t) => catById.get(t.categoryId)?.isHousing && t.houseId == null)
      .map((t) => ({ id: t.id, date: t.date, description: t.description, categoryName: catById.get(t.categoryId)?.name ?? "—" })),
  );

  const totalIssues =
    negativeAmounts.count + ungroupedCategories.count + duplicateCategoryNames.count +
    unusedCategories.count + splitMismatches.count + housingUnassigned.count;

  return { negativeAmounts, ungroupedCategories, duplicateCategoryNames, unusedCategories, splitMismatches, housingUnassigned, totalIssues };
}

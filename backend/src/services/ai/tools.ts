// ── The FinKoll tool surface for the assistant ──────────────────────────────────
// The model can only call these. READ tools return deterministic data computed by
// FinKoll (the model never invents numbers). WRITE tools only ever produce a
// *draft* — the user confirms before commit() runs. query_db is arbitrary but
// read-only, enforced by SQLite's own statement classification (same guard as the
// SQL console in routes/sql.ts).

import { z } from "zod";
import { db, sqlite } from "../../db";
import {
  categories, transactions, houses, mortgages, pensionHoldings, pensionSnapshots,
} from "../../db/schema";
import { eq } from "drizzle-orm";
import { getPrimaryHouseId } from "../houses";
import { getMonthlySummary } from "../summary";
import { isMonthLocked, ymOf } from "../locks";
import type { Draft } from "./types";

export interface ReadTool {
  name: string; description: string; kind: "read";
  inputSchema: Record<string, unknown>;
  run: (args: Record<string, unknown>) => unknown;
}
export interface WriteTool {
  name: string; description: string; kind: "write";
  inputSchema: Record<string, unknown>;
  draft: (args: Record<string, unknown>) => Draft;   // may throw a helpful message
  commit: (args: Record<string, unknown>) => unknown;
}
export type Tool = ReadTool | WriteTool;

// ── helpers ──────────────────────────────────────────────────────────────────
function ym(month?: unknown): { year: number; month: number } {
  const now = new Date();
  if (typeof month === "string" && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    return { year: y, month: m };
  }
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}
const todayISO = () => new Date().toISOString().slice(0, 10);

function resolveCategory(name: string, type?: string) {
  const all = db.select().from(categories).all();
  const n = name.trim().toLowerCase();
  let hits = all.filter((c) => c.name.toLowerCase() === n);
  if (hits.length === 0) hits = all.filter((c) => c.name.toLowerCase().includes(n) || n.includes(c.name.toLowerCase()));
  if (type) { const typed = hits.filter((c) => c.type === type); if (typed.length) hits = typed; }
  return hits[0] ?? null;
}
function resolveHouse(name?: string) {
  if (!name) return null;
  const all = db.select().from(houses).all();
  const n = name.trim().toLowerCase();
  return all.find((h) => h.name.toLowerCase() === n)
    ?? all.find((h) => h.name.toLowerCase().includes(n) || n.includes(h.name.toLowerCase()))
    ?? null;
}
const kr = (n: number) => `${Math.round(n).toLocaleString("sv-SE")} kr`;

// Recompute today's pension-capital snapshot (same behaviour as routes/pension.ts).
function writePensionSnapshot(): void {
  const total = db.select().from(pensionHoldings).all().reduce((s, h) => s + h.currentValue, 0);
  const date = todayISO();
  db.insert(pensionSnapshots).values({ date, totalValueSek: total })
    .onConflictDoUpdate({ target: pensionSnapshots.date, set: { totalValueSek: total } }).run();
}

// ── READ tools ────────────────────────────────────────────────────────────────
const readTools: ReadTool[] = [
  {
    name: "get_monthly_summary",
    description: "Income, expenses, savings, net result and per-category budget-vs-actual for one month.",
    kind: "read",
    inputSchema: { type: "object", properties: { month: { type: "string", description: "YYYY-MM; omit for the current month" } }, additionalProperties: false },
    run: (a) => {
      const { year, month } = ym(a.month);
      const s = getMonthlySummary(year, month);
      const label = `${year}-${String(month).padStart(2, "0")}`;
      return { summary: `${label}: income ${kr(s.totalIncome)}, expenses ${kr(s.totalExpenses)}, savings ${kr(s.totalSavings)}, net result ${kr(s.netResult)}.`, ...s };
    },
  },
  {
    name: "get_category_average",
    description: "Average monthly amount for a category over the last N months, with the per-month breakdown. Answers 'how much do we spend on X per month'.",
    kind: "read",
    inputSchema: { type: "object", properties: { category: { type: "string" }, months: { type: "number", description: "lookback window, default 12" } }, required: ["category"], additionalProperties: false },
    run: (a) => {
      const cat = resolveCategory(String(a.category ?? ""));
      if (!cat) return { error: `No category matching "${a.category}".` };
      const months = Math.max(1, Math.min(60, Number(a.months) || 12));
      const rows = sqlite.prepare(
        "SELECT substr(date,1,7) ym, SUM(amount) total FROM transactions WHERE category_id = ? GROUP BY ym ORDER BY ym DESC LIMIT ?",
      ).all(cat.id, months) as { ym: string; total: number }[];
      const avg = rows.length ? rows.reduce((s, r) => s + r.total, 0) / rows.length : 0;
      const summary = rows.length
        ? `${cat.name} averages ${kr(avg)} per month over the last ${rows.length} month${rows.length > 1 ? "s" : ""}.`
        : `No entries found for ${cat.name}.`;
      return { summary, category: cat.name, type: cat.type, monthsCovered: rows.length, averagePerMonth: avg, byMonth: rows };
    },
  },
  {
    name: "find_transactions",
    description: "List individual transactions whose description matches a text (a person's name, a payee, a label), optionally within a category. Use this for a specific item like one person's salary — the summary/average tools only give whole-category totals.",
    kind: "read",
    inputSchema: { type: "object", properties: { match: { type: "string", description: "text to find in the transaction description, e.g. a name" }, category: { type: "string" }, months: { type: "number", description: "lookback window in months, default 12" } }, required: ["match"], additionalProperties: false },
    run: (a) => {
      const match = String(a.match ?? "").trim();
      if (!match) return { error: "match is required" };
      const months = Math.max(1, Math.min(60, Number(a.months) || 12));
      const d = new Date(); d.setMonth(d.getMonth() - months);
      const since = d.toISOString().slice(0, 10);
      const cat = a.category ? resolveCategory(String(a.category)) : null;
      const params = cat ? [`%${match.toLowerCase()}%`, since, cat.id] : [`%${match.toLowerCase()}%`, since];
      const rows = sqlite.prepare(
        `SELECT t.date, t.description, t.amount, c.name AS category, c.type
         FROM transactions t JOIN categories c ON c.id = t.category_id
         WHERE lower(t.description) LIKE ? AND t.date >= ?${cat ? " AND t.category_id = ?" : ""}
         ORDER BY t.date DESC LIMIT 100`,
      ).all(...params) as { date: string; description: string; amount: number; category: string; type: string }[];
      const total = rows.reduce((s, r) => s + r.amount, 0);
      const months2 = new Set(rows.map((r) => r.date.slice(0, 7))).size;
      const summary = rows.length
        ? `Found ${rows.length} transaction${rows.length > 1 ? "s" : ""} matching "${match}"${cat ? ` in ${cat.name}` : ""}: total ${kr(total)}${months2 > 1 ? `, averaging ${kr(total / months2)} per month over ${months2} months` : ""}.`
        : `No transactions matching "${match}"${cat ? ` in ${cat.name}` : ""} in the last ${months} months.`;
      return { summary, match, total, count: rows.length, transactions: rows };
    },
  },
  {
    name: "get_electricity_usage",
    description: "Electricity kWh and cost by month for a year, with monthly averages. Answers 'average electricity use'.",
    kind: "read",
    inputSchema: { type: "object", properties: { year: { type: "number", description: "default current year" } }, additionalProperties: false },
    run: (a) => {
      const year = Number(a.year) || new Date().getFullYear();
      const rows = sqlite.prepare(
        "SELECT month, SUM(total_kwh) kwh, SUM(total_bill) bill FROM electricity_readings WHERE year = ? GROUP BY month ORDER BY month",
      ).all(year) as { month: number; kwh: number; bill: number }[];
      const n = rows.length || 1;
      const totKwh = rows.reduce((s, r) => s + r.kwh, 0);
      const totBill = rows.reduce((s, r) => s + r.bill, 0);
      const summary = rows.length
        ? `${year}: averaged ${Math.round(totKwh / n).toLocaleString("sv-SE")} kWh and ${kr(totBill / n)} per month over ${rows.length} month${rows.length > 1 ? "s" : ""}; total ${Math.round(totKwh).toLocaleString("sv-SE")} kWh, ${kr(totBill)}.`
        : `No electricity readings recorded for ${year} yet.`;
      return { summary, year, monthsRecorded: rows.length, avgKwhPerMonth: totKwh / n, avgCostPerMonth: totBill / n, totalKwh: totKwh, totalCost: totBill, byMonth: rows };
    },
  },
  {
    name: "get_net_worth",
    description: "Net-worth breakdown: pension capital + investments + home equity ((property value − its mortgage) × your ownership share).",
    kind: "read",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: () => {
      const pension = (sqlite.prepare("SELECT COALESCE(SUM(current_value),0) v FROM pension_holdings").get() as { v: number }).v;
      const inv = (sqlite.prepare("SELECT total_value_sek v FROM portfolio_snapshots ORDER BY date DESC LIMIT 1").get() as { v: number } | undefined)?.v ?? 0;
      const houseRows = db.select().from(houses).all();
      const mort = db.select().from(mortgages).all();
      const properties = houseRows.filter((h) => h.valuation != null).map((h) => {
        const loan = mort.filter((m) => m.houseId === h.id).reduce((s, m) => s + m.principalAmount, 0);
        const equity = ((h.valuation ?? 0) - loan) * ((h.ownershipPct ?? 100) / 100);
        return { house: h.name, valuation: h.valuation, mortgage: loan, ownershipPct: h.ownershipPct, equity };
      });
      const homeEquity = properties.reduce((s, r) => s + r.equity, 0);
      const netWorth = pension + inv + homeEquity;
      const summary = `Net worth is ${kr(netWorth)}: pension ${kr(pension)} + investments ${kr(inv)} + home equity ${kr(homeEquity)}. Home equity is already each property's market value minus its mortgage, times your ownership share — do not subtract mortgages again.`;
      return { summary, netWorth, pensionCapital: pension, investments: inv, homeEquity, properties };
    },
  },
  {
    name: "get_income_by_person",
    description: "Total attributed to each household person over a period. Use this for 'how much is X's salary' — transactions can now be attributed to a person, so this is exact, unlike matching a name in the description. Optionally filter to a category (e.g. Salary).",
    kind: "read",
    inputSchema: { type: "object", properties: { person: { type: "string", description: "a person's name; omit for all people" }, category: { type: "string" }, months: { type: "number", description: "lookback window in months, default 12" } }, additionalProperties: false },
    run: (a) => {
      const months = Math.max(1, Math.min(60, Number(a.months) || 12));
      const d = new Date(); d.setMonth(d.getMonth() - months);
      const since = d.toISOString().slice(0, 10);
      const cat = a.category ? resolveCategory(String(a.category)) : null;
      const allPeople = sqlite.prepare("SELECT id, name FROM people").all() as { id: number; name: string }[];
      if (allPeople.length === 0) return { summary: "No people are defined yet — attribute transactions to a person first (on the entry form)." };
      let person: { id: number; name: string } | null = null;
      if (a.person) {
        const n = String(a.person).trim().toLowerCase();
        person = allPeople.find((p) => p.name.toLowerCase() === n) ?? allPeople.find((p) => p.name.toLowerCase().includes(n) || n.includes(p.name.toLowerCase())) ?? null;
        if (!person) return { summary: `No person matching "${a.person}". Known people: ${allPeople.map((p) => p.name).join(", ")}.` };
      }
      const params: unknown[] = [since];
      let where = "t.date >= ? AND t.person_id IS NOT NULL";
      if (person) { where += " AND t.person_id = ?"; params.push(person.id); }
      if (cat) { where += " AND t.category_id = ?"; params.push(cat.id); }
      const rows = sqlite.prepare(
        `SELECT p.name AS person, SUM(t.amount) total, COUNT(*) n, COUNT(DISTINCT substr(t.date,1,7)) months
         FROM transactions t JOIN people p ON p.id = t.person_id
         WHERE ${where} GROUP BY t.person_id ORDER BY total DESC`,
      ).all(...params) as { person: string; total: number; n: number; months: number }[];
      const scope = cat ? ` in ${cat.name}` : "";
      const summary = rows.length
        ? rows.map((r) => `${r.person}${scope}: ${kr(r.total)}${r.months > 1 ? ` (avg ${kr(r.total / r.months)}/month over ${r.months} months)` : ""}`).join("; ") + "."
        : `No transactions attributed to ${person ? person.name : "any person"}${scope} in the last ${months} months.`;
      return { summary, months, category: cat?.name ?? null, people: rows };
    },
  },
  {
    name: "query_db",
    description: "Run ONE read-only SQL SELECT against the FinKoll SQLite database and return the rows. Use this for any question the other tools don't cover. Writes/DDL are rejected. Always add a LIMIT.",
    kind: "read",
    inputSchema: { type: "object", properties: { sql: { type: "string", description: "a single read-only SELECT statement" } }, required: ["sql"], additionalProperties: false },
    run: (a) => {
      const sql = String(a.sql ?? "").trim();
      if (!sql) return { error: "sql is required" };
      try {
        const stmt = sqlite.prepare(sql);
        // Authoritative read/write classification from SQLite itself (same guard as
        // the SQL console). Anything that writes or runs DDL is refused here.
        if (!stmt.readonly) return { error: "Only read-only SELECT queries are allowed." };
        const rows = stmt.all() as unknown[];
        return { rowCount: rows.length, returned: Math.min(rows.length, 200), rows: rows.slice(0, 200) };
      } catch (e) {
        return { error: (e as Error)?.message ?? "query failed" };
      }
    },
  },
];

// ── WRITE tools (draft → confirm → commit) ──────────────────────────────────────
const addTxArgs = z.object({
  description: z.string().min(1),
  amount: z.number(),
  type: z.enum(["INCOME", "EXPENSE", "SAVINGS"]).optional(),
  category: z.string().min(1),
  house: z.string().nullable().optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
const txCommitArgs = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(1),
  amount: z.number(),
  categoryId: z.number().int(),
  houseId: z.number().int().nullable(),
});

const setPensionArgs = z.object({ holding: z.string().min(1), value: z.number() });
const pensionCommitArgs = z.object({ id: z.number().int(), currentValue: z.number() });

const setValuationArgs = z.object({ house: z.string().min(1), valuation: z.number().nonnegative(), ownershipPct: z.number().min(0).max(100).optional() });
const valuationCommitArgs = z.object({ id: z.number().int(), valuation: z.number().nonnegative(), ownershipPct: z.number().min(0).max(100).optional() });

const writeTools: WriteTool[] = [
  {
    name: "add_transaction",
    description: "Add a budget transaction (income, expense or savings). Resolve the category and house by name. Use 'month' (YYYY-MM) for 'this month'.",
    kind: "write",
    inputSchema: {
      type: "object",
      properties: {
        description: { type: "string" },
        amount: { type: "number", description: "positive amount in kr" },
        type: { type: "string", enum: ["INCOME", "EXPENSE", "SAVINGS"] },
        category: { type: "string" },
        house: { type: "string", description: "property name, if relevant" },
        month: { type: "string", description: "YYYY-MM for a whole-month entry" },
        date: { type: "string", description: "YYYY-MM-DD for a specific day" },
      },
      required: ["description", "amount", "category"],
      additionalProperties: false,
    },
    draft: (raw) => {
      const a = addTxArgs.parse(raw);
      const cat = resolveCategory(a.category, a.type);
      if (!cat) throw new Error(`No category matching "${a.category}".`);
      const house = a.house ? resolveHouse(a.house) : null;
      if (a.house && !house) throw new Error(`No house matching "${a.house}".`);
      const date = a.date ?? (a.month ? `${a.month}-01` : todayISO());
      const amount = Math.abs(a.amount);
      const houseId = house ? house.id : (cat.isHousing ? getPrimaryHouseId() : null);
      const args = { date, description: a.description, amount, categoryId: cat.id, houseId };
      const preview = `Add ${cat.type.toLowerCase()} “${a.description}” — ${kr(amount)}, category ${cat.name}${house ? `, house ${house.name}` : ""}, dated ${date}`;
      return { tool: "add_transaction", args, preview };
    },
    commit: (raw) => {
      const a = txCommitArgs.parse(raw);
      const { year, month } = ymOf(a.date);
      if (isMonthLocked(year, month)) throw new Error("That month is locked. Unlock it before adding entries.");
      return db.insert(transactions).values(a).returning().get();
    },
  },
  {
    name: "set_pension_value",
    description: "Update the current value of a pension holding (resolve it by name). Records a snapshot so monthly movement is tracked.",
    kind: "write",
    inputSchema: { type: "object", properties: { holding: { type: "string" }, value: { type: "number", description: "new value in kr" } }, required: ["holding", "value"], additionalProperties: false },
    draft: (raw) => {
      const a = setPensionArgs.parse(raw);
      const all = db.select().from(pensionHoldings).all();
      const n = a.holding.trim().toLowerCase();
      const h = all.find((x) => x.name.toLowerCase() === n) ?? all.find((x) => x.name.toLowerCase().includes(n) || n.includes(x.name.toLowerCase()));
      if (!h) throw new Error(`No pension holding matching "${a.holding}".`);
      return { tool: "set_pension_value", args: { id: h.id, currentValue: a.value }, preview: `Set pension “${h.name}” to ${kr(a.value)} (was ${kr(h.currentValue)})` };
    },
    commit: (raw) => {
      const a = pensionCommitArgs.parse(raw);
      const row = db.update(pensionHoldings).set({ currentValue: a.currentValue }).where(eq(pensionHoldings.id, a.id)).returning().get();
      if (!row) throw new Error("Holding not found.");
      writePensionSnapshot();
      return row;
    },
  },
  {
    name: "set_house_valuation",
    description: "Set a property's market value (and optionally your ownership %) for the net-worth / home-equity calculation.",
    kind: "write",
    inputSchema: { type: "object", properties: { house: { type: "string" }, valuation: { type: "number", description: "market value in kr" }, ownershipPct: { type: "number", description: "your share 0–100" } }, required: ["house", "valuation"], additionalProperties: false },
    draft: (raw) => {
      const a = setValuationArgs.parse(raw);
      const h = resolveHouse(a.house);
      if (!h) throw new Error(`No house matching "${a.house}".`);
      const share = a.ownershipPct ?? h.ownershipPct ?? 100;
      return {
        tool: "set_house_valuation",
        args: { id: h.id, valuation: a.valuation, ownershipPct: a.ownershipPct },
        preview: `Set ${h.name} market value to ${kr(a.valuation)} at ${share}% ownership`,
      };
    },
    commit: (raw) => {
      const a = valuationCommitArgs.parse(raw);
      const patch: Record<string, unknown> = { valuation: a.valuation, valuationAsOf: todayISO() };
      if (a.ownershipPct !== undefined) patch.ownershipPct = a.ownershipPct;
      const row = db.update(houses).set(patch).where(eq(houses.id, a.id)).returning().get();
      if (!row) throw new Error("House not found.");
      return row;
    },
  },
];

export const TOOLS: Tool[] = [...readTools, ...writeTools];
export function getTool(name: string): Tool | undefined { return TOOLS.find((t) => t.name === name); }
export function toolSpecs() {
  return TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
}

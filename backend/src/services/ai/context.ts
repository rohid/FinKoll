// ── Standing context for the assistant ──────────────────────────────────────────
// Injected into the system prompt every turn so the copilot *starts* knowing the
// user's financial position and the names it must map natural language onto. All
// figures are computed deterministically from the DB; the DB schema is included so
// the model can write correct read-only SQL via query_db.

import { db, sqlite } from "../../db";
import { categories, categoryGroups, houses, mortgages, pensionHoldings, recurringTemplates, people, tags } from "../../db/schema";
import { getMonthlySummary, getYearlySummary } from "../summary";

const kr = (n: number) => `${Math.round(n).toLocaleString("sv-SE")} kr`;

function schemaText(): string {
  const tables = sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name",
  ).all() as { name: string }[];
  return tables.map((t) => {
    const cols = sqlite.prepare(`PRAGMA table_info(${t.name})`).all() as { name: string }[];
    return `${t.name}(${cols.map((c) => c.name).join(", ")})`;
  }).join("\n");
}

function financialSnapshot(): string {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth() + 1;
  const lines: string[] = [];
  try {
    const month = getMonthlySummary(y, m);
    lines.push(`This month (${y}-${String(m).padStart(2, "0")}): income ${kr(month.totalIncome)}, expenses ${kr(month.totalExpenses)}, savings ${kr(month.totalSavings)}, net ${kr(month.netResult)}.`);
  } catch { /* ignore */ }
  try {
    const g = getYearlySummary(y).yearlyTotals;
    lines.push(`Year ${y} to date: income ${kr(g.income)}, expenses ${kr(g.expenses)}, savings ${kr(g.savings)}, net ${kr(g.netResult)}.`);
  } catch { /* ignore */ }

  const pension = (sqlite.prepare("SELECT COALESCE(SUM(current_value),0) v FROM pension_holdings").get() as { v: number }).v;
  const inv = (sqlite.prepare("SELECT total_value_sek v FROM portfolio_snapshots ORDER BY date DESC LIMIT 1").get() as { v: number } | undefined)?.v ?? 0;
  const houseRows = db.select().from(houses).all();
  const mort = db.select().from(mortgages).all();
  const homeEquity = houseRows.filter((h) => h.valuation != null).reduce((s, h) => {
    const loan = mort.filter((mm) => mm.houseId === h.id).reduce((a, mm) => a + mm.principalAmount, 0);
    return s + ((h.valuation ?? 0) - loan) * ((h.ownershipPct ?? 100) / 100);
  }, 0);
  lines.push(`Net worth: ${kr(pension + inv + homeEquity)} (pension ${kr(pension)}, investments ${kr(inv)}, home equity ${kr(homeEquity)}).`);
  return lines.join("\n");
}

export function buildSystemPrompt(): string {
  const cats = db.select().from(categories).all();
  const houseRows = db.select().from(houses).all();
  const mort = db.select().from(mortgages).all();
  const templates = db.select().from(recurringTemplates).all();
  const holdings = db.select().from(pensionHoldings).all();

  const groups = db.select().from(categoryGroups).all();
  const groupById = new Map(groups.map((g) => [g.id, g.name]));
  const catList = cats.map((c) => `${c.name} (${c.type}${c.groupId != null ? `, ${groupById.get(c.groupId)}` : ""})`).join(", ") || "—";
  const groupList = groups.map((g) => `${g.name} (${g.type})`).join(", ") || "—";
  const houseList = houseRows.map((h) => h.name).join(", ") || "—";
  const mortList = mort.map((m) => `${m.name} ${kr(m.principalAmount)} @ ${m.interestRate}%`).join("; ") || "—";
  const tmplList = templates.map((t) => t.description).join(", ") || "—";
  const pensList = holdings.map((h) => h.name).join(", ") || "—";
  const peopleList = db.select().from(people).all().map((p) => p.name).join(", ") || "—";
  const tagList = db.select().from(tags).all().map((t) => t.name).join(", ") || "—";

  return [
    "You are FinKoll's financial copilot — a knowledgeable, concise assistant for one household's self-hosted budget app. All amounts are Swedish kronor (kr).",
    "",
    "## The user's current position",
    financialSnapshot(),
    "",
    "## Known names (map the user's words onto these)",
    `Category groups: ${groupList}`,
    `Categories: ${catList}`,
    `Properties (houses): ${houseList}`,
    `Mortgages: ${mortList}`,
    `Recurring templates: ${tmplList}`,
    `Pension holdings: ${pensList}`,
    `People (for attribution): ${peopleList}`,
    `Tags: ${tagList}`,
    "",
    "## How to work",
    "- Use the provided tools for every number. NEVER estimate, and never recompute, re-add, scale, multiply or round a value the tool already returned.",
    "- When a tool result has a `summary` field, answer with that summary and repeat its figures EXACTLY, digit for digit. If it gives a total, state that exact total — do not derive your own.",
    "- Do NOT add caveats about mortgages, loans, ownership shares, or what is 'included' or 'excluded' — the tools already account for all of that. Report what the tool returned, nothing more.",
    "- For one person's figures (e.g. one person's salary rather than the whole Salary total), prefer get_income_by_person — it uses the transaction's attributed person and is exact. Fall back to find_transactions (matches the description text) only when the people list above is empty.",
    "- For analysis the specific tools don't cover, use query_db with a single read-only SELECT (writes are rejected). Prefer the schema below; add a LIMIT.",
    "- To add or change data, call a write tool. It produces a draft the user must confirm — you never save anything yourself. State clearly what you are about to add/change.",
    "- Be concise and direct. If a tool returns an error or no data, say so plainly.",
    "",
    "## Database schema (for query_db)",
    schemaText(),
  ].join("\n");
}

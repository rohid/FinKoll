// Worksheet sheet model + FinKoll data bridge.
import type { YearlySummary } from "@/types";

export const DEFAULT_ROWS = 40;
export const DEFAULT_COLS = 8;

export interface SheetData {
  v: 1;
  rows: number;
  cols: number;
  cells: string[][]; // raw cell contents (formulas or literals), rows × cols
  fills: Record<string, string>; // "r:c" → CSS background color (fill / zebra)
}

export function emptySheet(rows = DEFAULT_ROWS, cols = DEFAULT_COLS): SheetData {
  return {
    v: 1,
    rows,
    cols,
    cells: Array.from({ length: rows }, () => Array.from({ length: cols }, () => "")),
    fills: {},
  };
}

/** Parse a stored JSON blob into a normalized SheetData, padding/truncating to its declared size. */
export function parseSheet(json: string | null | undefined): SheetData {
  if (!json) return emptySheet();
  let raw: any;
  try {
    raw = JSON.parse(json);
  } catch {
    return emptySheet();
  }
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.cells)) return emptySheet();

  const rows = Math.max(1, Number(raw.rows) || raw.cells.length || DEFAULT_ROWS);
  const cols = Math.max(1, Number(raw.cols) || (raw.cells[0]?.length ?? DEFAULT_COLS));
  const cells = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      const v = raw.cells?.[r]?.[c];
      return typeof v === "string" ? v : v == null ? "" : String(v);
    }),
  );
  const fills: Record<string, string> = {};
  if (raw.fills && typeof raw.fills === "object") {
    for (const [key, val] of Object.entries(raw.fills)) {
      if (typeof val === "string") fills[key] = val;
    }
  }
  return { v: 1, rows, cols, cells, fills };
}

export function serializeSheet(sheet: SheetData): string {
  return JSON.stringify({ v: 1, rows: sheet.rows, cols: sheet.cols, cells: sheet.cells, fills: sheet.fills });
}

/** Spreadsheet column index → letter(s): 0→A, 25→Z, 26→AA. */
export function colLabel(i: number): string {
  let s = "";
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

// ── FinKoll data bridge ───────────────────────────────────────────────────────
// Each named value becomes a HyperFormula named expression, referenced from a
// cell as `=FK_NET_2026`. The side panel lists them for one-click insertion.
export interface NamedValue {
  name: string; // e.g. FK_NET_2026 — valid HyperFormula named-expression identifier
  value: number;
  label: string; // human-friendly, shown in the panel
  group: string;
}

/** Turn a category/label into a valid named-expression fragment (letters/digits/underscore). */
function sanitize(s: string): string {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_") || "X";
}

/** Build the live FinKoll named values for a year from its yearly summary. */
export function buildFinkollNamed(year: number, s: YearlySummary | undefined): NamedValue[] {
  if (!s) return [];
  const out: NamedValue[] = [];
  const seen = new Set<string>();
  const push = (frag: string, value: number, label: string, group: string) => {
    const name = `FK_${frag}_${year}`;
    if (seen.has(name)) return;
    seen.add(name);
    out.push({ name, value: Math.round(value), label, group });
  };

  push("INCOME", s.yearlyTotals.income, `Income — total ${year}`, "Year totals");
  push("EXPENSES", s.yearlyTotals.expenses, `Expenses — total ${year}`, "Year totals");
  push("SAVINGS", s.yearlyTotals.savings, `Savings — total ${year}`, "Year totals");
  push("NET", s.yearlyTotals.netResult, `Net result — total ${year}`, "Year totals");

  push("INCOME_AVG", s.yearlyTotals.income / 12, `Income — avg/mo ${year}`, "Monthly average");
  push("EXPENSES_AVG", s.yearlyTotals.expenses / 12, `Expenses — avg/mo ${year}`, "Monthly average");
  push("SAVINGS_AVG", s.yearlyTotals.savings / 12, `Savings — avg/mo ${year}`, "Monthly average");
  push("NET_AVG", s.yearlyTotals.netResult / 12, `Net result — avg/mo ${year}`, "Monthly average");

  for (const row of s.rows) {
    const groupLabel = row.type === "INCOME" ? "Income categories" : row.type === "EXPENSE" ? "Expense categories" : "Savings categories";
    push(sanitize(row.categoryName), row.total, `${row.categoryName} ${year}`, groupLabel);
  }
  return out;
}

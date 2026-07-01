import type { Category } from "@/types";

// ── Swedish month names → 1..12 (full + 3-letter prefix) ──────────────────────
const MONTH_MAP: Record<string, number> = {
  januari: 1, februari: 2, mars: 3, april: 4, maj: 5, juni: 6,
  juli: 7, augusti: 8, september: 9, oktober: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dec: 12,
};

function monthOf(cell: unknown): number | null {
  const s = String(cell ?? "").trim().toLowerCase();
  if (!s) return null;
  if (MONTH_MAP[s] !== undefined) return MONTH_MAP[s];
  // try 3-letter prefix (handles "Maj", "Januari" etc.)
  const p3 = s.slice(0, 3);
  return MONTH_MAP[p3] ?? null;
}

type SectionType = "INCOME" | "EXPENSE" | "SAVINGS";

function sectionTypeOf(firstCell: string): SectionType | null {
  const s = firstCell.trim().toLowerCase();
  if (s.startsWith("in"))   return "INCOME";
  if (s.startsWith("ut"))   return "EXPENSE";
  if (s.startsWith("spar")) return "SAVINGS";
  return null;
}

const SKIP_LABELS = new Set(["sum", "summa", "kvar", "total", "totalt", "netto", ""]);

// ── Number parsing — handles "32 499   ", NBSP, comma decimals ─────────────────
export function parseAmount(cell: unknown): number | null {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === "number") return cell;
  let s = String(cell).trim();
  if (!s) return null;
  // strip spaces (incl. NBSP / thin), keep digits, sign, separators
  s = s.replace(/[\s  ]/g, "");
  // if both . and , present, assume . thousands and , decimal (sv) → drop ., comma→dot
  if (s.includes(".") && s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// ── Detection result types ────────────────────────────────────────────────────
export interface DetectedRow {
  /** original label from the file */
  label: string;
  type: SectionType;
  /** month → amount (only non-empty cells) */
  amounts: Record<number, number>;
  /** best category guess (may be null) */
  matchedCategoryId: number | null;
  matchScore: number;
}

export interface DetectedImport {
  year: number;
  months: number[];      // distinct months found across all sections
  rows: DetectedRow[];
  warnings: string[];
}

// ── Category fuzzy matching ───────────────────────────────────────────────────
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")   // drop parenthetical
    .replace(/[^a-zåäö0-9 ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parenthetical(s: string): string {
  const m = s.match(/\(([^)]*)\)/);
  return m ? m[1].toLowerCase().trim() : "";
}

function tokenScore(a: string, b: string): number {
  const ta = new Set(a.split(" ").filter(Boolean));
  const tb = new Set(b.split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size);
}

/** Best matching category of the given type. Returns {id, score} or null. */
export function matchCategory(
  label: string,
  type: SectionType,
  categories: Category[]
): { id: number; score: number } | null {
  const pool = categories.filter((c) => c.type === type && c.isActive);
  if (pool.length === 0) return null;

  const normLabel = normalize(label);
  const paren = parenthetical(label);

  let best: { id: number; score: number } | null = null;
  for (const cat of pool) {
    const normCat = normalize(cat.name);
    let score = 0;
    if (normCat === normLabel) score = 1;
    else if (normLabel.includes(normCat) || normCat.includes(normLabel)) score = 0.85;
    else score = tokenScore(normLabel, normCat);

    // The parenthetical hint often names the target category strongly
    if (paren) {
      const pScore = normalize(paren) === normCat ? 1
        : normCat.includes(normalize(paren)) || normalize(paren).includes(normCat) ? 0.8
        : tokenScore(normalize(paren), normCat);
      score = Math.max(score, pScore);
    }

    if (!best || score > best.score) best = { id: cat.id, score };
  }
  return best && best.score > 0 ? best : null;
}

// ── Main detection ────────────────────────────────────────────────────────────
export function detectImport(
  grid: unknown[][],
  categories: Category[],
  fallbackYear: number
): DetectedImport {
  const warnings: string[] = [];
  let year = fallbackYear;
  let currentType: SectionType | null = null;
  let monthCols: { col: number; month: number }[] = [];
  const rows: DetectedRow[] = [];
  const monthsSeen = new Set<number>();

  for (const raw of grid) {
    if (!raw || raw.length === 0) continue;
    const first = String(raw[0] ?? "").trim();

    // Is this a section header? → its non-first cells are month names
    const monthsInRow: { col: number; month: number }[] = [];
    for (let c = 1; c < raw.length; c++) {
      const m = monthOf(raw[c]);
      if (m) monthsInRow.push({ col: c, month: m });
    }
    const looksLikeHeader = monthsInRow.length > 0 && sectionTypeOf(first) !== null;

    if (looksLikeHeader) {
      currentType = sectionTypeOf(first);
      monthCols = monthsInRow;
      monthsInRow.forEach((mc) => monthsSeen.add(mc.month));
      const yMatch = first.match(/(20\d{2})/);
      if (yMatch) year = parseInt(yMatch[1]);
      continue;
    }

    if (!currentType || monthCols.length === 0) continue;          // not inside a section yet
    if (SKIP_LABELS.has(first.toLowerCase())) continue;            // Sum / Summa / Kvar / blank

    // Data row — collect amounts from the month columns
    const amounts: Record<number, number> = {};
    for (const { col, month } of monthCols) {
      const amt = parseAmount(raw[col]);
      if (amt !== null && amt !== 0) amounts[month] = amt;
    }
    if (Object.keys(amounts).length === 0) continue;               // empty row

    const match = matchCategory(first, currentType, categories);
    rows.push({
      label: first,
      type: currentType,
      amounts,
      matchedCategoryId: match?.id ?? null,
      matchScore: match?.score ?? 0,
    });
  }

  if (rows.length === 0) warnings.push("No data rows detected. Check the file layout.");

  return {
    year,
    months: [...monthsSeen].sort((a, b) => a - b),
    rows,
    warnings,
  };
}

/** Alias key for a row label. Must match the backend's normalizeLabel. */
export function normalizeLabel(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

// ── CSV → grid (semicolon-delimited, the format FinKoll exports) ───────────────
export function csvToGrid(text: string): string[][] {
  // strip BOM
  const clean = text.replace(/^﻿/, "");
  return clean.split(/\r?\n/).map((line) => line.split(";"));
}

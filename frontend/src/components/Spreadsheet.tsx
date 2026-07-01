import { useRef, useState, useEffect, useLayoutEffect } from "react";
import { HyperFormula } from "hyperformula";
import { Plus, Database, ClipboardPaste, Sigma, ChevronDown, PaintBucket, Rows3, Eraser } from "lucide-react";
import { cn } from "@/lib/utils";
import { colLabel, type SheetData, type NamedValue } from "@/lib/worksheet";
import { ZEBRA_COLORS, ZEBRA_RGB } from "@/lib/prefs";
import { useTranslation } from "react-i18next";

const SHEET_ID = 0;
const fillColor = (rgb: string) => `rgba(${rgb}, 0.28)`;
const ZEBRA_FILL = "var(--zebra-stripe)"; // ties into the global Appearance setting

// Parse a value into a number, stripping currency (kr / SEK / symbols) and
// thousands grouping, so "12 500 kr", "1 234,56 kr", "1.234,56" all become real
// numbers. Returns null when the value isn't numeric (it's text).
function parseNumeric(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;
  s = s.replace(/kronor|sek|skr|kr/gi, "").replace(/[€$£%]/g, "").replace(/:-/g, "");
  s = s.replace(/−/g, "-"); // unicode minus → hyphen
  s = s.replace(/\s/g, "");      // drop spaces / nbsp / narrow-nbsp grouping
  if (!s || /[a-zA-Z]/.test(s)) return null; // leftover letters → it's text
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  if (hasDot && hasComma) {
    // The right-most separator is the decimal; the other is grouping.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (hasComma) {
    s = s.replace(",", "."); // Swedish decimal comma
  }
  if (/^-?\d+(\.\d*)?$/.test(s)) {
    const n = Number(s);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

// What the engine should see: a formula stays a formula; a numeric value becomes
// a real number; anything else stays text.
function engineValue(raw: string): string | number | null {
  if (raw === "") return null;
  if (raw[0] === "=") return raw;
  const n = parseNumeric(raw);
  return n === null ? raw : n;
}

// What to store in a cell after paste: clean numbers lose their currency text;
// formulas and real text are kept verbatim.
function cleanForCell(raw: string): string {
  const t = raw.trim();
  if (t === "" || t[0] === "=") return t;
  const n = parseNumeric(t);
  return n === null ? t : String(n);
}

// Build a fresh engine from raw cells + the live FinKoll named values.
function buildEngine(cells: string[][], named: NamedValue[]): HyperFormula {
  const hf = HyperFormula.buildFromArray(
    cells.map((row) => row.map(engineValue)),
    { licenseKey: "gpl-v3" },
  );
  for (const nv of named) {
    try { hf.addNamedExpression(nv.name, nv.value); } catch { /* duplicate/invalid name — skip */ }
  }
  return hf;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") {
    return Number.isInteger(v)
      ? v.toLocaleString("sv-SE")
      : v.toLocaleString("sv-SE", { maximumFractionDigits: 2 });
  }
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  // DetailedCellError exposes a `.value` like "#DIV/0!"
  if (typeof v === "object" && v !== null && "value" in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>).value);
  }
  return String(v);
}

// Parse clipboard text from Excel / Google Sheets: tab-separated columns,
// newline-separated rows, with CSV-style double-quote escaping for cells that
// themselves contain tabs, newlines or quotes.
function parseClipboard(text: string): string[][] {
  let s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (s.endsWith("\n")) s = s.slice(0, -1);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"' && field === "") {
      inQuotes = true;
    } else if (ch === "\t") {
      row.push(field); field = "";
    } else if (ch === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else {
      field += ch;
    }
  }
  row.push(field);
  rows.push(row);
  return rows;
}

export function Spreadsheet({
  initial, namedValues, onChange,
}: {
  initial: SheetData;
  namedValues: NamedValue[];
  onChange: (next: SheetData) => void;
}) {
  const { t } = useTranslation();
  const [cols, setCols] = useState(initial.cols);
  const [rows, setRows] = useState(initial.rows);
  const [cells, setCells] = useState<string[][]>(initial.cells);
  const [sel, setSel] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const [rangeEnd, setRangeEnd] = useState<{ r: number; c: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [fills, setFills] = useState<Record<string, string>>(initial.fills ?? {});
  const [, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  const gridRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // Centralized change emit — always carries the latest of every field.
  function emit(next: Partial<SheetData>) {
    onChange({ v: 1, rows, cols, cells, fills, ...next });
  }

  // The HyperFormula engine. Built inside an effect (not during render) so it
  // survives React 18 StrictMode's mount→unmount→remount cycle in dev: building
  // it in render left a destroyed, null engine after the simulated remount,
  // which silently dropped every value so all formulas read 0.
  const hfRef = useRef<HyperFormula | null>(null);
  const cellsRef = useRef(cells);
  cellsRef.current = cells;
  const namedRef = useRef(namedValues);
  namedRef.current = namedValues;

  useLayoutEffect(() => {
    hfRef.current = buildEngine(cellsRef.current, namedRef.current);
    bump(); // engine now exists — re-render (before paint) so computed values appear
    return () => { hfRef.current?.destroy(); hfRef.current = null; };
  }, []);

  // End a drag selection anywhere the mouse is released.
  useEffect(() => {
    const up = () => { dragging.current = false; };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  // Re-sync FinKoll named expressions whenever the live values change.
  useEffect(() => {
    const hf = hfRef.current;
    if (!hf) return;
    hf.batch(() => {
      for (const name of hf.listNamedExpressions()) {
        try { hf.removeNamedExpression(name); } catch { /* ignore */ }
      }
      for (const nv of namedValues) {
        try { hf.addNamedExpression(nv.name, nv.value); } catch { /* ignore */ }
      }
    });
    bump();
  }, [namedValues]);

  function setCell(r: number, c: number, value: string) {
    const next = cells.map((row, ri) => (ri === r ? row.map((v, ci) => (ci === c ? value : v)) : row));
    hfRef.current?.setCellContents({ sheet: SHEET_ID, row: r, col: c }, engineValue(value));
    setCells(next);
    emit({ cells: next });
  }

  function addRows() {
    const added = 10;
    const next = [...cells, ...Array.from({ length: added }, () => Array.from({ length: cols }, () => ""))];
    try { hfRef.current?.addRows(SHEET_ID, [rows, added]); } catch { /* ignore */ }
    const nr = rows + added;
    setCells(next);
    setRows(nr);
    emit({ rows: nr, cells: next });
  }

  // Paste a tab-separated block (Excel / Sheets) starting at the selected cell,
  // growing the sheet if the pasted block extends past the current bounds.
  function handlePaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text/plain");
    if (!text || (!text.includes("\t") && !text.includes("\n"))) return; // let single-cell paste fall through
    e.preventDefault();
    // Strip currency/grouping so pasted values land as clean numbers.
    const matrix = parseClipboard(text).map((r) => r.map(cleanForCell));
    if (matrix.length === 0) return;

    const startR = sel.r;
    const startC = sel.c;
    const blockH = matrix.length;
    const blockW = Math.max(...matrix.map((r) => r.length));
    const nextRows = Math.max(rows, startR + blockH);
    const nextCols = Math.max(cols, startC + blockW);

    const grid = Array.from({ length: nextRows }, (_, r) =>
      Array.from({ length: nextCols }, (_, c) => cells[r]?.[c] ?? ""),
    );
    for (let i = 0; i < blockH; i++) {
      for (let j = 0; j < matrix[i].length; j++) {
        grid[startR + i][startC + j] = matrix[i][j];
      }
    }

    const hf = hfRef.current;
    if (hf) {
      try {
        if (nextRows > rows) hf.addRows(SHEET_ID, [rows, nextRows - rows]);
        if (nextCols > cols) hf.addColumns(SHEET_ID, [cols, nextCols - cols]);
        const block = matrix.map((r) => Array.from({ length: blockW }, (_, j) => engineValue(r[j] ?? "")));
        hf.setCellContents({ sheet: SHEET_ID, row: startR, col: startC }, block);
      } catch { /* ignore — state below is still updated */ }
    }

    setCells(grid);
    setRows(nextRows);
    setCols(nextCols);
    emit({ rows: nextRows, cols: nextCols, cells: grid });
  }

  const valueAt = (r: number, c: number): unknown => hfRef.current?.getCellValue({ sheet: SHEET_ID, row: r, col: c });
  const isNum = (r: number, c: number): boolean => typeof valueAt(r, c) === "number";

  // Cell text: formulas and numeric values show the computed/formatted number
  // (so "12 500 kr" renders as a clean 12 500); non-numeric text shows verbatim.
  function display(r: number, c: number): string {
    const rawText = cells[r]?.[c] ?? "";
    if (rawText === "") return "";
    if (rawText[0] === "=") return formatValue(valueAt(r, c));
    const v = valueAt(r, c);
    return typeof v === "number" ? formatValue(v) : rawText;
  }

  // AutoSum-style range: the contiguous run of numbers directly above the
  // selected cell, else to its left. Returns an A1 range or null.
  function autoRange(r: number, c: number): string | null {
    let top = r - 1;
    while (top >= 0 && isNum(top, c)) top--;
    if (top < r - 1) return `${colLabel(c)}${top + 2}:${colLabel(c)}${r}`;
    let left = c - 1;
    while (left >= 0 && isNum(r, left)) left--;
    if (left < c - 1) return `${colLabel(left + 1)}${r + 1}:${colLabel(c - 1)}${r + 1}`;
    return null;
  }

  // Grow the grid (cells + engine) to at least the given size; returns the new
  // cell matrix (a copy) and dimensions.
  function ensureSize(needRows: number, needCols: number): { grid: string[][]; nr: number; nc: number } {
    const nr = Math.max(rows, needRows);
    const nc = Math.max(cols, needCols);
    const grid = Array.from({ length: nr }, (_, r) => Array.from({ length: nc }, (_, c) => cells[r]?.[c] ?? ""));
    const hf = hfRef.current;
    if (hf) {
      try {
        if (nr > rows) hf.addRows(SHEET_ID, [rows, nr - rows]);
        if (nc > cols) hf.addColumns(SHEET_ID, [cols, nc - cols]);
      } catch { /* ignore */ }
    }
    return { grid, nr, nc };
  }

  const [fnOpen, setFnOpen] = useState(false);
  const FUNCS = ["SUM", "AVERAGE", "MIN", "MAX", "COUNT"] as const;
  function applyFn(fn: string) {
    const hasRange = rangeEnd && (rangeEnd.r !== sel.r || rangeEnd.c !== sel.c);
    if (hasRange) {
      // Summarize the selected range into the cell just past it (below a column,
      // right of a single row) — never into the range itself (that's circular).
      const range = `${colLabel(c1)}${r1 + 1}:${colLabel(c2)}${r2 + 1}`;
      const singleRow = r1 === r2;
      const tr = singleRow ? r1 : r2 + 1;
      const tc = singleRow ? c2 + 1 : c1;
      const { grid, nr, nc } = ensureSize(tr + 1, tc + 1);
      grid[tr][tc] = `=${fn}(${range})`;
      hfRef.current?.setCellContents({ sheet: SHEET_ID, row: tr, col: tc }, `=${fn}(${range})`);
      setCells(grid);
      setRows(nr);
      setCols(nc);
      emit({ rows: nr, cols: nc, cells: grid });
      setSel({ r: tr, c: tc });
      setRangeEnd(null);
    } else {
      const range = autoRange(sel.r, sel.c);
      setCell(sel.r, sel.c, range ? `=${fn}(${range})` : `=${fn}()`);
    }
    setFnOpen(false);
  }

  const insertRef = (name: string) => setCell(sel.r, sel.c, `=${name}`);

  // ── Selection range ─────────────────────────────────────────────────────────
  const r1 = Math.min(sel.r, rangeEnd?.r ?? sel.r);
  const r2 = Math.max(sel.r, rangeEnd?.r ?? sel.r);
  const c1 = Math.min(sel.c, rangeEnd?.c ?? sel.c);
  const c2 = Math.max(sel.c, rangeEnd?.c ?? sel.c);
  const inRange = (r: number, c: number) => r >= r1 && r <= r2 && c >= c1 && c <= c2;

  function move(nr: number, nc: number, extend: boolean) {
    const R = Math.max(0, Math.min(rows - 1, nr));
    const C = Math.max(0, Math.min(cols - 1, nc));
    if (extend) setRangeEnd({ r: R, c: C });
    else { setSel({ r: R, c: C }); setRangeEnd(null); }
  }

  function clearRange() {
    const next = cells.map((row) => [...row]);
    const hf = hfRef.current;
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        next[r][c] = "";
        hf?.setCellContents({ sheet: SHEET_ID, row: r, col: c }, null);
      }
    }
    setCells(next);
    emit({ cells: next });
  }

  // Keyboard navigation / editing when the grid (not a cell input) has focus.
  function gridKeyDown(e: React.KeyboardEvent) {
    if (editing) return;
    const { r, c } = sel;
    if (e.key === "ArrowDown") { e.preventDefault(); move(r + 1, c, e.shiftKey); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(r - 1, c, e.shiftKey); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); move(r, c - 1, e.shiftKey); }
    else if (e.key === "ArrowRight") { e.preventDefault(); move(r, c + 1, e.shiftKey); }
    else if (e.key === "Tab") { e.preventDefault(); move(r, c + (e.shiftKey ? -1 : 1), false); }
    else if (e.key === "Enter" || e.key === "F2") { e.preventDefault(); setEditing(true); }
    else if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); clearRange(); }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault(); setCell(r, c, e.key); setEditing(true);
    }
  }

  function onCellMouseDown(e: React.MouseEvent, r: number, c: number) {
    e.preventDefault(); // don't start a native text selection while dragging
    gridRef.current?.focus();
    setEditing(false);
    if (e.shiftKey) setRangeEnd({ r, c });
    else { setSel({ r, c }); setRangeEnd(null); }
    dragging.current = true;
  }

  // ── Formatting ──────────────────────────────────────────────────────────────
  const [fmtOpen, setFmtOpen] = useState(false);

  function applyFill(color: string | null) {
    const nextFills = { ...fills };
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const key = `${r}:${c}`;
        if (color) nextFills[key] = color;
        else delete nextFills[key];
      }
    }
    setFills(nextFills);
    emit({ fills: nextFills });
    setFmtOpen(false);
  }

  // Zebra: tint every other row of the range (relative to its top).
  function applyZebra() {
    const nextFills = { ...fills };
    for (let r = r1; r <= r2; r++) {
      const stripe = (r - r1) % 2 === 1;
      for (let c = c1; c <= c2; c++) {
        const key = `${r}:${c}`;
        if (stripe) nextFills[key] = ZEBRA_FILL;
        else delete nextFills[key];
      }
    }
    setFills(nextFills);
    emit({ fills: nextFills });
    setFmtOpen(false);
  }

  // Group named values for the panel.
  const groups: { group: string; items: NamedValue[] }[] = [];
  for (const nv of namedValues) {
    let g = groups.find((x) => x.group === nv.group);
    if (!g) { g = { group: nv.group, items: [] }; groups.push(g); }
    g.items.push(nv);
  }

  const raw = cells[sel.r]?.[sel.c] ?? "";
  const selRef = `${colLabel(sel.c)}${sel.r + 1}`;
  const selResult = formatValue(valueAt(sel.r, sel.c));

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
        {/* Insert-function (AutoSum) menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setFnOpen((o) => !o)}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border hover:bg-muted transition-colors"
          >
            <Sigma size={13} /> {t("worksheets.functions")} <ChevronDown size={11} />
          </button>
          {fnOpen && (
            <>
              <button type="button" aria-hidden className="fixed inset-0 z-20 cursor-default" onClick={() => setFnOpen(false)} />
              <div className="absolute left-0 mt-1 w-44 rounded-md border bg-card shadow-md py-1 z-30">
                {FUNCS.map((fn) => (
                  <button
                    key={fn}
                    type="button"
                    onClick={() => applyFn(fn)}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                  >
                    <span>{t(`worksheets.fn.${fn}`)}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{fn}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Format (fill color / zebra) menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setFmtOpen((o) => !o)}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border hover:bg-muted transition-colors"
          >
            <PaintBucket size={13} /> {t("worksheets.format")} <ChevronDown size={11} />
          </button>
          {fmtOpen && (
            <>
              <button type="button" aria-hidden className="fixed inset-0 z-20 cursor-default" onClick={() => setFmtOpen(false)} />
              <div className="absolute left-0 mt-1 w-52 rounded-md border bg-card shadow-md p-2 z-30">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground px-1 pb-1.5">{t("worksheets.fillColor")}</p>
                <div className="flex flex-wrap gap-1.5 px-1 pb-2">
                  {ZEBRA_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      title={c}
                      onClick={() => applyFill(fillColor(ZEBRA_RGB[c]))}
                      className="h-6 w-6 rounded border hover:scale-110 transition-transform"
                      style={{ backgroundColor: fillColor(ZEBRA_RGB[c]) }}
                    />
                  ))}
                </div>
                <div className="border-t pt-1 space-y-0.5">
                  <button type="button" onClick={applyZebra} className="w-full flex items-center gap-2 px-1.5 py-1.5 text-xs rounded hover:bg-muted transition-colors">
                    <Rows3 size={13} /> {t("worksheets.zebra")}
                  </button>
                  <button type="button" onClick={() => applyFill(null)} className="w-full flex items-center gap-2 px-1.5 py-1.5 text-xs rounded hover:bg-muted transition-colors">
                    <Eraser size={13} /> {t("worksheets.clearFormat")}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={addRows}
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border hover:bg-muted transition-colors"
        >
          <Plus size={13} /> {t("worksheets.addRows")}
        </button>
        <span className="text-[11px] text-muted-foreground">{t("worksheets.selectHint")}</span>
        <span className="flex-1" />
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <ClipboardPaste size={12} /> {t("worksheets.pasteHint")}
        </span>
      </div>

      {/* Formula bar */}
      <div className="flex items-stretch gap-2 px-3 py-2 border-b">
        <span className="font-mono text-xs bg-muted/40 border rounded-md px-2.5 py-1.5 min-w-12 text-center self-center">{selRef}</span>
        <span className="text-xs text-muted-foreground self-center italic">fx</span>
        <input
          value={raw}
          onChange={(e) => setCell(sel.r, sel.c, e.target.value)}
          className="flex-1 font-mono text-xs bg-transparent outline-none border-b border-transparent focus:border-primary/40"
          placeholder={t("worksheets.formulaPlaceholder")}
        />
        {selResult !== "" && raw.startsWith("=") && (
          <span className="font-mono text-xs text-muted-foreground self-center">→ {selResult}</span>
        )}
      </div>

      <div className="flex items-start">
        {/* Grid */}
        <div
          ref={gridRef}
          tabIndex={0}
          onKeyDown={gridKeyDown}
          onPaste={handlePaste}
          className="flex-1 overflow-auto max-h-[60vh] outline-none"
        >
          <table className="border-collapse text-xs font-mono" style={{ tableLayout: "fixed" }}>
            <thead>
              <tr>
                <th className="sticky top-0 z-10 w-10 h-6 bg-muted/50 border border-border/40" />
                {Array.from({ length: cols }, (_, c) => (
                  <th key={c} className="sticky top-0 z-10 w-28 h-6 bg-muted/50 border border-border/40 font-medium text-muted-foreground">
                    {colLabel(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rows }, (_, r) => (
                <tr key={r}>
                  <td className="w-10 text-center bg-muted/50 border border-border/40 text-muted-foreground select-none">{r + 1}</td>
                  {Array.from({ length: cols }, (_, c) => {
                    const isAnchor = sel.r === r && sel.c === c;
                    const fill = fills[`${r}:${c}`];
                    if (isAnchor && editing) {
                      return (
                        <td key={c} className="w-28 border border-primary p-0" style={{ boxShadow: "inset 0 0 0 2px hsl(var(--primary))", backgroundColor: fill }}>
                          <input
                            autoFocus
                            value={cells[r][c]}
                            onChange={(e) => setCell(r, c, e.target.value)}
                            onBlur={() => setEditing(false)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); setEditing(false); move(r + 1, c, false); gridRef.current?.focus(); }
                              else if (e.key === "Tab") { e.preventDefault(); setEditing(false); move(r, c + (e.shiftKey ? -1 : 1), false); gridRef.current?.focus(); }
                              else if (e.key === "Escape") { e.preventDefault(); setEditing(false); gridRef.current?.focus(); }
                            }}
                            className="w-full h-6 px-1.5 bg-transparent outline-none"
                          />
                        </td>
                      );
                    }
                    const disp = display(r, c);
                    const selected = inRange(r, c);
                    return (
                      <td
                        key={c}
                        onMouseDown={(e) => onCellMouseDown(e, r, c)}
                        onMouseEnter={() => { if (dragging.current) setRangeEnd({ r, c }); }}
                        onDoubleClick={() => { setSel({ r, c }); setRangeEnd(null); setEditing(true); }}
                        style={{
                          backgroundColor: fill,
                          boxShadow: isAnchor
                            ? "inset 0 0 0 2px hsl(var(--primary))"
                            : selected
                              ? "inset 0 0 0 1px hsl(var(--primary) / 0.45)"
                              : undefined,
                        }}
                        className={cn(
                          "w-28 h-6 px-1.5 border border-border/40 cursor-cell whitespace-nowrap overflow-hidden text-ellipsis select-none",
                          isNum(r, c) ? "text-right" : "text-left",
                        )}
                        title={disp}
                      >
                        {disp}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* FinKoll data panel */}
        <div className="w-56 flex-shrink-0 border-l bg-muted/20 self-stretch max-h-[60vh] overflow-auto">
          <div className="flex items-center gap-1.5 px-3 py-2 border-b sticky top-0 bg-muted/40 backdrop-blur">
            <Database size={13} className="text-primary" />
            <span className="text-xs font-medium">{t("worksheets.finkollData")}</span>
          </div>
          {groups.length === 0 ? (
            <p className="px-3 py-3 text-[11px] text-muted-foreground">{t("worksheets.noFinkollData")}</p>
          ) : (
            groups.map((g) => (
              <div key={g.group}>
                <p className="px-3 pt-2.5 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">{g.group}</p>
                {g.items.map((nv) => (
                  <button
                    key={nv.name}
                    type="button"
                    onClick={() => insertRef(nv.name)}
                    title={`${nv.name}  =  ${nv.value.toLocaleString("sv-SE")}`}
                    className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-muted/60 transition-colors border-b border-border/30"
                  >
                    <span className="text-[11px] truncate">{nv.label}</span>
                    <span className="font-mono text-[11px] text-muted-foreground flex-shrink-0">{nv.value.toLocaleString("sv-SE")}</span>
                  </button>
                ))}
              </div>
            ))
          )}
          <p className="px-3 py-2.5 text-[10px] text-muted-foreground/70 leading-relaxed border-t">{t("worksheets.finkollHint")}</p>
        </div>
      </div>
    </div>
  );
}

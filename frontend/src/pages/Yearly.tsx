import { useState, useRef, Fragment } from "react";
import { createPortal } from "react-dom";
import { useYearlySummary, useYearlyDetailed, useTransactions, useYearLocks, useAllSettings, useHousingSummary } from "@/api/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { fmt, fmtPct } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, ChevronDown, Scissors, Lock, Table2, ListTree, Building2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Transaction, YearlyDetailed, HousingSummary } from "@/types";

// ── Highlight helpers ─────────────────────────────────────────────────────────
// Alert thresholds (kr) above which an expense/savings amount is flagged.
type Alerts = { expense: number | null; savings: number | null };

const parseNum = (v: string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
};

// Class for an amount cell: an over-threshold expense (orange) / savings (blue)
// alert takes priority over the current-month column band.
function amountCls(
  type: "INCOME" | "EXPENSE" | "SAVINGS",
  value: number,
  monthIdx: number,
  alerts: Alerts,
  currentMonth: number,
): string {
  if (type === "EXPENSE" && alerts.expense !== null && value > alerts.expense)
    return "bg-orange-500/20 text-orange-700 font-semibold";
  if (type === "SAVINGS" && alerts.savings !== null && value > alerts.savings)
    return "bg-blue-500/20 text-blue-700 font-semibold";
  return monthIdx + 1 === currentMonth ? "bg-primary/5" : "";
}

// Net-result cell: below the net target → orange warning; otherwise green/red by sign.
function netCls(value: number, monthIdx: number, netTarget: number | null, currentMonth: number): string {
  const band = monthIdx + 1 === currentMonth ? "bg-primary/5" : "";
  if (netTarget !== null && value < netTarget) return "bg-orange-500/15 text-orange-700";
  return cn(value >= 0 ? "text-green-600" : "text-red-600", band);
}

// Header cell highlight for the current month column.
const monthHeadCls = (monthIdx: number, currentMonth: number) =>
  monthIdx + 1 === currentMonth ? "bg-primary/10 text-primary font-semibold" : "";

// ── Cell drill-down dialog: shows all transactions for one category+month ─────
function CellDialog({
  open, onClose, year, month, categoryId, categoryName, monthLabel,
}: {
  open: boolean;
  onClose: () => void;
  year: number;
  month: number; // 1-based
  categoryId: number;
  categoryName: string;
  monthLabel: string;
}) {
  const { t } = useTranslation();
  const { data: allTx } = useTransactions(year, month);
  const [expanded, setExpanded] = useState<number | null>(null);

  const txns: Transaction[] = (allTx ?? []).filter((tx: Transaction) => tx.categoryId === categoryId);
  const total = txns.reduce((s, tx) => s + tx.amount, 0);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`${categoryName} · ${monthLabel} ${year}`}
    >
      {txns.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("monthly.noTransactions")}</p>
      ) : (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-3">
            {t("monthly.cellTransactions")}
          </p>
          <div className="rounded-md border divide-y">
            {txns.map((tx) => (
              <div key={tx.id}>
                {/* Transaction row */}
                <button
                  type="button"
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors ${
                    tx.items.length > 0 ? "hover:bg-muted/40 cursor-pointer" : "cursor-default"
                  }`}
                  onClick={() => tx.items.length > 0 && setExpanded(expanded === tx.id ? null : tx.id)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {tx.items.length > 0 && (
                      <Scissors size={11} className="text-muted-foreground flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{tx.description}</p>
                      <p className="text-xs text-muted-foreground">{tx.date}</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold tabular-nums ml-4 flex-shrink-0">{fmt(tx.amount)}</span>
                </button>

                {/* Expanded items breakdown */}
                {expanded === tx.id && tx.items.length > 0 && (
                  <div className="bg-muted/20 border-t divide-y">
                    {tx.items.map((item) => (
                      <div key={item.id} className="flex justify-between px-6 py-1.5">
                        <span className="text-xs text-muted-foreground">{item.description}</span>
                        <span className="text-xs tabular-nums">{fmt(item.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Total row */}
            <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
              <span className="text-sm font-semibold">{t("transactionForm.total")}</span>
              <span className="text-sm font-bold tabular-nums">{fmt(total)}</span>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}

// ── Hover preview: a lightweight, non-interactive popover that lists the ───────
// transactions for one category+month. Shown after a short hover delay; the
// caller hides it on mouse-leave. Rendered in a portal so the table's
// horizontal scroll container never clips it.
function HoverPopover({
  year, month, categoryId, categoryName, monthLabel, anchor,
}: {
  year: number;
  month: number;
  categoryId: number;
  categoryName: string;
  monthLabel: string;
  anchor: DOMRect;
}) {
  const { t } = useTranslation();
  const { data: allTx } = useTransactions(year, month);
  const txns: Transaction[] = (allTx ?? []).filter((tx) => tx.categoryId === categoryId);
  const total = txns.reduce((s, tx) => s + tx.amount, 0);

  // Position below the cell, clamped to stay inside the viewport. If there is
  // not enough room below, flip above.
  const width = 300;
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
  const below = anchor.bottom + 6;
  const flipAbove = below + 220 > window.innerHeight;
  const style: React.CSSProperties = flipAbove
    ? { position: "fixed", left, bottom: window.innerHeight - anchor.top + 6, width }
    : { position: "fixed", left, top: below, width };

  return createPortal(
    <div
      style={style}
      className="z-50 rounded-md border bg-card text-card-foreground shadow-lg p-3 text-xs pointer-events-none"
    >
      <p className="font-semibold mb-2">{categoryName} · {monthLabel} {year}</p>
      {!allTx ? (
        <p className="text-muted-foreground">{t("yearly.loading")}</p>
      ) : txns.length === 0 ? (
        <p className="text-muted-foreground">{t("monthly.noTransactions")}</p>
      ) : (
        <div className="divide-y max-h-64 overflow-hidden">
          {txns.map((tx) => (
            <div key={tx.id} className="flex items-baseline justify-between gap-3 py-1">
              <span className="truncate">
                {tx.description}
                <span className="text-muted-foreground ml-1.5">{tx.date}</span>
              </span>
              <span className="tabular-nums flex-shrink-0">{fmt(tx.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between pt-1.5 font-semibold">
            <span>{t("transactionForm.total")}</span>
            <span className="tabular-nums">{fmt(total)}</span>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

// ── Detailed matrix: ONE table, months across the top, a row per transaction ───
// label (e.g. "Salary", "Side income") grouped under its category,
// with all of Income, Expenses and Savings in the same matrix.
type DetailRow = { key: string; label: string; months: number[]; total: number };
type CatGroup = { categoryId: number; categoryName: string; color: string; months: number[]; total: number; details: DetailRow[] };

function buildSection(section: YearlyDetailed["sections"][number]): { months: number[]; total: number; cats: CatGroup[] } {
  const cats: CatGroup[] = section.categories.map((cat) => {
    // Group this category's transactions by description → one matrix row each
    const byLabel = new Map<string, DetailRow>();
    for (const tx of cat.transactions) {
      let row = byLabel.get(tx.description);
      if (!row) {
        row = { key: `${cat.categoryId}__${tx.description}`, label: tx.description, months: Array(12).fill(0), total: 0 };
        byLabel.set(tx.description, row);
      }
      row.months[tx.month - 1] += tx.amount;
      row.total += tx.amount;
    }
    const months = Array.from({ length: 12 }, (_, i) =>
      cat.transactions.filter((tx) => tx.month === i + 1).reduce((s, tx) => s + tx.amount, 0)
    );
    return { categoryId: cat.categoryId, categoryName: cat.categoryName, color: cat.color, months, total: cat.total, details: [...byLabel.values()] };
  });
  const months = Array.from({ length: 12 }, (_, i) => cats.reduce((s, c) => s + c.months[i], 0));
  return { months, total: section.total, cats };
}

function DetailedMatrix({
  detailed, months, lockedMonths, alerts, netTarget, currentMonth, housingMonths,
}: {
  detailed: YearlyDetailed;
  months: string[];
  lockedMonths: Set<number>;
  alerts: Alerts;
  netTarget: number | null;
  currentMonth: number;
  housingMonths: number[];
}) {
  const { t } = useTranslation();
  // Categories start expanded; click a category row to collapse its detail rows.
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const toggle = (id: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const sectionDefs: { type: "INCOME" | "EXPENSE" | "SAVINGS"; title: string }[] = [
    { type: "INCOME", title: t("yearly.income") },
    { type: "EXPENSE", title: t("yearly.expenses") },
    { type: "SAVINGS", title: t("yearly.savings") },
  ];

  const built = sectionDefs.map((d) => {
    const section = detailed.sections.find((s) => s.type === d.type);
    return { ...d, data: section ? buildSection(section) : { months: Array(12).fill(0), total: 0, cats: [] } };
  });

  const byType = (type: string) => built.find((b) => b.type === type)!.data.months;
  const inc = byType("INCOME"), exp = byType("EXPENSE"), sav = byType("SAVINGS");
  const netMonths = Array.from({ length: 12 }, (_, i) => inc[i] - exp[i] - sav[i]);

  const cell = (v: number) => (v !== 0 ? fmt(v) : <span className="text-muted-foreground">—</span>);

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left py-2 px-4 font-medium text-muted-foreground min-w-52 sticky left-0 bg-muted/30">
                  {t("yearly.detail")}
                </th>
                {months.map((m, i) => (
                  <th key={m} className={cn("text-right py-2 px-2 font-medium text-muted-foreground w-20 border-l border-border/40", monthHeadCls(i, currentMonth))}>
                    <span className="inline-flex items-center justify-end gap-0.5">
                      {lockedMonths.has(i + 1) && <Lock size={9} className="text-muted-foreground/60" />}
                      {m}
                    </span>
                  </th>
                ))}
                <th className="text-right py-2 px-4 font-medium text-muted-foreground w-24 border-l border-border/40">{t("yearly.total")}</th>
              </tr>
            </thead>
            <tbody>
              {built.map(({ type, title, data }) => (
                <Fragment key={type}>
                  {/* Section header row with section monthly totals */}
                  <tr className="border-b-2 border-foreground/15 bg-primary/15">
                    <td className="py-2 px-4 font-bold uppercase text-[11px] tracking-wide">{title}</td>
                    {data.months.map((v, i) => (
                      <td key={i} className="text-right py-2 px-2 tabular-nums font-bold border-l border-border/40">{cell(v)}</td>
                    ))}
                    <td className="text-right py-2 px-4 tabular-nums font-bold border-l border-border/40">{fmt(data.total)}</td>
                  </tr>

                  {data.cats.map((cat) => {
                    const isCollapsed = collapsed.has(cat.categoryId);
                    return (
                      <Fragment key={cat.categoryId}>
                        {/* Category subtotal row — click to collapse/expand its detail rows */}
                        <tr className="border-b bg-muted/60 hover:bg-muted/80 cursor-pointer" onClick={() => toggle(cat.categoryId)}>
                          <td className="py-1.5 px-4">
                            <div className="flex items-center gap-1.5">
                              {isCollapsed ? <ChevronRight size={12} className="text-muted-foreground" /> : <ChevronDown size={12} className="text-muted-foreground" />}
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                              <span className="font-medium">{cat.categoryName}</span>
                            </div>
                          </td>
                          {cat.months.map((v, i) => (
                            <td key={i} className={cn("text-right py-1.5 px-2 tabular-nums font-medium border-l border-border/40", amountCls(type, v, i, alerts, currentMonth))}>{cell(v)}</td>
                          ))}
                          <td className="text-right py-1.5 px-4 tabular-nums font-semibold border-l border-border/40">{fmt(cat.total)}</td>
                        </tr>

                        {/* One row per transaction label, e.g. "Salary" / "Side income" */}
                        {!isCollapsed && cat.details.map((row, idx) => (
                          <tr
                            key={row.key}
                            className="border-b last:border-0 hover:bg-primary/10"
                            style={idx % 2 === 1 ? { backgroundColor: "var(--zebra-stripe)" } : undefined}
                          >
                            <td className="py-1.5 px-4 pl-9 text-muted-foreground">{row.label}</td>
                            {row.months.map((v, i) => (
                              <td key={i} className={cn("text-right py-1.5 px-2 tabular-nums border-l border-border/40", amountCls(type, v, i, alerts, currentMonth))}>{v !== 0 ? fmt(v) : ""}</td>
                            ))}
                            <td className="text-right py-1.5 px-4 tabular-nums border-l border-border/40">{fmt(row.total)}</td>
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                </Fragment>
              ))}

              {/* Housing costs (primary home) subtotal — a cross-cut of expenses */}
              {housingMonths.some((v) => v !== 0) && (
                <tr className="border-b bg-primary/5">
                  <td className="py-2 px-4 font-semibold">
                    <span className="flex items-center gap-1.5"><Building2 size={12} className="text-primary" />{t("housing.subtotalRow")}</span>
                  </td>
                  {housingMonths.map((v, i) => (
                    <td key={i} className="text-right py-2 px-2 tabular-nums font-medium border-l border-border/40">{cell(v)}</td>
                  ))}
                  <td className="text-right py-2 px-4 tabular-nums font-semibold border-l border-border/40">{fmt(housingMonths.reduce((s, v) => s + v, 0))}</td>
                </tr>
              )}

              {/* Net result across all sections */}
              <tr className="border-t-2 border-foreground/20 bg-muted/70">
                <td className="py-2.5 px-4 font-bold">{t("yearly.netResult")}</td>
                {netMonths.map((v, i) => (
                  <td key={i} className={cn("text-right py-2.5 px-2 tabular-nums font-semibold border-l border-border/40", netCls(v, i, netTarget, currentMonth))}>
                    {fmt(v)}
                  </td>
                ))}
                <td className={cn("text-right py-2.5 px-4 tabular-nums font-bold border-l border-border/40", detailed.grandTotals.netResult >= 0 ? "text-green-600" : "text-red-600")}>
                  {fmt(detailed.grandTotals.netResult)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Housing costs table (summary view): housing categories × months + total ────
export function HousingTable({ housing, months, currentMonth, lockedMonths }: {
  housing: HousingSummary;
  months: string[];
  currentMonth: number;
  lockedMonths: Set<number>;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Building2 size={17} className="text-primary" />{t("housing.title")}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left py-2 px-4 font-medium text-muted-foreground min-w-36">{t("yearly.category")}</th>
                {months.map((m, i) => (
                  <th key={m} className={cn("text-right py-2 px-2 font-medium text-muted-foreground w-20 border-l border-border/40", monthHeadCls(i, currentMonth))}>
                    <span className="inline-flex items-center justify-end gap-0.5">
                      {lockedMonths.has(i + 1) && <Lock size={9} className="text-muted-foreground/60" />}
                      {m}
                    </span>
                  </th>
                ))}
                <th className="text-right py-2 px-4 font-medium text-muted-foreground w-24 border-l border-border/40">{t("yearly.total")}</th>
              </tr>
            </thead>
            <tbody>
              {housing.categories.length === 0 && (
                <tr><td colSpan={14} className="py-4 px-4 text-center text-muted-foreground">{t("housing.empty")}</td></tr>
              )}
              {housing.categories.map((row, idx) => (
                <tr key={row.categoryId} className="border-b last:border-0 hover:bg-primary/10"
                  style={idx % 2 === 1 ? { backgroundColor: "var(--zebra-stripe)" } : undefined}>
                  <td className="py-2 px-4">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }} />
                      {row.categoryName}
                    </div>
                  </td>
                  {row.months.map((v, i) => (
                    <td key={i} className={cn("text-right py-2 px-2 tabular-nums border-l border-border/40", i + 1 === currentMonth && "bg-primary/5")}>
                      {v !== 0 ? fmt(v) : <span className="text-muted-foreground">—</span>}
                    </td>
                  ))}
                  <td className="text-right py-2 px-4 tabular-nums font-semibold border-l border-border/40">{fmt(row.total)}</td>
                </tr>
              ))}
              {housing.categories.length > 0 && (
                <tr className="border-t-2 border-foreground/20 bg-primary/10">
                  <td className="py-2.5 px-4 font-bold">{t("housing.totalRow")}</td>
                  {housing.monthly.map((v, i) => (
                    <td key={i} className={cn("text-right py-2.5 px-2 tabular-nums font-bold border-l border-border/40", i + 1 === currentMonth && "bg-primary/5")}>{fmt(v)}</td>
                  ))}
                  <td className="text-right py-2.5 px-4 tabular-nums font-bold border-l border-border/40">{fmt(housing.total)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function Yearly() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [view, setView] = useState<"summary" | "detailed">("summary");
  const { data: summary, isLoading } = useYearlySummary(year);
  const { data: detailed, isLoading: detailedLoading } = useYearlyDetailed(year, view === "detailed");
  const { data: housing } = useHousingSummary(year);
  const { data: yearLocks } = useYearLocks(year);
  const lockedMonths = new Set(yearLocks?.lockedMonths ?? []);
  const { data: settings } = useAllSettings();
  const { t } = useTranslation();

  const months = t("months", { returnObjects: true }) as string[];

  // Highlight config derived from server-side settings.
  const netTarget = parseNum(settings?.net_target);
  const alerts: Alerts = {
    expense: parseNum(settings?.ui_expense_alert),
    savings: parseNum(settings?.ui_savings_alert),
  };
  // Current month column is only highlighted when viewing the present year.
  const now = new Date();
  const currentMonth = year === now.getFullYear() ? now.getMonth() + 1 : 0;

  // State for the open cell dialog
  const [cell, setCell] = useState<{ month: number; categoryId: number; categoryName: string } | null>(null);

  // Hover preview: appears after a short delay, hides on mouse-leave.
  const HOVER_DELAY_MS = 600;
  const hoverTimer = useRef<number | null>(null);
  const [hover, setHover] = useState<{ month: number; categoryId: number; categoryName: string; anchor: DOMRect } | null>(null);

  function enterCell(e: React.MouseEvent, month: number, categoryId: number, categoryName: string) {
    const el = e.currentTarget as HTMLElement;
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => {
      setHover({ month, categoryId, categoryName, anchor: el.getBoundingClientRect() });
    }, HOVER_DELAY_MS);
  }
  function leaveCell() {
    if (hoverTimer.current) { window.clearTimeout(hoverTimer.current); hoverTimer.current = null; }
    setHover(null);
  }

  function SectionTable({ type, title }: { type: "INCOME" | "EXPENSE" | "SAVINGS"; title: string }) {
    const rows = summary?.rows.filter((r) => r.type === type) ?? [];
    return (
      <Card>
        <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left py-2 px-4 font-medium text-muted-foreground min-w-36">
                    {t("yearly.category")}
                  </th>
                  {months.map((m, i) => (
                    <th key={m} className={cn("text-right py-2 px-2 font-medium text-muted-foreground w-20 border-l border-border/40", monthHeadCls(i, currentMonth))}>
                      <span className="inline-flex items-center justify-end gap-0.5">
                        {lockedMonths.has(i + 1) && <Lock size={9} className="text-muted-foreground/60" />}
                        {m}
                      </span>
                    </th>
                  ))}
                  <th className="text-right py-2 px-4 font-medium text-muted-foreground w-24 border-l border-border/40">
                    {t("yearly.total")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr
                    key={row.categoryId}
                    className="border-b last:border-0 hover:bg-primary/10"
                    style={idx % 2 === 1 ? { backgroundColor: "var(--zebra-stripe)" } : undefined}
                  >
                    <td className="py-2 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }} />
                        {row.categoryName}
                      </div>
                    </td>
                    {row.months.map((v, i) => (
                      <td key={i} className={cn("text-right py-2 px-2 tabular-nums border-l border-border/40", amountCls(type, v, i, alerts, currentMonth))}>
                        {v !== 0 ? (
                          <button
                            type="button"
                            className="hover:underline hover:text-primary cursor-pointer tabular-nums"
                            onClick={() => setCell({ month: i + 1, categoryId: row.categoryId, categoryName: row.categoryName })}
                            onMouseEnter={(e) => enterCell(e, i + 1, row.categoryId, row.categoryName)}
                            onMouseLeave={leaveCell}
                          >
                            {fmt(v)}
                          </button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    ))}
                    <td className="text-right py-2 px-4 tabular-nums font-semibold border-l border-border/40">{fmt(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-full">
      {/* Cell drill-down dialog */}
      {cell && (
        <CellDialog
          open={true}
          onClose={() => setCell(null)}
          year={year}
          month={cell.month}
          categoryId={cell.categoryId}
          categoryName={cell.categoryName}
          monthLabel={months[cell.month - 1]}
        />
      )}

      {/* Hover preview popover (category summary cells) */}
      {hover && (
        <HoverPopover
          year={year}
          month={hover.month}
          categoryId={hover.categoryId}
          categoryName={hover.categoryName}
          monthLabel={months[hover.month - 1]}
          anchor={hover.anchor}
        />
      )}

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold">{t("yearly.title")}</h1>
        <div className="flex items-center gap-3 flex-wrap">
          {/* View toggle: category summary ↔ detailed transactions */}
          <div className="inline-flex rounded-md border overflow-hidden">
            <button
              type="button"
              onClick={() => setView("summary")}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
                view === "summary" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              )}
            >
              <Table2 size={13} /> {t("yearly.viewSummary")}
            </button>
            <button
              type="button"
              onClick={() => setView("detailed")}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border-l",
                view === "detailed" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              )}
            >
              <ListTree size={13} /> {t("yearly.viewDetailed")}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setYear((y) => y - 1)}><ChevronLeft size={14} /></Button>
            <span className="min-w-16 text-center font-semibold text-lg">{year}</span>
            <Button variant="outline" size="icon" onClick={() => setYear((y) => y + 1)}><ChevronRight size={14} /></Button>
          </div>
        </div>
      </div>

      {view === "detailed" ? (
        detailedLoading || !detailed ? (
          <p className="text-muted-foreground">{t("yearly.loading")}</p>
        ) : (
          <DetailedMatrix detailed={detailed} months={months} lockedMonths={lockedMonths} alerts={alerts} netTarget={netTarget} currentMonth={currentMonth} housingMonths={housing?.monthly ?? Array(12).fill(0)} />
        )
      ) : isLoading ? (
        <p className="text-muted-foreground">{t("yearly.loading")}</p>
      ) : (
        <>
          <SectionTable type="INCOME"  title={t("yearly.income")} />
          <SectionTable type="EXPENSE" title={t("yearly.expenses")} />
          <SectionTable type="SAVINGS" title={t("yearly.savings")} />

          {housing && housing.categories.length > 0 && (
            <HousingTable housing={housing} months={months} currentMonth={currentMonth} lockedMonths={lockedMonths} />
          )}

          <Card>
            <CardHeader><CardTitle>{t("yearly.monthlySummary")}</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left py-2 px-4 font-medium text-muted-foreground min-w-36">
                        {t("yearly.metric")}
                      </th>
                      {months.map((m, i) => (
                        <th key={m} className={cn("text-right py-2 px-2 font-medium text-muted-foreground w-20 border-l border-border/40", monthHeadCls(i, currentMonth))}>{m}</th>
                      ))}
                      <th className="text-right py-2 px-4 font-medium text-muted-foreground w-24 border-l border-border/40">
                        {t("yearly.total")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: t("yearly.totalIncome"),   key: "income"   as const, colorClass: "text-green-600" },
                      { label: t("yearly.totalExpenses"), key: "expenses" as const, colorClass: "" },
                      { label: t("yearly.totalSavings"),  key: "savings"  as const, colorClass: "text-blue-600" },
                    ].map(({ label, key, colorClass }) => (
                      <tr key={key} className="border-b">
                        <td className={cn("py-2 px-4 font-medium", colorClass)}>{label}</td>
                        {summary?.monthlyTotals[key].map((v, i) => (
                          <td key={i} className={cn("text-right py-2 px-2 tabular-nums border-l border-border/40", colorClass, i + 1 === currentMonth && "bg-primary/5")}>{fmt(v)}</td>
                        ))}
                        <td className={cn("text-right py-2 px-4 tabular-nums font-bold border-l border-border/40", colorClass)}>
                          {fmt(summary?.yearlyTotals[key] ?? 0)}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-b-2 border-foreground/20 bg-muted/30">
                      <td className="py-3 px-4 font-bold">{t("yearly.netResult")}</td>
                      {summary?.monthlyTotals.netResult.map((v, i) => (
                        <td key={i} className={cn("text-right py-3 px-2 tabular-nums font-semibold border-l border-border/40", netCls(v, i, netTarget, currentMonth))}>
                          {fmt(v)}
                        </td>
                      ))}
                      <td className={cn("text-right py-3 px-4 tabular-nums font-bold text-base border-l border-border/40",
                        (summary?.yearlyTotals.netResult ?? 0) >= 0 ? "text-green-600" : "text-red-600")}>
                        {fmt(summary?.yearlyTotals.netResult ?? 0)}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 text-muted-foreground">{t("yearly.savingsRate")}</td>
                      {summary?.monthlyTotals.income.map((inc, i) => {
                        const sav = summary.monthlyTotals.savings[i];
                        const rate = inc > 0 ? (sav / inc) * 100 : 0;
                        return <td key={i} className={cn("text-right py-2 px-2 tabular-nums text-muted-foreground border-l border-border/40", i + 1 === currentMonth && "bg-primary/5")}>{fmtPct(rate)}</td>;
                      })}
                      <td className="text-right py-2 px-4 tabular-nums font-semibold border-l border-border/40">
                        {fmtPct(summary?.yearlyTotals.savingsRate ?? 0)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

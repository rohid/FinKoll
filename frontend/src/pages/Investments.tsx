import { useState } from "react";
import {
  useHoldings, useInvestmentSummary, useInvestmentHistory, useInvestmentProviders,
  useCreateHolding, useUpdateHolding, useDeleteHolding, useRefreshQuotes, useSymbolSearch,
  useInvestmentAnalysis,
} from "@/api/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmt, fmtPct } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import type { Holding, SymbolHit, AnalysisHolding } from "@/types";
import { ExperimentalBanner } from "@/components/ExperimentalBanner";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

const gainColor = (v: number) => (v > 0 ? "text-green-600" : v < 0 ? "text-red-600" : "text-muted-foreground");
const signed = (v: number) => (v >= 0 ? "+" : "") + fmt(v);
const signedPct = (v: number) => (v >= 0 ? "+" : "") + fmtPct(v);

// ── Portfolio summary ──────────────────────────────────────────────────────────
function PortfolioSummary() {
  const { t, i18n } = useTranslation();
  const { data: s } = useInvestmentSummary();
  if (!s) return null;
  const asOf = s.asOf ? new Date(s.asOf).toLocaleString(i18n.language) : null;
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <p className="text-xs text-muted-foreground">{t("investments.totalValue")}</p>
            <p className="font-bold tabular-nums text-lg">{fmt(s.totalValueSek)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("investments.totalCost")}</p>
            <p className="font-medium tabular-nums text-lg">{fmt(s.totalCostSek)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("investments.totalGain")}</p>
            <p className={`font-bold tabular-nums text-lg ${gainColor(s.gainSek)}`}>
              {signed(s.gainSek)} <span className="text-sm">({signedPct(s.gainPct)})</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("investments.dayChange")}</p>
            <p className={`font-bold tabular-nums text-lg ${gainColor(s.dayChangeSek)}`}>
              {signed(s.dayChangeSek)} <span className="text-sm">({signedPct(s.dayChangePct)})</span>
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          {t("investments.sourceLabel", { provider: s.market })}
          {" · "}{t("investments.delayed")}
          {asOf && <> · {t("investments.asOf", { time: asOf })}</>}
        </p>
      </CardContent>
    </Card>
  );
}

// ── Performance chart (portfolio value over time) ──────────────────────────────
function PerformanceChart() {
  const { t } = useTranslation();
  const { data: history } = useInvestmentHistory();
  if (!history || history.length < 2) return null;
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{t("investments.performance")}</CardTitle></CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={history} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={70} tickFormatter={(v) => fmt(v)} />
            <Tooltip formatter={(v: number) => fmt(v)} />
            <Line type="monotone" dataKey="totalValueSek" name={t("investments.totalValue")} stroke="#6366f1" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="totalCostSek" name={t("investments.totalCost")} stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ── Symbol autocomplete (Yahoo search) ─────────────────────────────────────────
function SymbolSearch({ onPick }: { onPick: (hit: SymbolHit) => void }) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const { data: hits } = useSymbolSearch(q);
  return (
    <div className="relative">
      <label className="text-xs text-muted-foreground">{t("investments.searchLabel")}</label>
      <Input value={q} placeholder={t("investments.searchPlaceholder")}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} />
      {open && q.trim().length >= 2 && hits && hits.length > 0 && (
        <div className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-md border bg-background shadow-md">
          {hits.map((h) => (
            <button key={h.symbol} type="button"
              className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
              onClick={() => { onPick(h); setQ(""); setOpen(false); }}>
              <span className="truncate">{h.name}</span>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{h.symbol}{h.exchange ? ` · ${h.exchange}` : ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Add / edit holding form ────────────────────────────────────────────────────
const EMPTY = { name: "", symbol: "", isin: "", assetType: "STOCK", quantity: "", avgCost: "", currency: "SEK", manualPrice: "", notes: "" };

function HoldingForm({ initial, onSubmit, onCancel, pending }: {
  initial?: Partial<Holding>;
  onSubmit: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    name:        initial?.name ?? "",
    symbol:      initial?.symbol ?? "",
    isin:        initial?.isin ?? "",
    assetType:   (initial?.assetType ?? "STOCK") as string,
    quantity:    initial?.quantity != null ? String(initial.quantity) : "",
    avgCost:     initial?.avgCost != null ? String(initial.avgCost) : "",
    currency:    initial?.currency ?? "SEK",
    manualPrice: initial?.manualPrice != null ? String(initial.manualPrice) : "",
    notes:       initial?.notes ?? "",
  });
  const set = (patch: Partial<typeof EMPTY>) => setForm((f) => ({ ...f, ...patch }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      name:        form.name,
      symbol:      form.symbol || undefined,
      isin:        form.isin || undefined,
      assetType:   form.assetType,
      quantity:    parseFloat(form.quantity),
      avgCost:     parseFloat(form.avgCost),
      currency:    form.currency || "SEK",
      manualPrice: form.manualPrice ? parseFloat(form.manualPrice) : undefined,
      notes:       form.notes || undefined,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {!initial && (
        <SymbolSearch onPick={(h) => set({ symbol: h.symbol, name: form.name || h.name, currency: h.currency ?? form.currency })} />
      )}
      <div className="grid grid-cols-2 gap-3">
        {([
          ["name",        t("investments.name"),     "text"],
          ["symbol",      t("investments.symbol"),   "text"],
          ["isin",        t("investments.isin"),     "text"],
          ["currency",    t("investments.currency"), "text"],
          ["quantity",    t("investments.quantity"), "number"],
          ["avgCost",     t("investments.avgCost"),  "number"],
          ["manualPrice", t("investments.manualPrice"), "number"],
        ] as const).map(([key, label, type]) => (
          <div key={key} className="space-y-1">
            <label className="text-xs text-muted-foreground">{label}</label>
            <Input type={type} value={form[key]} className="h-8 text-sm"
              onChange={(e) => set({ [key]: e.target.value })}
              required={["name", "quantity", "avgCost"].includes(key)} />
          </div>
        ))}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">{t("investments.assetType")}</label>
          <select value={form.assetType} onChange={(e) => set({ assetType: e.target.value })}
            className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm">
            {["STOCK", "FUND", "ETF", "OTHER"].map((a) => <option key={a} value={a}>{t(`investments.type.${a}`)}</option>)}
          </select>
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">{t("investments.notes")}</label>
        <Input value={form.notes} className="h-8 text-sm" onChange={(e) => set({ notes: e.target.value })} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>{t("investments.save")}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>{t("investments.cancel")}</Button>
      </div>
    </form>
  );
}

// ── Single holding ─────────────────────────────────────────────────────────────
function HoldingCard({ h }: { h: Holding }) {
  const { t } = useTranslation();
  const update = useUpdateHolding();
  const remove = useDeleteHolding();
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <Card><CardContent className="pt-4">
        <HoldingForm initial={h} pending={update.isPending}
          onCancel={() => setEditing(false)}
          onSubmit={(data) => { update.mutate({ id: h.id, ...data }); setEditing(false); }} />
      </CardContent></Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold">{h.name}</p>
            <p className="text-xs text-muted-foreground">
              {h.symbol ?? h.isin ?? "—"} · {h.quantity} × {fmt(h.avgCost, h.currency)}
            </p>
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>{t("investments.edit")}</Button>
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
              onClick={() => window.confirm(t("investments.deleteConfirm")) && remove.mutate(h.id)}>
              {t("investments.delete")}
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">{t("investments.price")}</p>
            <p className="tabular-nums">
              {fmt(h.price, h.quoteCurrency)}
              {h.changePct !== 0 && <span className={`ml-1 text-xs ${gainColor(h.changePct)}`}>({signedPct(h.changePct)})</span>}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("investments.marketValue")}</p>
            <p className="tabular-nums font-medium">{fmt(h.marketValueSek)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("investments.gain")}</p>
            <p className={`tabular-nums font-medium ${gainColor(h.gainSek)}`}>{signed(h.gainSek)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("investments.gainPct")}</p>
            <p className={`tabular-nums font-medium ${gainColor(h.gainPct)}`}>{signedPct(h.gainPct)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Analysis: sortable category tables ─────────────────────────────────────────
type Col = {
  key: string;
  label: string;
  align?: "right";
  sortVal: (r: AnalysisHolding) => number | string | null;
  render: (r: AnalysisHolding) => React.ReactNode;
};

function SortTable({ rows, cols, initialKey, initialDir = "desc", rowClass }: {
  rows: AnalysisHolding[];
  cols: Col[];
  initialKey: string;
  initialDir?: "asc" | "desc";
  rowClass?: (r: AnalysisHolding) => string;
}) {
  const [sortKey, setSortKey] = useState(initialKey);
  const [dir, setDir] = useState<"asc" | "desc">(initialDir);
  const col = cols.find((c) => c.key === sortKey) ?? cols[0];
  const sorted = [...rows].sort((a, b) => {
    const av = col.sortVal(a), bv = col.sortVal(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;           // nulls always last
    if (bv == null) return -1;
    const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    return dir === "asc" ? cmp : -cmp;
  });
  const clickSort = (k: string) => {
    if (k === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setDir("desc"); }
  };
  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
            {cols.map((c) => (
              <th key={c.key} className={`px-3 py-1.5 font-semibold cursor-pointer select-none ${c.align === "right" ? "text-right" : "text-left"}`}
                onClick={() => clickSort(c.key)}>
                {c.label}{sortKey === c.key ? (dir === "asc" ? " ▲" : " ▼") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} className={`border-b last:border-0 ${rowClass?.(r) ?? ""}`}>
              {cols.map((c) => (
                <td key={c.key} className={`px-3 py-1.5 tabular-nums ${c.align === "right" ? "text-right" : ""}`}>{c.render(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const numCell = (v: number | null) => (v == null ? <span className="text-muted-foreground">—</span> : v.toFixed(1));
const pctCell = (v: number | null) => (v == null ? <span className="text-muted-foreground">—</span> : <span className={gainColor(v)}>{signedPct(v)}</span>);
const compactCell = (v: number | null, ccy: string) =>
  v == null ? <span className="text-muted-foreground">—</span> : `${new Intl.NumberFormat("sv-SE", { notation: "compact", maximumFractionDigits: 1 }).format(v)} ${ccy}`;

function AnalysisView() {
  const { t } = useTranslation();
  const { data, isLoading } = useInvestmentAnalysis(true, true);
  const rows = data?.holdings ?? [];
  const hasFundamentals = data?.capabilities.includes("fundamentals");
  const anyFund = rows.some((r) => r.pe != null || r.pb != null || r.debtEquity != null);

  if (isLoading) return <p className="text-muted-foreground">{t("common.loading")}</p>;
  if (!hasFundamentals || !anyFund) {
    return <Card><CardContent className="py-8 text-center text-muted-foreground"><p>{t("investments.analysisEmpty")}</p></CardContent></Card>;
  }

  const nameCell = (r: AnalysisHolding) => (
    <span><span className="font-medium">{r.name}</span> <span className="text-xs text-muted-foreground">{r.symbol}</span></span>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("investments.valuation")}</CardTitle>
          <p className="text-xs text-muted-foreground">{t("investments.valuationHint")}</p>
        </CardHeader>
        <CardContent>
          <SortTable rows={rows} initialKey="pe" initialDir="asc"
            rowClass={(r) => (r.pe != null && r.pe < 15 && r.pb != null && r.pb < 3 ? "bg-green-500/5" : "")}
            cols={[
              { key: "name", label: t("investments.colName"), sortVal: (r) => r.name, render: nameCell },
              { key: "pe", label: t("investments.colPe"), align: "right", sortVal: (r) => r.pe, render: (r) => numCell(r.pe) },
              { key: "pb", label: t("investments.colPb"), align: "right", sortVal: (r) => r.pb, render: (r) => numCell(r.pb) },
              { key: "yield", label: t("investments.colYield"), align: "right", sortVal: (r) => r.dividendYield, render: (r) => (r.dividendYield == null ? <span className="text-muted-foreground">—</span> : fmtPct(r.dividendYield * 100)) },
              { key: "value", label: t("investments.colValue"), align: "right", sortVal: (r) => r.marketValueSek, render: (r) => fmt(r.marketValueSek) },
            ]} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("investments.debt")}</CardTitle>
          <p className="text-xs text-muted-foreground">{t("investments.debtHint")}</p>
        </CardHeader>
        <CardContent>
          <SortTable rows={rows} initialKey="de" initialDir="desc"
            rowClass={(r) => (r.debtEquity != null && r.debtEquity > 100 ? "bg-amber-500/5" : "")}
            cols={[
              { key: "name", label: t("investments.colName"), sortVal: (r) => r.name, render: nameCell },
              { key: "de", label: t("investments.colDebtEquity"), align: "right", sortVal: (r) => r.debtEquity, render: (r) => (r.debtEquity == null ? <span className="text-muted-foreground">—</span> : `${r.debtEquity.toFixed(0)}%`) },
              { key: "mcap", label: t("investments.colMarketCap"), align: "right", sortVal: (r) => r.marketCap, render: (r) => compactCell(r.marketCap, r.currency) },
              { key: "value", label: t("investments.colValue"), align: "right", sortVal: (r) => r.marketValueSek, render: (r) => fmt(r.marketValueSek) },
            ]} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("investments.performance")}</CardTitle>
          <p className="text-xs text-muted-foreground">{t("investments.performanceHint")}</p>
        </CardHeader>
        <CardContent>
          <SortTable rows={rows} initialKey="total" initialDir="desc"
            cols={[
              { key: "name", label: t("investments.colName"), sortVal: (r) => r.name, render: nameCell },
              { key: "day", label: t("investments.colDay"), align: "right", sortVal: (r) => r.dayChangePct, render: (r) => pctCell(r.dayChangePct) },
              { key: "r1m", label: t("investments.col1m"), align: "right", sortVal: (r) => r.r1m, render: (r) => pctCell(r.r1m) },
              { key: "r3m", label: t("investments.col3m"), align: "right", sortVal: (r) => r.r3m, render: (r) => pctCell(r.r3m) },
              { key: "r1y", label: t("investments.col1y"), align: "right", sortVal: (r) => r.r1y, render: (r) => pctCell(r.r1y) },
              { key: "total", label: t("investments.colTotal"), align: "right", sortVal: (r) => r.gainPct, render: (r) => pctCell(r.gainPct) },
            ]} />
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export function Investments() {
  const { t } = useTranslation();
  const { data: holdings, isLoading } = useHoldings();
  const { data: providers } = useInvestmentProviders();
  const create = useCreateHolding();
  const refresh = useRefreshQuotes();
  const [showAdd, setShowAdd] = useState(false);
  const [view, setView] = useState<"portfolio" | "analysis">("portfolio");

  const canRefresh = providers?.capabilities.includes("quotes");
  const hasHoldings = !!holdings && holdings.length > 0;

  return (
    <div className="space-y-6 max-w-4xl">
      <ExperimentalBanner moduleKey="investments" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("investments.title")}</h1>
        <div className="flex gap-2">
          {canRefresh && (
            <Button variant="outline" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
              {refresh.isPending ? t("investments.refreshing") : t("investments.refresh")}
            </Button>
          )}
          {!showAdd && <Button onClick={() => setShowAdd(true)}>{t("investments.addHolding")}</Button>}
        </div>
      </div>

      {hasHoldings && (
        <div className="flex gap-1">
          <Button size="sm" variant={view === "portfolio" ? "default" : "outline"} onClick={() => setView("portfolio")}>
            {t("investments.portfolioTab")}
          </Button>
          <Button size="sm" variant={view === "analysis" ? "default" : "outline"} onClick={() => setView("analysis")}>
            {t("investments.analysisTab")}
          </Button>
        </div>
      )}

      {showAdd && (
        <Card>
          <CardHeader><CardTitle>{t("investments.addHolding")}</CardTitle></CardHeader>
          <CardContent>
            <HoldingForm pending={create.isPending} onCancel={() => setShowAdd(false)}
              onSubmit={(data) => { create.mutate(data as any); setShowAdd(false); }} />
          </CardContent>
        </Card>
      )}

      {isLoading && <p className="text-muted-foreground">{t("common.loading")}</p>}

      {!isLoading && (!holdings || holdings.length === 0) && !showAdd && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">
          <p>{t("investments.empty")}</p>
        </CardContent></Card>
      )}

      {hasHoldings && view === "portfolio" && (
        <>
          <PortfolioSummary />
          <PerformanceChart />
          <div className="space-y-3">
            {holdings!.map((h) => <HoldingCard key={h.id} h={h} />)}
          </div>
        </>
      )}

      {hasHoldings && view === "analysis" && <AnalysisView />}
    </div>
  );
}

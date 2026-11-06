import { useState } from "react";
import { useMortgages, useCreateMortgage, useUpdateMortgage, useDeleteMortgage, useAppSetting, useSetAppSetting } from "@/api/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmt } from "@/lib/utils";
import { forecastMortgage, annuityPayment, projectSeries, type MortgageChange } from "@/lib/mortgage";
import { useTranslation } from "react-i18next";
import type { Mortgage } from "@/types";

// ── Forecast rows (as edited/stored) ───────────────────────────────────────────
type ForecastRow = { month: string; rate: string; amort: string };

function parseSavedForecast(json?: string): ForecastRow[] {
  try {
    const arr = json ? JSON.parse(json) : [];
    if (!Array.isArray(arr)) return [];
    return arr.map((r) => ({ month: String(r.month ?? ""), rate: String(r.rate ?? ""), amort: String(r.amort ?? "") }));
  } catch {
    return [];
  }
}

function rowsToChanges(rows: ForecastRow[]): MortgageChange[] {
  return rows
    .map((r) => ({ month: parseInt(r.month), rate: r.rate ? parseFloat(r.rate) : undefined, amort: r.amort ? parseFloat(r.amort) : undefined }))
    .filter((c) => c.month >= 1 && ((c.rate ?? 0) > 0 || (c.amort ?? 0) > 0));
}

// ── Group forecasts, stored as one JSON map in app settings ────────────────────
// { "<group name>": { mode: "combined" | "perLoan", changes: ForecastRow[] } }
const GROUP_FORECASTS_KEY = "mortgage_group_forecasts";
type GroupForecastEntry = { mode?: "combined" | "perLoan"; changes?: ForecastRow[] };

function parseGroupForecasts(json?: string | null): Record<string, GroupForecastEntry> {
  try {
    const obj = json ? JSON.parse(json) : {};
    return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
  } catch {
    return {};
  }
}

// ── Shared loan math (fixed-amortization model) ───────────────────────────────
function loanAmort(m: Mortgage): number {
  const interest = (m.principalAmount * m.interestRate) / 1200;
  return m.monthlyPaymentOverride
    ?? Math.max(0, annuityPayment(m.principalAmount, m.interestRate, m.amortizationYears * 12) - interest);
}
function loanMonthlyPayment(m: Mortgage): number {
  return (m.principalAmount * m.interestRate) / 1200 + loanAmort(m);
}
function loanChanges(m: Mortgage): MortgageChange[] {
  return rowsToChanges(parseSavedForecast(m.forecast));
}

// ── Forecast editor: plan future rate/amortization changes for one loan-like
//    balance (a single mortgage, or a whole group treated as one loan) ──────────
function ForecastEditor({ principal, rate, baseAmort, saved, saving, onSave }: {
  principal: number;
  rate: number;          // current annual rate (%)
  baseAmort: number;     // current fixed monthly amortization
  saved: string;         // last saved forecast (JSON of ForecastRow[])
  saving: boolean;
  onSave: (json: string) => Promise<unknown>;
}) {
  const { t, i18n } = useTranslation();

  // Restore the saved forecast so it survives navigation/reload.
  const [changes, setChanges] = useState<ForecastRow[]>(() => parseSavedForecast(saved));
  const [savedFlash, setSavedFlash] = useState(false);
  const dirty = JSON.stringify(changes) !== saved;

  function saveForecast() {
    onSave(JSON.stringify(changes))
      .then(() => { setSavedFlash(true); setTimeout(() => setSavedFlash(false), 2000); })
      .catch(() => {});
  }

  const parsed = rowsToChanges(changes);
  const f = forecastMortgage(principal, rate, baseAmort, parsed);
  const current = f.periods[0]?.payment ?? 0;

  const ym = (m: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() + m);
    return d.toLocaleDateString(i18n.language, { year: "numeric", month: "short" });
  };
  const label = (m: number) => (m === 0 ? t("mortgage.now") : t("mortgage.inMonths", { n: m }));
  const dur = (m: number) => {
    if (m >= 2400) return "200+";
    const y = Math.floor(m / 12), mo = m % 12;
    return `${y} ${t("mortgage.yearsUnit")} ${mo} ${t("mortgage.monthsShort")}`;
  };

  const set = (i: number, patch: Partial<{ month: string; rate: string; amort: string }>) =>
    setChanges((cs) => cs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <div className="rounded-md border p-3 space-y-3 bg-muted/20 mt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("mortgage.forecastTitle")}</p>
      <p className="text-xs text-muted-foreground">{t("mortgage.forecastHint")}</p>

      {/* Editable future changes — rate and/or amortization, effective from a month */}
      <div className="space-y-2">
        {changes.map((c, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t("mortgage.inMonthsLabel")}</label>
              <Input type="number" min="1" value={c.month} className="h-8 w-20"
                onChange={(e) => set(i, { month: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t("mortgage.newRate")}</label>
              <Input type="number" step="0.01" value={c.rate} className="h-8 w-24"
                placeholder={String(rate)}
                onChange={(e) => set(i, { rate: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t("mortgage.forecastAmort")}</label>
              <Input type="number" step="100" value={c.amort} className="h-8 w-28"
                placeholder={String(Math.round(baseAmort))}
                onChange={(e) => set(i, { amort: e.target.value })} />
            </div>
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
              onClick={() => setChanges((cs) => cs.filter((_, j) => j !== i))}>
              {t("mortgage.remove")}
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setChanges((cs) => [...cs, { month: "", rate: "", amort: "" }])}>
            + {t("mortgage.addChange")}
          </Button>
          <Button size="sm" onClick={saveForecast} disabled={saving || !dirty}>
            {t("mortgage.saveForecast")}
          </Button>
          {savedFlash && <span className="text-xs text-green-600">{t("mortgage.forecastSaved")}</span>}
        </div>
      </div>

      {parsed.length > 0 && (
        <>
          {/* Payment timeline: interest (moves with rate) + fixed amortization */}
          <div className="rounded-md border bg-background text-sm overflow-hidden">
            <div className="grid grid-cols-5 gap-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground border-b">
              <span>{t("mortgage.when")}</span>
              <span className="text-right">{t("mortgage.rate")}</span>
              <span className="text-right">{t("mortgage.amortization")}</span>
              <span className="text-right">{t("mortgage.monthlyPayment")}</span>
              <span className="text-right">{t("mortgage.monthlyDelta")}</span>
            </div>
            {f.periods.map((p, i) => {
              const delta = p.payment - current;
              return (
                <div key={i} className="grid grid-cols-5 gap-2 px-3 py-1.5 border-b last:border-0">
                  <span className="text-muted-foreground truncate">{label(p.atMonth)} · {ym(p.atMonth)}</span>
                  <span className="text-right tabular-nums">{p.rate}%</span>
                  <span className="text-right tabular-nums">{fmt(p.amort)}</span>
                  <span className="text-right tabular-nums font-medium">{fmt(p.payment)}</span>
                  <span className={`text-right tabular-nums ${i === 0 ? "text-muted-foreground" : delta > 0 ? "text-red-600" : "text-green-600"}`}>
                    {i === 0 ? "—" : `${delta >= 0 ? "+" : ""}${fmt(delta)}`}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Lifetime comparison (useful when negotiating) */}
          <div className="rounded-md border divide-y bg-background text-sm">
            <div className="flex justify-between px-3 py-1.5">
              <span className="text-muted-foreground">{t("mortgage.payoffBaseline")}</span>
              <span className="tabular-nums">{dur(f.baselinePayoffMonths)}</span>
            </div>
            <div className="flex justify-between px-3 py-1.5">
              <span className="text-muted-foreground">{t("mortgage.payoffForecast")}</span>
              <span className="tabular-nums">{dur(f.payoffMonths)}</span>
            </div>
            <div className="flex justify-between px-3 py-1.5">
              <span className="text-muted-foreground">{t("mortgage.lifetimeAtCurrent")}</span>
              <span className="tabular-nums">{fmt(f.baselineTotalInterest)}</span>
            </div>
            <div className="flex justify-between px-3 py-1.5">
              <span className="text-muted-foreground">{t("mortgage.lifetimeForecast")}</span>
              <span className="tabular-nums">{fmt(f.forecastTotalInterest)}</span>
            </div>
            <div className="flex justify-between px-3 py-1.5">
              <span className="text-muted-foreground">{t("mortgage.lifetimeDelta")}</span>
              <span className={`tabular-nums font-bold ${f.interestDelta > 0 ? "text-red-600" : "text-green-600"}`}>
                {f.interestDelta >= 0 ? "+" : ""}{fmt(f.interestDelta)}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Per-loan forecast: persisted on the mortgage row ───────────────────────────
function RateForecast({ mortgage }: { mortgage: Mortgage }) {
  const update = useUpdateMortgage();
  return (
    <ForecastEditor
      principal={mortgage.principalAmount}
      rate={mortgage.interestRate}
      baseAmort={loanAmort(mortgage)}
      saved={mortgage.forecast ?? "[]"}
      saving={update.isPending}
      onSave={(json) => update.mutateAsync({ id: mortgage.id, forecast: json })}
    />
  );
}

// ── Single mortgage card ──────────────────────────────────────────────────────
function MortgageCard({ mortgage, showForecast = true, inGroup = false, selecting = false, selected = false, onToggleSelect }: {
  mortgage: Mortgage;
  showForecast?: boolean;
  inGroup?: boolean;
  selecting?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: number) => void;
}) {
  const update = useUpdateMortgage();
  const remove = useDeleteMortgage();
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name:                   mortgage.name,
    principalAmount:        String(mortgage.principalAmount),
    interestRate:           String(mortgage.interestRate),
    amortizationYears:      String(mortgage.amortizationYears),
    monthlyPaymentOverride: mortgage.monthlyPaymentOverride ? String(mortgage.monthlyPaymentOverride) : "",
    effectiveFrom:          mortgage.effectiveFrom,
    notes:                  mortgage.notes ?? "",
  });

  function save() {
    update.mutate({
      id: mortgage.id,
      name:                   form.name,
      principalAmount:        parseFloat(form.principalAmount),
      interestRate:           parseFloat(form.interestRate),
      amortizationYears:      parseInt(form.amortizationYears),
      monthlyPaymentOverride: form.monthlyPaymentOverride ? parseFloat(form.monthlyPaymentOverride) : undefined,
      effectiveFrom:          form.effectiveFrom,
      notes:                  form.notes || undefined,
    });
    setEditing(false);
  }

  // Fixed-amortization view (same model as the forecast): the monthly payment is
  // interest on the balance + a fixed amortization. The amortization is the manual
  // value if set, otherwise the annuity's initial principal portion.
  const interestMonth  = (mortgage.principalAmount * mortgage.interestRate) / 1200;
  const amortization   = loanAmort(mortgage);
  const monthlyPayment = interestMonth + amortization;

  return (
    <Card className={selected ? "border-primary" : undefined}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            {selecting && (
              <input type="checkbox" className="h-4 w-4 mt-1 accent-primary" checked={selected}
                aria-label={mortgage.name} onChange={() => onToggleSelect?.(mortgage.id)} />
            )}
            <div>
              <CardTitle>{mortgage.name}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{t("mortgage.effectiveFrom")}: {mortgage.effectiveFrom}</p>
            </div>
          </div>
          <div className="flex gap-1">
            {inGroup && !selecting && (
              <Button size="sm" variant="ghost" className="text-muted-foreground"
                onClick={() => update.mutate({ id: mortgage.id, groupName: "" })}>
                {t("mortgage.removeFromGroup")}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>{t("mortgage.edit")}</Button>
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
              onClick={() => window.confirm(t("mortgage.deleteConfirm")) && remove.mutate(mortgage.id)}>
              {t("mortgage.delete")}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {editing ? (
          <div className="grid grid-cols-2 gap-2 text-sm">
            {([
              ["name",                   t("mortgage.name"),      "text"],
              ["principalAmount",        t("mortgage.principal"), "number"],
              ["interestRate",           t("mortgage.rate"),      "number"],
              ["amortizationYears",      t("mortgage.years"),     "number"],
              ["monthlyPaymentOverride", t("mortgage.override"),  "number"],
              ["effectiveFrom",          t("mortgage.effectiveFrom"), "date"],
              ["notes",                  t("mortgage.notes"),     "text"],
            ] as const).map(([key, label, type]) => (
              <div key={key} className={`space-y-1 ${key === "notes" || key === "monthlyPaymentOverride" ? "col-span-2" : ""}`}>
                <label className="text-xs text-muted-foreground">{label}</label>
                <Input type={type} value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} className="h-7 text-xs" />
              </div>
            ))}
            <div className="col-span-2 flex gap-2 pt-1">
              <Button size="sm" onClick={save} disabled={update.isPending}>{t("mortgage.save")}</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>{t("mortgage.cancel")}</Button>
            </div>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="rounded-md border divide-y text-sm">
              {[
                { label: t("mortgage.principal"),      value: fmt(mortgage.principalAmount) },
                { label: t("mortgage.currentRate"),    value: `${mortgage.interestRate}%` },
                { label: t("mortgage.years"),          value: `${mortgage.amortizationYears} ${t("mortgage.yearsUnit")}` },
                { label: t("mortgage.monthlyAmort"),   value: fmt(amortization) },
                { label: t("mortgage.interestPortion"), value: fmt(interestMonth) },
                { label: t("mortgage.monthlyPayment"), value: fmt(monthlyPayment), bold: true },
                { label: t("mortgage.annualTotal"),    value: fmt(monthlyPayment * 12), bold: true },
              ].map(({ label, value, bold }) => (
                <div key={label} className="flex justify-between px-3 py-1.5">
                  <span className="text-muted-foreground">{label}</span>
                  <span className={`tabular-nums ${bold ? "font-bold" : "font-medium"}`}>{value}</span>
                </div>
              ))}
            </div>
            {mortgage.notes && (
              <p className="text-xs text-muted-foreground italic">{mortgage.notes}</p>
            )}
            {showForecast && !selecting && <RateForecast mortgage={mortgage} />}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Add mortgage form ─────────────────────────────────────────────────────────
function AddMortgageForm({ onDone }: { onDone: () => void }) {
  const create = useCreateMortgage();
  const { t } = useTranslation();
  const today = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState({
    name: "", principalAmount: "", interestRate: "",
    amortizationYears: "25", monthlyPaymentOverride: "",
    effectiveFrom: today, notes: "",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await create.mutateAsync({
      name:                   form.name,
      principalAmount:        parseFloat(form.principalAmount),
      interestRate:           parseFloat(form.interestRate),
      amortizationYears:      parseInt(form.amortizationYears),
      monthlyPaymentOverride: form.monthlyPaymentOverride ? parseFloat(form.monthlyPaymentOverride) : undefined,
      effectiveFrom:          form.effectiveFrom,
      notes:                  form.notes || undefined,
    });
    onDone();
  }

  return (
    <Card>
      <CardHeader><CardTitle>{t("mortgage.addMortgage")}</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid grid-cols-2 gap-3">
          {([
            ["name",                   t("mortgage.name"),      "text",   ""],
            ["principalAmount",        t("mortgage.principal"), "number", ""],
            ["interestRate",           t("mortgage.rate"),      "number", ""],
            ["amortizationYears",      t("mortgage.years"),     "number", ""],
            ["effectiveFrom",          t("mortgage.effectiveFrom"), "date", ""],
            ["monthlyPaymentOverride", t("mortgage.override"),  "number", "col-span-2"],
            ["notes",                  t("mortgage.notes"),     "text",   "col-span-2"],
          ] as const).map(([key, label, type, span]) => (
            <div key={key} className={`space-y-1 ${span}`}>
              <label className="text-xs text-muted-foreground">{label}</label>
              <Input type={type} value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                required={["name", "principalAmount", "interestRate", "amortizationYears", "effectiveFrom"].includes(key)}
              />
            </div>
          ))}
          <div className="col-span-2 flex gap-2 pt-1">
            <Button type="submit" disabled={create.isPending}>{t("mortgage.save")}</Button>
            <Button type="button" variant="ghost" onClick={onDone}>{t("mortgage.cancel")}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Group projection: combined monthly cost & balance at 1 / 5 / 10 years ──────
function GroupProjection({ loans, combined, hint }: {
  loans: Mortgage[];
  // When set, the group is projected as ONE loan (blended rate, combined
  // amortization) using the group's own forecast; otherwise per-loan forecasts.
  combined?: { rate: number; amort: number; changes: MortgageChange[] };
  hint: string;
}) {
  const { t } = useTranslation();
  const HORIZONS = [0, 12, 60, 120]; // now, 1yr, 5yr, 10yr (months)
  const maxMonth = 120;

  const totalNow = loans.reduce((s, m) => s + m.principalAmount, 0);
  const series = combined
    ? [projectSeries(totalNow, combined.rate, combined.amort, combined.changes, maxMonth)]
    : loans.map((m) => projectSeries(m.principalAmount, m.interestRate, loanAmort(m), loanChanges(m), maxMonth));

  const rows = HORIZONS.map((h) => {
    const monthlyCost = series.reduce((s, x) => s + (x.payment[h] ?? 0), 0);
    const balance = series.reduce((s, x) => s + (x.balance[h] ?? 0), 0);
    return { h, monthlyCost, balance, paidDown: totalNow - balance };
  });
  const nowCost = rows[0].monthlyCost;
  const hLabel = (h: number) => (h === 0 ? t("mortgage.now") : `+${h / 12} ${t("mortgage.yearsUnit")}`);

  return (
    <div className="rounded-md border bg-background text-sm overflow-hidden">
      <div className="px-3 py-2 border-b">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("mortgage.projection")}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="grid grid-cols-4 gap-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground border-b">
        <span>{t("mortgage.when")}</span>
        <span className="text-right">{t("mortgage.hMonthlyCost")}</span>
        <span className="text-right">{t("mortgage.hRemaining")}</span>
        <span className="text-right">{t("mortgage.hPaidDown")}</span>
      </div>
      {rows.map((r, i) => {
        const delta = r.monthlyCost - nowCost;
        return (
          <div key={r.h} className="grid grid-cols-4 gap-2 px-3 py-1.5 border-b last:border-0">
            <span className="text-muted-foreground">{hLabel(r.h)}</span>
            <span className="text-right tabular-nums">
              {fmt(r.monthlyCost)}
              {i > 0 && <span className={`ml-1 text-xs ${delta > 0 ? "text-red-600" : "text-green-600"}`}>({delta >= 0 ? "+" : ""}{fmt(delta)})</span>}
            </span>
            <span className="text-right tabular-nums">{fmt(r.balance)}</span>
            <span className="text-right tabular-nums text-green-700">{i === 0 ? "—" : fmt(r.paidDown)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── A group of loans (house / object / type) with combined totals ──────────────
function MortgageGroup({ name, loans, selecting, selected, onToggleSelect }: {
  name: string;
  loans: Mortgage[];
  selecting: boolean;
  selected: Set<number>;
  onToggleSelect: (id: number) => void;
}) {
  const { t } = useTranslation();
  const update = useUpdateMortgage();
  const [showProj, setShowProj] = useState(false);

  // Group forecast (mode + planned changes) lives in one app-settings JSON map.
  const { data: gf, isLoading: gfLoading } = useAppSetting(GROUP_FORECASTS_KEY);
  const setSetting = useSetAppSetting();
  const forecasts = parseGroupForecasts(gf?.value);
  const entry = forecasts[name] ?? {};
  // Default to ONE forecast for the whole group; fall back to per-loan when the
  // group has no plan of its own but its loans have saved forecasts.
  const hasPerLoan = loans.some((m) => loanChanges(m).length > 0);
  const mode: "combined" | "perLoan" =
    entry.mode ?? ((entry.changes?.length ?? 0) === 0 && hasPerLoan ? "perLoan" : "combined");

  function saveEntry(patch: GroupForecastEntry) {
    const next = { ...forecasts, [name]: { ...entry, ...patch } };
    return setSetting.mutateAsync({ key: GROUP_FORECASTS_KEY, value: JSON.stringify(next) });
  }

  async function ungroup() {
    if (!window.confirm(t("mortgage.ungroupConfirm"))) return;
    for (const m of loans) await update.mutateAsync({ id: m.id, groupName: "" });
    const next = { ...forecasts };
    delete next[name];
    setSetting.mutate({ key: GROUP_FORECASTS_KEY, value: JSON.stringify(next) });
  }

  const totalPrincipal = loans.reduce((s, m) => s + m.principalAmount, 0);
  const totalMonthly = loans.reduce((s, m) => s + loanMonthlyPayment(m), 0);
  const totalAmort = loans.reduce((s, m) => s + loanAmort(m), 0);
  const rates = loans.map((m) => m.interestRate);
  const minR = Math.min(...rates), maxR = Math.max(...rates);
  const wavg = totalPrincipal > 0
    ? Math.round((loans.reduce((s, m) => s + m.interestRate * m.principalAmount, 0) / totalPrincipal) * 100) / 100
    : 0;
  const diverging = maxR - minR > 0.001;
  const rateLabel = diverging ? `${minR}%–${maxR}% (${t("mortgage.rateAvg")} ${wavg.toFixed(2)}%)` : `${rates[0]}%`;

  const groupChanges = rowsToChanges(entry.changes ?? []);

  return (
    <div className="space-y-3">
      <Card className="border-primary/30">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="font-semibold">{name}</p>
              <p className="text-xs text-muted-foreground">{t("mortgage.loansCount", { count: loans.length })}</p>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={ungroup} disabled={update.isPending}>
                {t("mortgage.ungroupBtn")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowProj((v) => !v)}>{t("mortgage.groupForecastBtn")}</Button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
            <div>
              <p className="text-xs text-muted-foreground">{t("mortgage.groupTotalLoan")}</p>
              <p className="font-bold tabular-nums">{fmt(totalPrincipal)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("mortgage.groupRate")}</p>
              <p className={`font-medium tabular-nums ${diverging ? "text-amber-600" : ""}`}>{rateLabel}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("mortgage.groupMonthly")}</p>
              <p className="font-bold tabular-nums">{fmt(totalMonthly)}</p>
            </div>
          </div>

          {/* Group-level forecast: one plan for the whole group (default), or per loan */}
          {showProj && !gfLoading && (
            <div className="mt-3 space-y-4">
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant={mode === "combined" ? "default" : "outline"}
                  onClick={() => saveEntry({ mode: "combined" })} disabled={setSetting.isPending}>
                  {t("mortgage.forecastModeCombined")}
                </Button>
                <Button size="sm" variant={mode === "perLoan" ? "default" : "outline"}
                  onClick={() => saveEntry({ mode: "perLoan" })} disabled={setSetting.isPending}>
                  {t("mortgage.forecastModePerLoan")}
                </Button>
              </div>

              <GroupProjection
                loans={loans}
                combined={mode === "combined" ? { rate: wavg, amort: totalAmort, changes: groupChanges } : undefined}
                hint={mode === "combined" ? t("mortgage.combinedHint") : t("mortgage.projectionHint")}
              />

              {mode === "combined" ? (
                <ForecastEditor
                  principal={totalPrincipal}
                  rate={wavg}
                  baseAmort={totalAmort}
                  saved={JSON.stringify(entry.changes ?? [])}
                  saving={setSetting.isPending}
                  onSave={(json) => saveEntry({ changes: JSON.parse(json) })}
                />
              ) : (
                <div className="space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("mortgage.planPerLoan")}</p>
                  {loans.map((m) => (
                    <div key={m.id} className="space-y-1">
                      <p className="text-sm font-medium">{m.name}</p>
                      <RateForecast mortgage={m} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      {loans.map((m) => (
        <MortgageCard key={m.id} mortgage={m} showForecast={false} inGroup
          selecting={selecting} selected={selected.has(m.id)} onToggleSelect={onToggleSelect} />
      ))}
    </div>
  );
}

function groupMortgages(list: Mortgage[], ungrouped: string): [string, Mortgage[]][] {
  const map = new Map<string, Mortgage[]>();
  for (const m of list) {
    const key = m.groupName?.trim() || ungrouped;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }
  return [...map.entries()].sort((a, b) =>
    a[0] === ungrouped ? 1 : b[0] === ungrouped ? -1 : a[0].localeCompare(b[0]));
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function Mortgage() {
  const { data: mortgages, isLoading } = useMortgages();
  const update = useUpdateMortgage();
  const { t } = useTranslation();
  const [showAdd, setShowAdd] = useState(false);

  // Select-to-group: tick loans, name the group, confirm.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [groupInput, setGroupInput] = useState("");

  const ungroupedLabel = t("mortgage.ungrouped");
  const groups = groupMortgages(mortgages ?? [], ungroupedLabel);
  const groupNames = groups.map(([n]) => n).filter((n) => n !== ungroupedLabel);

  const toggleSelect = (id: number) =>
    setSelected((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });

  function stopSelecting() {
    setSelecting(false);
    setSelected(new Set());
    setGroupInput("");
  }

  async function applyGroup() {
    const gname = groupInput.trim();
    if (!gname || selected.size === 0) return;
    for (const id of selected) await update.mutateAsync({ id, groupName: gname });
    stopSelecting();
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("mortgage.title")}</h1>
        <div className="flex gap-2">
          {!selecting && (mortgages?.length ?? 0) >= 2 && (
            <Button variant="outline" onClick={() => setSelecting(true)}>{t("mortgage.groupLoansBtn")}</Button>
          )}
          {!showAdd && (
            <Button onClick={() => setShowAdd(true)}>{t("mortgage.addMortgage")}</Button>
          )}
        </div>
      </div>

      {selecting && (
        <Card className="border-primary/40">
          <CardContent className="pt-4 space-y-2">
            <p className="text-sm text-muted-foreground">{t("mortgage.groupSelectHint")}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Input list="mortgage-group-names" value={groupInput} className="h-9 w-64"
                placeholder={t("mortgage.groupNamePlaceholder")}
                onChange={(e) => setGroupInput(e.target.value)} />
              <datalist id="mortgage-group-names">
                {groupNames.map((n) => <option key={n} value={n} />)}
              </datalist>
              <span className="text-sm text-muted-foreground tabular-nums">{t("mortgage.selectedCount", { count: selected.size })}</span>
              <Button size="sm" onClick={applyGroup}
                disabled={!groupInput.trim() || selected.size === 0 || update.isPending}>
                {t("mortgage.createGroup")}
              </Button>
              <Button size="sm" variant="ghost" onClick={stopSelecting}>{t("mortgage.cancel")}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {showAdd && <AddMortgageForm onDone={() => setShowAdd(false)} />}

      {isLoading && <p className="text-muted-foreground">{t("common.loading")}</p>}

      {!isLoading && (!mortgages || mortgages.length === 0) && !showAdd && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <p>{t("mortgage.noMortgages")}</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-8">
        {groups.map(([name, loans]) =>
          name === ungroupedLabel
            // Ungrouped loans stand alone, each with its own forecast.
            ? loans.map((m) => (
                <MortgageCard key={m.id} mortgage={m} showForecast
                  selecting={selecting} selected={selected.has(m.id)} onToggleSelect={toggleSelect} />
              ))
            // Named groups plan their forecast at the group level.
            : <MortgageGroup key={name} name={name} loans={loans}
                selecting={selecting} selected={selected} onToggleSelect={toggleSelect} />,
        )}
      </div>
    </div>
  );
}
